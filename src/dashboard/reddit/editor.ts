import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'
import { validateConfig } from '../config'
import { bindChipList, bindErrorBox, readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor } from '../types'
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
): Promise<void> {
  const fresh = await loadFreshRedditOptions(ctx.runtime, options)
  const subs: string[] = fresh.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0)

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-editor">
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">Subreddit 列表</div>
        <div class="gm-sp-re-list"></div>
        <div class="gm-sp-editor-add-row">
          <input type="text" class="gm-sp-editor-input" placeholder="r/funny 或 funny" />
          <button type="button" class="gm-sp-editor-btn gm-sp-re-add">添加</button>
        </div>
      </div>
      <div class="gm-sp-editor-form">
        <label class="gm-sp-editor-row">
          <span>TTL（分钟）</span>
          <input type="number" min="1" step="1" class="gm-sp-re-ttl" />
        </label>
        <label class="gm-sp-editor-row">
          <span>最少条数</span>
          <input type="number" min="1" step="1" class="gm-sp-re-min" />
        </label>
        <label class="gm-sp-editor-row">
          <span>最多条数</span>
          <input type="number" min="1" step="1" class="gm-sp-re-max" />
        </label>
        <label class="gm-sp-editor-row">
          <span>每 sub 至少 N 条</span>
          <input type="number" min="0" step="1" class="gm-sp-re-minpersub" />
        </label>
        <label class="gm-sp-editor-row">
          <span>显示比例</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-re-ratio" />
        </label>
        <label class="gm-sp-editor-row">
          <span>拐点跌幅</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-re-elbow" />
        </label>
        <label class="gm-sp-editor-row">
          <span>最低分数</span>
          <input type="number" min="0" step="1" class="gm-sp-re-cutoff" />
        </label>
        <label class="gm-sp-editor-row">
          <span>衰减半衰期（天）</span>
          <input type="number" min="0.1" max="30" step="0.1" class="gm-sp-re-half-life" />
        </label>
      </div>
      <div class="gm-sp-editor-error" hidden></div>
      <div class="gm-sp-editor-actions">
        <button type="button" class="gm-sp-editor-btn gm-sp-editor-btn-primary gm-sp-re-save">保存</button>
        <button type="button" class="gm-sp-editor-btn gm-sp-re-cancel">取消</button>
      </div>
    </div>`,
  )

  const listEl = container.querySelector('.gm-sp-re-list') as HTMLDivElement
  const inputEl = container.querySelector('.gm-sp-editor-input') as HTMLInputElement
  const addBtn = container.querySelector('.gm-sp-re-add') as HTMLButtonElement
  const ttlInput = container.querySelector('.gm-sp-re-ttl') as HTMLInputElement
  const minInput = container.querySelector('.gm-sp-re-min') as HTMLInputElement
  const maxInput = container.querySelector('.gm-sp-re-max') as HTMLInputElement
  const minPerSubInput = container.querySelector('.gm-sp-re-minpersub') as HTMLInputElement
  const ratioInput = container.querySelector('.gm-sp-re-ratio') as HTMLInputElement
  const elbowInput = container.querySelector('.gm-sp-re-elbow') as HTMLInputElement
  const cutoffInput = container.querySelector('.gm-sp-re-cutoff') as HTMLInputElement
  const halfLifeInput = container.querySelector('.gm-sp-re-half-life') as HTMLInputElement
  const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement
  const saveBtn = container.querySelector('.gm-sp-re-save') as HTMLButtonElement
  const cancelBtn = container.querySelector('.gm-sp-re-cancel') as HTMLButtonElement

  ttlInput.value = String(fresh.ttlMinutes)
  minInput.value = String(fresh.minItems)
  maxInput.value = String(fresh.maxItems)
  minPerSubInput.value = String(fresh.minPerSub)
  ratioInput.value = String(fresh.displayRatio)
  elbowInput.value = String(fresh.elbowDropRatio)
  cutoffInput.value = String(fresh.minCutoffScore)
  halfLifeInput.value = String(fresh.ageHalfLifeDays)

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

  cancelBtn.addEventListener('click', () => {
    ctx.close()
  })

  saveBtn.addEventListener('click', () => {
    error.clear()
    if (subs.length === 0) {
      error.show('至少添加一个 subreddit')
      return
    }
    const nums = readNumberFields(
      [
        { input: ttlInput, min: 1, errorMessage: 'TTL 必须是 ≥1 的整数' },
        { input: minInput, min: 1, errorMessage: '最少条数必须是 ≥1 的整数' },
        { input: maxInput, min: 1, errorMessage: '最多条数必须 ≥ 最少条数' },
        { input: minPerSubInput, min: 0, errorMessage: '每 sub 至少 N 条必须 ≥0' },
        { input: ratioInput, min: 0, max: 1, errorMessage: '显示比例必须是 0~1 之间' },
        { input: elbowInput, min: 0, max: 1, errorMessage: '拐点跌幅必须是 0~1 之间' },
        { input: cutoffInput, min: 0, errorMessage: '最低分数必须 ≥0' },
        { input: halfLifeInput, min: 0.1, max: 30, errorMessage: '衰减半衰期必须是 0.1~30 之间' },
      ],
      (msg) => error.show(msg),
    )
    if (nums === null) return
    const [ttl, min, max, minPerSub, ratio, elbow, cutoff, halfLife] = nums
    if (max < min) {
      error.show('最多条数必须 ≥ 最少条数')
      return
    }
    const reddit = {
      ttlMinutes: Math.round(ttl),
      ageHalfLifeDays: halfLife,
      subreddits: [...subs],
      minItems: Math.round(min),
      maxItems: Math.round(max),
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
  })

  chipList.render()
}
