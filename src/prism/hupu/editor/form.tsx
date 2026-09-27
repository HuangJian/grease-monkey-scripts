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
import { normalizeBoardSlug } from '../parser'
import type { HupuSourceOptions } from '../types'
import { loadFreshHupuOptions } from '../options'
import { FORM_FIELDS } from './types'

/** Boards per page — a few dozen at once is what made the old chip wall unreadable. */
const BOARDS_PER_PAGE = 30

/** Query matching is a module-level function so the hook's memo stays stable. */
function matchesBoard(board: string, needle: string): boolean {
  return board.toLowerCase().includes(needle)
}

type HupuEditorFormProps = {
  fresh: HupuSourceOptions
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

export function HupuEditorForm({ fresh, settings, ctx, handleRef }: HupuEditorFormProps) {
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  const [boards, setBoards] = useState<string[]>(() =>
    fresh.boards.map(normalizeBoardSlug).filter((s) => s.length > 0),
  )
  const [error, setError] = useState('')
  /** Unapplied renames, keyed by the board name they would replace. */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const addRef = useRef<HTMLInputElement>(null)
  const browser = useRowBrowser(boards, BOARDS_PER_PAGE, matchesBoard)
  const selectedBoards = boards.filter((board) => browser.selected.has(board))

  const moveBoard = useCallback((index: number, dir: -1 | 1) => {
    setBoards((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }, [])

  /** A rename is applied on blur: the name is the row's key. */
  const commitRename = useCallback(
    (oldBoard: string) => {
      const draft = drafts[oldBoard]
      if (draft === undefined) return
      const next = normalizeBoardSlug(draft)
      setDrafts((prev) => {
        const { [oldBoard]: _dropped, ...rest } = prev
        return rest
      })
      if (!next || next === oldBoard) return
      if (boards.includes(next)) {
        setError(`${next} 已在列表中`)
        return
      }
      setError('')
      setBoards((prev) => prev.map((b) => (b === oldBoard ? next : b)))
      browser.renameKey(oldBoard, next)
    },
    [boards, drafts, browser],
  )

  const commitAdd = useCallback(() => {
    const normalized = normalizeBoardSlug(addRef.current?.value ?? '')
    if (!normalized) {
      setError('请输入有效的版块标识')
      return
    }
    if (boards.includes(normalized)) {
      setError(`${normalized} 已在列表中`)
      return
    }
    setError('')
    setBoards((prev) => [...prev, normalized])
    if (addRef.current) addRef.current.value = ''
  }, [boards])
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
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      // Board lists grow to dozens; the toolbar and paging need room.
      size: 'lg',
      save() {
        setError('')
        if (boards.length === 0) {
          setError('至少添加一个版块')
          return
        }
        const inputList = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          FORM_FIELDS.map((f, i) => toFieldRule(inputList[i]!, f)),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const hupu: HupuSourceOptions = {
          ttlMinutes: Math.round(nums[0]!),
          retentionDays: Math.round(nums[1]!),
          todayMinReplies: Math.round(nums[2]!),
          olderMinReplies: Math.round(nums[3]!),
          ageHalfLifeDays: nums[4]!,
          lightsWeight: nums[5]!,
          repliesWeight: nums[6]!,
          boards: [...boards],
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'hupu',
          section: hupu,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'hupu', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [boards, advanced, tabTitle, priority, badgeType])

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
        queryPlaceholder="搜索版块"
        counter={
          browser.visible.length === boards.length
            ? `共 ${boards.length} 个版块`
            : `共 ${boards.length} · 命中 ${browser.visible.length}`
        }
        page={browser.page}
        pageCount={browser.pages}
        onPage={browser.setPage}
        selection={{
          selectedCount: selectedBoards.length,
          allSelected:
            browser.visible.length > 0 && selectedBoards.length === browser.visible.length,
          onSelectAll: (checked) =>
            browser.setSelected(checked ? new Set(browser.visible) : new Set()),
          actions: [
            { label: '删除', action: 'bulk-remove', onClick: () => browser.setConfirmRemove(true) },
          ],
        }}
      />

      {browser.confirmRemove ? (
        <div class="gm-sp-editor-confirm-inline" data-action="bulk-remove-guard">
          <span>{`删除选中的 ${selectedBoards.length} 个版块？该操作不可撤销。`}</span>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-danger"
            data-action="bulk-remove-confirm"
            onClick={() => {
              setBoards((prev) => prev.filter((b) => !browser.selected.has(b)))
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
            {boards.length === 0 ? '尚未添加版块' : '没有符合条件的版块'}
          </div>
        ) : (
          browser.rows.map((board) => {
            const index = boards.indexOf(board)
            const open = browser.expanded.has(board)
            return (
              <div
                class={`gm-sp-editor-item gm-sp-hu-board${open ? ' gm-sp-hu-board-open' : ''}`}
                key={board}
                data-board={board}
              >
                <label class="gm-sp-hu-board-pick">
                  <input
                    type="checkbox"
                    data-action="board-pick"
                    checked={browser.selected.has(board)}
                    onChange={() => browser.toggleSelected(board)}
                  />
                </label>
                <button
                  type="button"
                  class="gm-sp-re-feed-toggle"
                  data-action="board-toggle"
                  aria-expanded={open}
                  title={open ? '收起' : '展开改名'}
                  onClick={() => browser.toggleExpanded(board)}
                >
                  {open ? '▾' : '▸'}
                </button>
                <span
                  class="gm-sp-hu-board-name"
                  data-action="board-name"
                  title={board}
                  onClick={() => browser.toggleExpanded(board)}
                >
                  {board}
                </span>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move up"
                  disabled={index <= 0}
                  onClick={() => moveBoard(index, -1)}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move down"
                  disabled={index >= boards.length - 1}
                  onClick={() => moveBoard(index, 1)}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-remove"
                  aria-label="remove"
                  onClick={() => setBoards((prev) => prev.filter((_, j) => j !== index))}
                >
                  <DeleteIcon />
                </button>
                {open ? (
                  <div class="gm-sp-hu-board-detail">
                    <label class="gm-sp-editor-row">
                      <span>版块</span>
                      <input
                        type="text"
                        class="gm-sp-input"
                        data-action="board-rename"
                        value={drafts[board] ?? board}
                        onInput={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [board]: (e.target as HTMLInputElement).value,
                          }))
                        }
                        onBlur={() => commitRename(board)}
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
          placeholder="vote-hot 或 bxj"
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
          data-action="add-board"
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

export function createHupuEditor(options: HupuSourceOptions, settings: SourceSettings) {
  return createEditorFactory(
    (runtime) => loadFreshHupuOptions(runtime, options),
    HupuEditorForm,
    (fresh) => ({ fresh, settings }),
  )
}
