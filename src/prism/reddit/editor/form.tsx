import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { numberOrDefault } from '../../../utils'
import { validateConfig } from '../../config'
import { createEditorFactory } from '../../editor-helpers/createEditorFactory'
import {
  readNumberFields,
  saveConfigSection,
  saveSourceSettings,
  fieldLabel,
  toFieldRule,
} from '../../editor-helpers'
import { SourceSettingsFields } from '../../editor-ui'
import { EditorListToolbar } from '../../editor-helpers/list-toolbar'
import { useRowBrowser } from '../../editor-helpers/useRowBrowser'
import { ArrowDownIcon, ArrowUpIcon, DeleteIcon } from '../../shared/icons'
import type { SourceEditorContext, SourceEditorResult, SourceSettings } from '../../types'
import { normalizeSubredditName } from '../parser'
import type { RedditSourceOptions } from '../types'
import { loadFreshRedditOptions } from '../options'
import { FORM_FIELDS } from './types'

/** Subscriptions per page — a few dozen at once is what made the chip wall unreadable. */
const SUBS_PER_PAGE = 30

/** Module-level so the hook's memo dependency stays stable. */
function matchesSub(sub: string, needle: string): boolean {
  return sub.toLowerCase().includes(needle)
}

type RedditEditorFormProps = {
  fresh: RedditSourceOptions
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

export function RedditEditorForm({ fresh, settings, ctx, handleRef }: RedditEditorFormProps) {
  const [subs, setSubs] = useState<string[]>(() =>
    fresh.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0),
  )
  const [error, setError] = useState('')
  /** Unapplied renames, keyed by the subreddit they would replace. */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const addRef = useRef<HTMLInputElement>(null)
  const browser = useRowBrowser(subs, SUBS_PER_PAGE, matchesSub)
  const selectedSubs = subs.filter((sub) => browser.selected.has(sub))

  const moveSub = useCallback((index: number, dir: -1 | 1) => {
    setSubs((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }, [])

  /** A rename is applied on blur: the name is the row's key. */
  const commitRename = useCallback(
    (oldSub: string) => {
      const draft = drafts[oldSub]
      if (draft === undefined) return
      const next = normalizeSubredditName(draft)
      setDrafts((prev) => {
        const { [oldSub]: _dropped, ...rest } = prev
        return rest
      })
      if (!next || next === oldSub) return
      if (subs.includes(next)) {
        setError(`r/${next} 已在列表中`)
        return
      }
      setError('')
      setSubs((prev) => prev.map((sub) => (sub === oldSub ? next : sub)))
      browser.renameKey(oldSub, next)
    },
    [subs, drafts, browser],
  )

  const commitAdd = useCallback(() => {
    const normalized = normalizeSubredditName(addRef.current?.value ?? '')
    if (!normalized) {
      setError('请输入有效的 subreddit 名称')
      return
    }
    if (subs.includes(normalized)) {
      setError(`r/${normalized} 已在列表中`)
      return
    }
    setError('')
    setSubs((prev) => [...prev, normalized])
    if (addRef.current) addRef.current.value = ''
  }, [subs])
  const [advanced, setAdvanced] = useState<Record<string, number>>(() =>
    FORM_FIELDS.reduce(
      (out, f) => {
        const val = (fresh as Record<string, unknown>)[f.prop]
        out[f.prop] = numberOrDefault(val, 0)
        return out
      },
      {} as Record<string, number>,
    ),
  )
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      // Subreddit lists grow to dozens; the toolbar and paging need room.
      size: 'lg',
      save() {
        setError('')
        if (subs.length === 0) {
          setError('至少添加一个 subreddit')
          return
        }
        const inputList = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          FORM_FIELDS.map((f, i) => toFieldRule(inputList[i]!, f)),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const reddit: RedditSourceOptions = {
          ttlMinutes: Math.round(nums[0]!),
          retentionDays: Math.round(nums[1]!),
          todayMinComments: Math.round(nums[2]!),
          olderMinComments: Math.round(nums[3]!),
          ageHalfLifeDays: nums[4]!,
          subreddits: [...subs],
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'reddit',
          section: reddit,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'reddit', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [subs, advanced, tabTitle, priority, badgeType])

  return (
    <div class="gm-sp-editor">
      <SourceSettingsFields
        tabTitle={tabTitle}
        onTabTitleChange={setTabTitle}
        priority={priority}
        onPriorityChange={setPriority}
        badgeType={badgeType}
        onBadgeTypeChange={setBadgeType}
      />
      <EditorListToolbar
        query={browser.query}
        onQuery={browser.setQuery}
        queryPlaceholder="搜索 subreddit"
        counter={
          browser.visible.length === subs.length
            ? `共 ${subs.length} 个订阅`
            : `共 ${subs.length} · 命中 ${browser.visible.length}`
        }
        page={browser.page}
        pageCount={browser.pages}
        onPage={browser.setPage}
        selection={{
          selectedCount: selectedSubs.length,
          allSelected: browser.visible.length > 0 && selectedSubs.length === browser.visible.length,
          onSelectAll: (checked) =>
            browser.setSelected(checked ? new Set(browser.visible) : new Set()),
          actions: [
            { label: '删除', action: 'bulk-remove', onClick: () => browser.setConfirmRemove(true) },
          ],
        }}
      />

      {browser.confirmRemove ? (
        <div class="gm-sp-editor-confirm-inline" data-action="bulk-remove-guard">
          <span>{`删除选中的 ${selectedSubs.length} 个订阅？该操作不可撤销。`}</span>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-danger"
            data-action="bulk-remove-confirm"
            onClick={() => {
              setSubs((prev) => prev.filter((sub) => !browser.selected.has(sub)))
              browser.setSelected(new Set())
              browser.setConfirmRemove(false)
            }}
          >
            删除
          </button>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn"
            onClick={() => browser.setConfirmRemove(false)}
          >
            取消
          </button>
        </div>
      ) : null}

      <div class="gm-sp-editor-list">
        {browser.rows.length === 0 ? (
          <div class="gm-sp-editor-empty">
            {subs.length === 0 ? '尚未添加 subreddit' : '没有符合条件的订阅'}
          </div>
        ) : (
          browser.rows.map((sub) => {
            const index = subs.indexOf(sub)
            const open = browser.expanded.has(sub)
            return (
              <div
                class={`gm-sp-editor-item gm-sp-re-row${open ? ' gm-sp-re-row-open' : ''}`}
                key={sub}
                data-sub={sub}
              >
                <label class="gm-sp-re-row-pick">
                  <input
                    type="checkbox"
                    data-action="sub-pick"
                    checked={browser.selected.has(sub)}
                    onChange={() => browser.toggleSelected(sub)}
                  />
                </label>
                <button
                  type="button"
                  class="gm-sp-re-feed-toggle"
                  data-action="sub-toggle"
                  aria-expanded={open}
                  title={open ? '收起' : '展开改名'}
                  onClick={() => browser.toggleExpanded(sub)}
                >
                  {open ? '▾' : '▸'}
                </button>
                <span
                  class="gm-sp-re-row-name"
                  data-action="sub-name"
                  title={`r/${sub}`}
                  onClick={() => browser.toggleExpanded(sub)}
                >
                  r/{sub}
                </span>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move up"
                  disabled={index <= 0}
                  onClick={() => moveSub(index, -1)}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move down"
                  disabled={index >= subs.length - 1}
                  onClick={() => moveSub(index, 1)}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-remove"
                  aria-label="remove"
                  onClick={() => setSubs((prev) => prev.filter((_, j) => j !== index))}
                >
                  <DeleteIcon />
                </button>
                {open ? (
                  <div class="gm-sp-re-row-detail">
                    <label class="gm-sp-editor-row">
                      <span>Subreddit</span>
                      <input
                        type="text"
                        class="gm-sp-input"
                        data-action="sub-rename"
                        value={drafts[sub] ?? sub}
                        onInput={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [sub]: (e.target as HTMLInputElement).value,
                          }))
                        }
                        onBlur={() => commitRename(sub)}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
      <div class="gm-sp-editor-add-row">
        <input
          ref={addRef}
          type="text"
          class="gm-sp-input gm-sp-editor-input"
          placeholder="r/funny 或 funny"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitAdd()
            }
          }}
        />
        <button
          type="button"
          class="gm-sp-btn gm-sp-editor-btn"
          data-action="add-sub"
          onClick={commitAdd}
        >
          添加
        </button>
      </div>
      <div class="gm-sp-editor-form">
        {FORM_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{fieldLabel(f)}</span>
            <input
              ref={(el) => {
                advancedRefs.current[i] = el
              }}
              type="number"
              class="gm-sp-input"
              min={f.min}
              max={f.max}
              value={advanced[f.prop]}
              onInput={(e) =>
                onAdvancedChange(f.prop, Number((e.target as HTMLInputElement).value))
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

export function createRedditEditor(options: RedditSourceOptions, settings: SourceSettings) {
  return createEditorFactory(
    (runtime) => loadFreshRedditOptions(runtime, options),
    RedditEditorForm,
    (fresh) => ({ fresh, settings }),
  )
}
