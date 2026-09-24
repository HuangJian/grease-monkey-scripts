/**
 * RSS source editor form.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { numberOrDefault } from '../../../utils'
import { validateConfig } from '../../config'
import { createEditorFactory } from '../../editor-helpers/createEditorFactory'
import { ArrowDownIcon, ArrowUpIcon, DeleteIcon } from '../../shared/icons'
import { EditorListToolbar } from '../../editor-helpers/list-toolbar'
import { feedStatusLabel, loadFeedStatuses, type FeedFetchStatus } from './status'
import {
  fieldLabel,
  readNumberFields,
  saveConfigSection,
  saveSourceSettings,
  toFieldRule,
} from '../../editor-helpers'
import {
  FEEDS_PER_PAGE,
  FEED_STATUS_LABELS,
  FEED_STATUSES,
  filterFeeds,
  pageCount,
  pageOf,
  type FeedStatus,
} from './list-toolbar'
import { downloadText, readTextFile } from '../../export-import'
import type {
  BadgeType,
  SourceEditor,
  SourceEditorContext,
  SourceEditorResult,
  SourceSettings,
} from '../../types'
import { buildOpml, mergeImportedFeeds, parseOpml } from '../opml'
import type { RssFeedConfig, RssSourceOptions, RssViewMode } from '../types'
import { ADVANCED_FIELDS } from './types'
import { hostnameFor, loadFreshOptions } from './helpers'

type RssEditorFormProps = {
  fresh: RssSourceOptions
  /** Fetch state per feed url, read from the cache when the editor opened. */
  statuses: Map<string, FeedFetchStatus>
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

/**
 * Selected urls restricted to the rows currently in view.
 *
 * Bulk actions operate on what the reader can see: a selection made before the
 * query changed should not reach rows the filter is now hiding.
 */
function selectedUrlsIn(
  selected: ReadonlySet<string>,
  visibleUrls: ReadonlyArray<string>,
): string[] {
  return visibleUrls.filter((url) => selected.has(url))
}

