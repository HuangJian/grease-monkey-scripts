import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { escapeHtml } from '../../utils'
import { validateConfig } from '../config'
import { readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
import { normalizeSubredditName } from './parser'
import type { RedditSourceOptions } from './types'
import { loadFreshRedditOptions } from './source'

const FORM_FIELDS: {
  prop: string
  label: string
  min: number
  max?: number
  errorMsg: string
}[] = [
  { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
  { prop: 'minItems', label: '最少条数', min: 1, errorMsg: '最少条数必须是 ≥1 的整数' },
  { prop: 'minPerSub', label: '每 sub 至少 N 条', min: 0, errorMsg: '每 sub 至少 N 条必须 ≥0' },
  { prop: 'displayRatio', label: '显示比例', min: 0, max: 1, errorMsg: '显示比例必须是 0~1 之间' },
  {
    prop: 'elbowDropRatio',
    label: '拐点跌幅',
    min: 0,
    max: 1,
    errorMsg: '拐点跌幅必须是 0~1 之间',
  },
  { prop: 'minCutoffScore', label: '最低分数', min: 0, errorMsg: '最低分数必须 ≥0' },
  {
    prop: 'ageHalfLifeDays',
    label: '衰减半衰期（天）',
    min: 0.1,
    max: 30,
    errorMsg: '衰减半衰期必须是 0.1~30 之间',
  },
]

type RedditEditorFormProps = {
  fresh: RedditSourceOptions
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function RedditEditorForm({ fresh, ctx, handleRef }: RedditEditorFormProps) {
  const [subs, setSubs] = useState<string[]>(() =>
    fresh.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0),
  )
  const [error, setError] = useState('')
  const [advanced, setAdvanced] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const f of FORM_FIELDS) {
      const val = (fresh as Record<string, unknown>)[f.prop]
      out[f.prop] = typeof val === 'number' ? val : 0
    }
    return out
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])
  // drag state
  const dragSrcIdx = useRef<number | null>(null)
  const draggedChip = useRef<HTMLElement | null>(null)

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
  }, [])

  const tryAdd = useCallback(() => {
    setError('')
    const val = inputRef.current?.value ?? ''
    const normalized = normalizeSubredditName(val)
    if (!normalized) {
      setError('请输入有效的 subreddit 名称')
      return
    }
    if (subs.includes(normalized)) {
      setError(`r/${normalized} 已在列表中`)
      return
    }
    setSubs((prev) => [...prev, normalized])
    if (inputRef.current) inputRef.current.value = ''
  }, [subs])

  const onAddKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        tryAdd()
      }
    },
    [tryAdd],
  )

  const removeSub = useCallback((i: number) => {
    setSubs((prev) => prev.filter((_, j) => j !== i))
  }, [])

  const reorder = useCallback((src: number, target: number) => {
    if (src === target) return
    setSubs((prev) => {
      const next = [...prev]
      const moved = next.splice(src, 1)[0]!
      const insertAt = src < target ? target - 1 : target
      next.splice(insertAt, 0, moved)
      return next
    })
  }, [])

  const onPointerDown = useCallback((idx: number, e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragSrcIdx.current = idx
    const chip = listRef.current?.querySelectorAll<HTMLElement>('.gm-sp-editor-chip')[idx]
    if (chip) {
      chip.classList.add('gm-sp-editor-chip-dragging')
      draggedChip.current = chip
    }
  }, [])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const onPointerMove = (e: PointerEvent) => {
      if (dragSrcIdx.current === null) return
      const items = list.querySelectorAll<HTMLElement>('.gm-sp-editor-chip')
      items.forEach((c) =>
        c.classList.remove('gm-sp-re-chip-drop-before', 'gm-sp-re-chip-drop-after'),
      )
      if (items.length === 0) return
      const rects = Array.from(items, (c) => c.getBoundingClientRect())
      let hoveredIdx: number | null = null
      let hoveredPos: 'before' | 'after' | null = null
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]!
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          if (e.clientY < r.top + r.height / 2) {
            hoveredIdx = i
            hoveredPos = 'before'
          } else {
            hoveredIdx = i
            hoveredPos = 'after'
          }
          break
        }
      }
      if (hoveredIdx === null) {
        if (e.clientY < rects[0]!.top) {
          hoveredIdx = 0
          hoveredPos = 'before'
        } else if (e.clientY > rects[rects.length - 1]!.bottom) {
          hoveredIdx = rects.length
          hoveredPos = 'after'
        }
      }
      if (hoveredIdx !== null && hoveredPos === 'before' && hoveredIdx < items.length) {
        items[hoveredIdx]!.classList.add('gm-sp-re-chip-drop-before')
      } else if (hoveredIdx !== null && hoveredPos === 'after' && hoveredIdx > 0) {
        items[hoveredIdx - 1]!.classList.add('gm-sp-re-chip-drop-after')
      }
    }

    const onPointerUp = () => {
      if (dragSrcIdx.current === null) return
      if (draggedChip.current) draggedChip.current.classList.remove('gm-sp-editor-chip-dragging')
      const chips = list.querySelectorAll<HTMLElement>('.gm-sp-editor-chip')
      let target = dragSrcIdx.current
      chips.forEach((c, i) => {
        if (c.classList.contains('gm-sp-re-chip-drop-before')) {
          target = i
          return
        }
        if (c.classList.contains('gm-sp-re-chip-drop-after')) target = i + 1
      })
      chips.forEach((c) =>
        c.classList.remove('gm-sp-re-chip-drop-before', 'gm-sp-re-chip-drop-after'),
      )
      const src = dragSrcIdx.current
      dragSrcIdx.current = null
      draggedChip.current = null
      reorder(src, target)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }
  }, [reorder])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        if (subs.length === 0) {
          setError('至少添加一个 subreddit')
          return
        }
        const inputList = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          FORM_FIELDS.map((f, i) => ({
            input: inputList[i],
            min: f.min,
            max: f.max,
            errorMessage: f.errorMsg,
          })),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const reddit: RedditSourceOptions = {
          ttlMinutes: Math.round(nums[0]),
          minItems: Math.round(nums[1]),
          minPerSub: Math.round(nums[2]),
          displayRatio: nums[3],
          elbowDropRatio: nums[4],
          minCutoffScore: Math.round(nums[5]),
          ageHalfLifeDays: nums[6],
          subreddits: [...subs],
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'reddit',
          section: reddit,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => ctx.close(),
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [subs, advanced])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">Subreddit 列表</div>
        <div class="gm-sp-re-list" ref={listRef}>
          {subs.length === 0 ? (
            <div class="gm-sp-editor-empty">尚未添加 subreddit</div>
          ) : (
            subs.map((name, i) => (
              <div class="gm-sp-editor-chip" key={i} data-index={i}>
                <span
                  class="gm-sp-editor-chip-drag"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => onPointerDown(i, e)}
                >
                  ⋮⋮
                </span>
                <span class="gm-sp-editor-chip-label">r/{escapeHtml(name)}</span>
                <button
                  type="button"
                  class="gm-sp-editor-chip-remove"
                  aria-label="remove"
                  onClick={() => removeSub(i)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <div class="gm-sp-editor-add-row">
          <input
            ref={inputRef}
            type="text"
            class="gm-sp-input gm-sp-editor-input"
            placeholder="r/funny 或 funny"
            onKeyDown={onAddKeyDown}
          />
          <button
            type="button"
            class="gm-sp-btn gm-sp-editor-btn"
            data-action="add"
            onClick={tryAdd}
          >
            添加
          </button>
        </div>
      </div>
      <div class="gm-sp-editor-form">
        {FORM_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{f.label}</span>
            <input
              ref={(el) => {
                advancedRefs.current[i] = el
              }}
              type="number"
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

export function createRedditEditor(options: RedditSourceOptions): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshRedditOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(<RedditEditorForm fresh={fresh} ctx={ctx} handleRef={handleRef} />, container)
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
