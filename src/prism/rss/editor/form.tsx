/**
 * RSS source editor form.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { numberOrDefault } from '../../../utils'
import { validateConfig } from '../../config'
import { createEditorFactory } from '../../editor-helpers/createEditorFactory'
import {
  fieldLabel,
  readNumberFields,
  saveConfigSection,
  saveSourceSettings,
  toFieldRule,
} from '../../editor-helpers'
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
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

export function RssEditorForm({ fresh, settings, ctx, handleRef }: RssEditorFormProps) {
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
  const [notice, setNotice] = useState('')
  const urlRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const setFeedField = useCallback((index: number, patch: Partial<RssFeedConfig>) => {
    setFeeds((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }, [])

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

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
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
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'rss',
          section: rss,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'rss', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [feeds, advanced, tabTitle, priority, badgeType, viewMode])

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

      <div class="gm-sp-editor-list">
        {feeds.length === 0 ? (
          <div class="gm-sp-editor-empty">尚未添加订阅源</div>
        ) : (
          feeds.map((feed, index) => (
            <div class="gm-sp-editor-item gm-sp-re-feed" key={feed.url}>
              <input
                type="text"
                class="gm-sp-input gm-sp-re-feed-title"
                placeholder="自定义标题（可选）"
                value={feed.title}
                onInput={(e) =>
                  setFeedField(index, { title: (e.target as HTMLInputElement).value })
                }
              />
              <span class="gm-sp-re-feed-url" title={feed.url}>
                {feed.url}
              </span>
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
                disabled={index === 0}
                onClick={() => moveFeed(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="gm-sp-item-move"
                aria-label="move down"
                disabled={index === feeds.length - 1}
                onClick={() => moveFeed(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                class="gm-sp-item-remove"
                aria-label="remove feed"
                onClick={() => removeFeed(index)}
              >
                ×
              </button>
            </div>
          ))
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
      </div>

      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createRssEditor(options: RssSourceOptions, settings: SourceSettings): SourceEditor {
  return createEditorFactory(
    (runtime) => loadFreshOptions(runtime, options),
    RssEditorForm,
    (fresh) => ({ fresh, settings }),
  )
}