export function RssEditorForm({ fresh, statuses, settings, ctx, handleRef }: RssEditorFormProps) {
  const [feeds, setFeeds] = useState<RssFeedConfig[]>(() => fresh.feeds.map((f) => ({ ...f })))
  const [error, setError] = useState('')
  const [advanced, setAdvanced] = useState<Record<string, number>>(() =>
    ADVANCED_FIELDS.reduce(
      (out, f) => {
        out[f.prop] = numberOrDefault((fresh as Record<string, unknown>)[f.prop], 0)
        return out
      },
      {} as Record<string, number>,
    ),
  )
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  const [viewMode, setViewMode] = useState<RssViewMode>(fresh.viewMode)
  const [respectFeedPeriod, setRespectFeedPeriod] = useState(fresh.respectFeedPeriod)
  const [notice, setNotice] = useState('')
  /** List controls. Keyed by url, not index — filtering renumbers the rows. */
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<FeedStatus>('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  /** An unanswered bulk delete, awaiting the inline confirmation. */
  const [confirmRemove, setConfirmRemove] = useState(false)
  /** Unapplied url edits, keyed by the url they would replace. */
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({})
  /**
   * The saved state `isDirty` compares against. Reset after a successful save,
   * so closing right after saving does not ask the reader to confirm.
   */
  const baselineRef = useRef('')
  const urlRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const setFeedField = useCallback((index: number, patch: Partial<RssFeedConfig>) => {
    setFeeds((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }, [])

  /** One clock reading per render, shared by every row's status line. */
  const now = ctx.runtime.now()

  const visible = filterFeeds(
    feeds,
    query,
    status,
    // A paused feed is not failing — it is not being tried. Same rule the row
    // status line uses to decide whether to raise an alarm.
    (feed) => feed.enabled !== false && (statuses.get(feed.url)?.error ?? '') !== '',
  )
  const pages = pageCount(visible.length, FEEDS_PER_PAGE)
  const currentPage = Math.min(page, pages - 1)
  const rows = pageOf(visible, currentPage, FEEDS_PER_PAGE)
  const visibleUrls = visible.map((f) => f.url)
  const selectedVisible = selectedUrlsIn(selected, visibleUrls)
  /** Index in the unfiltered list, for the ↑↓ handlers. */
  const indexByUrl = new Map(feeds.map((f, i) => [f.url, i] as const))

  /**
   * Rename a url in a url-keyed set — the row's identity moves with it.
   */
  function renameKey(set: ReadonlySet<string>, from: string, to: string): ReadonlySet<string> {
    if (!set.has(from)) return set
    const next = new Set(set)
    next.delete(from)
    next.add(to)
    return next
  }

  /**
   * An edited url is applied on blur / Enter, not on every keystroke: the url is
   * the row's key, so rewriting it mid-typing would remount the row under the
   * cursor and drop its selection.
   */
  function commitUrl(oldUrl: string) {
    const draft = urlDrafts[oldUrl]
    if (draft === undefined) return
    const next = draft.trim()
    setUrlDrafts((prev) => {
      const { [oldUrl]: _dropped, ...rest } = prev
      return rest
    })
    if (!next || next === oldUrl) return
    if (!hostnameFor(next)) {
      setError('URL 格式无效')
      return
    }
    if (feeds.some((f) => f.url === next)) {
      setError('该订阅源已在列表中')
      return
    }
    setError('')
    setFeeds((prev) => prev.map((f) => (f.url === oldUrl ? { ...f, url: next } : f)))
    setSelected((prev) => renameKey(prev, oldUrl, next))
    setExpanded((prev) => renameKey(prev, oldUrl, next))
  }

  function toggleSelected(url: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(url)) next.add(url)
      return next
    })
  }

  function toggleExpanded(url: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(url)) next.add(url)
      return next
    })
  }

  function setEnabledForSelected(enabled: boolean) {
    const urls = new Set(selectedVisible)
    setFeeds((prev) => prev.map((f) => (urls.has(f.url) ? { ...f, enabled } : f)))
    setNotice(`已${enabled ? '启用' : '停用'} ${urls.size} 个源`)
  }

  /**
   * Two-step delete: the confirmation lives inside the form, so it needs no
   * channel through the dialog and cannot be answered by a stray click.
   */
  function removeSelected() {
    const urls = new Set(selectedVisible)
    if (urls.size === 0) return
    setFeeds((prev) => prev.filter((f) => !urls.has(f.url)))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const url of urls) next.delete(url)
      return next
    })
    setConfirmRemove(false)
    setNotice(`已删除 ${urls.size} 个源`)
  }

  const removeFeed = useCallback((index: number) => {
    setFeeds((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const moveFeed = useCallback((index: number, dir: -1 | 1) => {
    setFeeds((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }, [])

  const handleAdd = useCallback(() => {
    setError('')
    const url = (urlRef.current?.value ?? '').trim()
    const title = (titleRef.current?.value ?? '').trim()
    if (!url) {
      setError('请输入订阅源 URL')
      return
    }
    if (!hostnameFor(url)) {
      setError('URL 格式无效')
      return
    }
    if (feeds.some((f) => f.url === url)) {
      setError('该订阅源已在列表中')
      return
    }
    setFeeds((prev) => [...prev, { url, title }])
    if (urlRef.current) urlRef.current.value = ''
    if (titleRef.current) titleRef.current.value = ''
  }, [feeds])

  const handleExport = useCallback(() => {
    downloadText(ctx.runtime, buildOpml(feeds), 'gm-rss-subscriptions.opml', 'text/x-opml')
  }, [feeds, ctx.runtime])

  const handleImport = useCallback(
    async (e: Event) => {
      const input = e.target as HTMLInputElement
      const file = input.files?.[0]
      if (!file) return
      setError('')
      setNotice('')
      try {
        const text = await readTextFile(file)
        const imported = parseOpml(text, new ctx.runtime.DOMParser())
        const outcome = mergeImportedFeeds(feeds, imported)
        setFeeds(outcome.feeds)
        setNotice(`导入完成：新增 ${outcome.added} 个，跳过 ${outcome.skipped} 个`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        input.value = ''
      }
    },
    [feeds, ctx.runtime],
  )

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd],
  )

  /**
   * What `isDirty` compares: the rows, the visible settings, and the advanced
   * numbers as they currently stand in their inputs (they live in the DOM, not
   * in state — see `advancedRefs`).
   */
  function snapshot(): string {
    const advancedValues = advancedRefs.current.map((input) => input?.value ?? '')
    return JSON.stringify({
      feeds,
      tabTitle,
      priority,
      badgeType,
      viewMode,
      respectFeedPeriod,
      advanced: advancedValues,
    })
  }

  // Taken after mount, not during render: the advanced inputs do not exist yet
  // on the first render, and a baseline captured then would be permanently
  // "different" from every later snapshot.
  useLayoutEffect(() => {
    if (baselineRef.current === '') baselineRef.current = snapshot()
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      // A hundred rows need the room, and silently discarding edits to them
      // is worse than asking once.
      size: 'lg',
      isDirty: () => snapshot() !== baselineRef.current,
      save() {
        setError('')
        const inputs = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          ADVANCED_FIELDS.map((f, i) => toFieldRule(inputs[i]!, f)),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const rss: RssSourceOptions = {
          feeds: feeds.map((f) => ({ ...f })),
          ttlMinutes: Math.round(nums[0]!),
          retentionDays: Math.round(nums[1]!),
          maxItemsPerFeed: Math.round(nums[2]!),
          viewMode,
          respectFeedPeriod,
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'rss',
          section: rss,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'rss', { tabTitle, priority, badgeType })
            // Closing now must not ask about changes that were just saved — the
            // advanced inputs keep the typed text (30.4) while the config holds
            // the rounded value (30).
            baselineRef.current = snapshot()
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [feeds, advanced, tabTitle, priority, badgeType, viewMode, respectFeedPeriod])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-source-settings">
        <label class="gm-sp-editor-row">
          <span>Tab 标题</span>
          <input
            type="text"
            class="gm-sp-input"
            placeholder="留空使用默认"
            value={tabTitle}
            onInput={(e) => setTabTitle((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>优先级</span>
          <input
            type="number"
            class="gm-sp-input"
            value={priority}
            onInput={(e) => setPriority(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>Badge 显示</span>
          <select
            class="gm-sp-input"
            value={badgeType}
            onChange={(e) => setBadgeType((e.target as HTMLSelectElement).value as BadgeType)}
          >
            <option value="default">默认</option>
            <option value="none">不显示</option>
            <option value="allUnread">全部未读数</option>
          </select>
        </label>
        <label class="gm-sp-editor-row">
          <span>列表视图</span>
          <select
            class="gm-sp-input"
            data-action="view-mode"
            value={viewMode}
            onChange={(e) => setViewMode((e.target as HTMLSelectElement).value as RssViewMode)}
          >
            <option value="grouped">按订阅源分组</option>
            <option value="timeline">全局时间线</option>
          </select>
        </label>
      </div>

      <EditorListToolbar
        query={query}
        onQuery={(value) => {
          setQuery(value)
          setPage(0)
        }}
        queryPlaceholder="搜索标题或 URL"
        status={status}
        onStatus={(value) => {
          setStatus(value)
          setPage(0)
        }}
        statusOptions={FEED_STATUSES.map((value) => ({ value, label: FEED_STATUS_LABELS[value] }))}
        counter={
          visible.length === feeds.length
            ? `共 ${feeds.length} 个源`
            : `共 ${feeds.length} · 命中 ${visible.length}`
        }
        page={currentPage}
        pageCount={pages}
        onPage={setPage}
        selection={{
          selectedCount: selectedVisible.length,
          allSelected: visible.length > 0 && selectedVisible.length === visible.length,
          onSelectAll: (checked) => {
            setSelected(checked ? new Set(visibleUrls) : new Set())
          },
          actions: [
            {
              label: '启用',
              action: 'bulk-enable',
              onClick: () => setEnabledForSelected(true),
            },
            {
              label: '停用',
              action: 'bulk-disable',
              onClick: () => setEnabledForSelected(false),
            },
            { label: '删除', action: 'bulk-remove', onClick: () => setConfirmRemove(true) },
          ],
        }}
      />

      {confirmRemove ? (
        <div class="gm-sp-editor-confirm-inline" data-action="bulk-remove-guard">
          <span>{`删除选中的 ${selectedVisible.length} 个订阅源？该操作不可撤销。`}</span>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-danger"
            data-action="bulk-remove-confirm"
            onClick={removeSelected}
          >
            删除
          </button>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn"
            onClick={() => setConfirmRemove(false)}
          >
            取消
          </button>
        </div>
      ) : null}

      <div class="gm-sp-editor-list">
        {rows.length === 0 ? (
          <div class="gm-sp-editor-empty">
            {feeds.length === 0 ? '尚未添加订阅源' : '没有符合条件的订阅源'}
          </div>
        ) : (
          rows.map((feed) => {
            const index = indexByUrl.get(feed.url) ?? -1
            const open = expanded.has(feed.url)
            return (
              <div
                class={`gm-sp-editor-item gm-sp-re-feed${open ? ' gm-sp-re-feed-open' : ''}`}
                key={feed.url}
                data-feed-url={feed.url}
              >
                <label
                  class="gm-sp-re-feed-pick"
                  data-action="feed-pick-wrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    data-action="feed-pick"
                    checked={selected.has(feed.url)}
                    onChange={() => toggleSelected(feed.url)}
                  />
                </label>
                {/* The ▸ is an indicator; the whole row is the click target. */}
                <span class="gm-sp-re-feed-toggle" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                <span
                  class="gm-sp-re-feed-name"
                  data-action="feed-name"
                  title={feed.url}
                  onClick={() => toggleExpanded(feed.url)}
                >
                  {feed.title || feed.url}
                </span>
                {(() => {
                  const label = feedStatusLabel(statuses.get(feed.url), now)
                  // A disabled feed is not being fetched, so a red alarm would be
                  // shouting about something the reader already decided to stop.
                  // The text stays (it is history); only the alarm colour goes.
                  const alarming = label.failed && feed.enabled !== false
                  return (
                    <span
                      class="gm-sp-re-feed-status"
                      data-action="feed-status"
                      data-failed={alarming ? 'true' : undefined}
                      title={label.detail}
                    >
                      {label.text}
                    </span>
                  )
                })()}
                <label class="gm-sp-re-feed-enabled">
                  <input
                    type="checkbox"
                    checked={feed.enabled !== false}
                    onInput={(e) =>
                      setFeedField(index, { enabled: (e.target as HTMLInputElement).checked })
                    }
                  />
                  <span>启用</span>
                </label>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move up"
                  disabled={index <= 0}
                  onClick={() => moveFeed(index, -1)}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move down"
                  disabled={index >= feeds.length - 1}
                  onClick={() => moveFeed(index, 1)}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-remove"
                  aria-label="remove feed"
                  onClick={() => removeFeed(index)}
                >
                  <DeleteIcon />
                </button>
                {open ? (
                  <div class="gm-sp-re-feed-detail">
                    <label class="gm-sp-editor-row">
                      <span>标题</span>
                      <input
                        type="text"
                        class="gm-sp-input gm-sp-re-feed-title"
                        placeholder="自定义标题（可选）"
                        value={feed.title}
                        onInput={(e) =>
                          setFeedField(index, { title: (e.target as HTMLInputElement).value })
                        }
                      />
                    </label>
                    <label class="gm-sp-editor-row">
                      <span>URL</span>
                      <input
                        type="url"
                        class="gm-sp-input gm-sp-re-feed-url-input"
                        data-action="feed-url"
                        value={urlDrafts[feed.url] ?? feed.url}
                        onInput={(e) =>
                          setUrlDrafts((prev) => ({
                            ...prev,
                            [feed.url]: (e.target as HTMLInputElement).value,
                          }))
                        }
                        onBlur={() => commitUrl(feed.url)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitUrl(feed.url)
                          }
                        }}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div class="gm-sp-editor-form-stacked">
        <label class="gm-sp-editor-row">
          <span>标题（可选）</span>
          <input
            ref={titleRef}
            type="text"
            class="gm-sp-input"
            placeholder="留空使用 feed 自带标题"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>订阅源 URL</span>
          <input
            ref={urlRef}
            type="url"
            class="gm-sp-input"
            placeholder="https://example.com/feed.xml"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <button
          type="button"
          class="gm-sp-btn gm-sp-editor-btn"
          data-action="add-feed"
          onClick={handleAdd}
        >
          添加订阅源
        </button>
      </div>

      <div class="gm-sp-editor-row gm-sp-re-opml">
        <button
          type="button"
          class="gm-sp-btn gm-sp-editor-btn"
          data-action="export-opml"
          onClick={handleExport}
        >
          导出 OPML
        </button>
        <label class="gm-sp-editor-row">
          <span>导入 OPML</span>
          <input
            type="file"
            class="gm-sp-input"
            accept=".opml,.xml,text/xml"
            data-action="import-opml"
            onChange={handleImport}
          />
        </label>
        {notice ? (
          <span class="gm-sp-re-notice" data-action="import-notice">
            {notice}
          </span>
        ) : null}
      </div>

      <div class="gm-sp-editor-advanced">
        {ADVANCED_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{fieldLabel(f)}</span>
            <input
              ref={(el) => {
                advancedRefs.current[i] = el
              }}
              type="number"
              class="gm-sp-input"
              min={f.min}
              value={advanced[f.prop]}
              onInput={(e) =>
                setAdvanced((prev) => ({
                  ...prev,
                  [f.prop]: Number((e.target as HTMLInputElement).value),
                }))
              }
            />
          </label>
        ))}
        <label
          class="gm-sp-editor-row"
          title="开启后，声明了更长周期的订阅源按其自身周期抓取（如日报一天一次）；关闭后所有源统一按「最小抓取间隔」抓取。"
        >
          <span>遵循源声明周期</span>
          <input
            type="checkbox"
            data-action="respect-feed-period"
            checked={respectFeedPeriod}
            onInput={(e) => setRespectFeedPeriod((e.target as HTMLInputElement).checked)}
          />
        </label>
      </div>

      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createRssEditor(options: RssSourceOptions, settings: SourceSettings): SourceEditor {
  return createEditorFactory(
    // The config says what the reader subscribed to; the cache says how each
    // feed is actually doing. Both are needed for the row status line.
    async (runtime) => ({
      fresh: await loadFreshOptions(runtime, options),
      statuses: await loadFeedStatuses(runtime),
    }),
    RssEditorForm,
    (loaded) => ({ fresh: loaded.fresh, statuses: loaded.statuses, settings }),
  )
}
