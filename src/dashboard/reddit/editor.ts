import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'
import { validateConfig } from '../config'
import { bindChipList, bindErrorBox, readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorResult } from '../types'
import { normalizeSubredditName } from './parser'
import type { RedditSourceOptions } from './types'
import { loadFreshRedditOptions } from './source'

export function createRedditEditor(options: RedditSourceOptions): SourceEditor {
  return (container, ctx) => renderRedditEditor(container, options, ctx)
}

async function renderRedditEditor(
  container: HTMLElement,
  options: RedditSourceOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<SourceEditorResult> {
  const fresh = await loadFreshRedditOptions(ctx.runtime, options)
  const subs: string[] = fresh.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0)

  const formFields: {
    prop: string
    label: string
    min: number
    max?: number
    errorMsg: string
  }[] = [
    { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
    { prop: 'minItems', label: '最少条数', min: 1, errorMsg: '最少条数必须是 ≥1 的整数' },
    { prop: 'minPerSub', label: '每 sub 至少 N 条', min: 0, errorMsg: '每 sub 至少 N 条必须 ≥0' },
    {
      prop: 'displayRatio',
      label: '显示比例',
      min: 0,
      max: 1,
      errorMsg: '显示比例必须是 0~1 之间',
    },
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
  const formHtml = formFields
    .map(
      (f) =>
        `          <label class="gm-sp-editor-row">
            <span>${f.label}</span>
            <input type="number"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''} />
          </label>`,
    )
    .join('\n')

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-editor">
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">Subreddit 列表</div>
        <div class="gm-sp-re-list"></div>
        <div class="gm-sp-editor-add-row">
          <input type="text" class="gm-sp-input gm-sp-editor-input" placeholder="r/funny 或 funny" />
          <button type="button" class="gm-sp-btn gm-sp-editor-btn" data-action="add">添加</button>
        </div>
      </div>
      <div class="gm-sp-editor-form">
${formHtml}
      </div>
      <div class="gm-sp-editor-error" hidden></div>
    </div>`,
  )

  const listEl = container.querySelector('.gm-sp-re-list') as HTMLDivElement
  const inputEl = container.querySelector('.gm-sp-editor-input') as HTMLInputElement
  const addBtn = container.querySelector('[data-action="add"]') as HTMLButtonElement
  const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement

  const numberInputs = container.querySelectorAll<HTMLInputElement>(
    '.gm-sp-editor-form input[type="number"]',
  )
  for (let i = 0; i < formFields.length; i++) {
    numberInputs[i].value = String((fresh as Record<string, unknown>)[formFields[i].prop])
  }

  const error = bindErrorBox(errorEl)

  const chipList = bindChipList<string>({
    listEl,
    addBtn,
    inputs: [inputEl],
    getItems: () => subs,
    setItems: (next) => {
      subs.length = 0
      subs.push(...next)
    },
    renderChip: (name, i) =>
      `<div class="gm-sp-editor-chip" data-index="${i}">
          <span class="gm-sp-editor-chip-drag" title="拖动重排">⋮⋮</span>
          <span class="gm-sp-editor-chip-label">r/${escapeHtml(name)}</span>
          <button type="button" class="gm-sp-editor-chip-remove" aria-label="remove">×</button>
        </div>`,
    removeSelector: '.gm-sp-editor-chip-remove',
    tryAdd: () => {
      const normalized = normalizeSubredditName(inputEl.value)
      if (!normalized) return { ok: false, error: '请输入有效的 subreddit 名称' }
      if (subs.includes(normalized)) return { ok: false, error: `r/${normalized} 已在列表中` }
      return { ok: true, item: normalized }
    },
    showError: (msg) => error.show(msg),
    clearError: () => error.clear(),
    emptyText: '尚未添加 subreddit',
    emptyClass: 'gm-sp-editor-empty',
    draggable: true,
    dragHandleSelector: '.gm-sp-editor-chip-drag',
    chipSelector: '.gm-sp-editor-chip',
    draggingClass: 'gm-sp-editor-chip-dragging',
  })

  chipList.render()

  return {
    render() {},
    cancel() {
      ctx.close()
    },
    save() {
      error.clear()
      if (subs.length === 0) {
        error.show('至少添加一个 subreddit')
        return
      }
      const nums = readNumberFields(
        formFields.map((f, i) => ({
          input: numberInputs[i],
          min: f.min,
          max: f.max,
          errorMessage: f.errorMsg,
        })),
        (msg) => error.show(msg),
      )
      if (nums === null) return
      const [ttl, min, minPerSub, ratio, elbow, cutoff, halfLife] = nums
      const reddit = {
        ttlMinutes: Math.round(ttl),
        ageHalfLifeDays: halfLife,
        subreddits: [...subs],
        minItems: Math.round(min),
        minPerSub: Math.round(minPerSub),
        displayRatio: ratio,
        elbowDropRatio: elbow,
        minCutoffScore: Math.round(cutoff),
      }
      void saveConfigSection({
        runtime: ctx.runtime,
        sectionKey: 'reddit',
        section: reddit,
        validate: validateConfig,
        onError: (msg) => error.show(msg),
        onSuccess: () => ctx.close(),
      })
    },
  }
}
