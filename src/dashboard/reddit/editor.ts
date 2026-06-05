import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import { validateConfig } from '../config'
import { CONFIG_KEY } from '../types'
import type { SourceEditor } from '../types'
import { normalizeSubredditName, type RedditSourceOptions } from './source'

export function createRedditEditor(options: RedditSourceOptions): SourceEditor {
  return (container, ctx) => renderRedditEditor(container, options, ctx)
}

async function loadFreshRedditOptions(
  runtime: Runtime,
  fallback: RedditSourceOptions,
): Promise<RedditSourceOptions> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const r = stored?.reddit as
      | {
          ttlMinutes?: number
          subreddits?: string[]
          minItems?: number
          maxItems?: number
          displayRatio?: number
          elbowDropRatio?: number
          minCutoffScore?: number
        }
      | undefined
    if (r) {
      return {
        ttlMinutes: typeof r.ttlMinutes === 'number' ? r.ttlMinutes : fallback.ttlMinutes,
        subreddits:
          Array.isArray(r.subreddits) && r.subreddits.length > 0
            ? r.subreddits.map((s) => String(s)).filter((s) => s.length > 0)
            : fallback.subreddits,
        minItems: typeof r.minItems === 'number' ? r.minItems : fallback.minItems,
        maxItems: typeof r.maxItems === 'number' ? r.maxItems : fallback.maxItems,
        displayRatio: typeof r.displayRatio === 'number' ? r.displayRatio : fallback.displayRatio,
        elbowDropRatio:
          typeof r.elbowDropRatio === 'number' ? r.elbowDropRatio : fallback.elbowDropRatio,
        minCutoffScore:
          typeof r.minCutoffScore === 'number' ? r.minCutoffScore : fallback.minCutoffScore,
      }
    }
  } catch {}
  return fallback
}

async function renderRedditEditor(
  container: HTMLElement,
  options: RedditSourceOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<void> {
  const document = container.ownerDocument
  const fresh = await loadFreshRedditOptions(ctx.runtime, options)
  const subs: string[] = fresh.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0)

  const form = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-reddit-editor">
      <div class="gm-sp-reddit-editor-section">
        <div class="gm-sp-reddit-editor-label">Subreddit 列表</div>
        <div class="gm-sp-re-list"></div>
        <div class="gm-sp-re-add-row">
          <input type="text" class="gm-sp-re-input" placeholder="r/funny 或 funny" />
          <button type="button" class="gm-sp-re-add">添加</button>
        </div>
      </div>
      <div class="gm-sp-reddit-editor-form">
        <label class="gm-sp-reddit-editor-row">
          <span>TTL（分钟）</span>
          <input type="number" min="1" step="1" class="gm-sp-re-ttl" />
        </label>
        <label class="gm-sp-reddit-editor-row">
          <span>最少条数</span>
          <input type="number" min="1" step="1" class="gm-sp-re-min" />
        </label>
        <label class="gm-sp-reddit-editor-row">
          <span>最多条数</span>
          <input type="number" min="1" step="1" class="gm-sp-re-max" />
        </label>
        <label class="gm-sp-reddit-editor-row">
          <span>显示比例</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-re-ratio" />
        </label>
        <label class="gm-sp-reddit-editor-row">
          <span>拐点跌幅</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-re-elbow" />
        </label>
        <label class="gm-sp-reddit-editor-row">
          <span>最低分数</span>
          <input type="number" min="0" step="1" class="gm-sp-re-cutoff" />
        </label>
      </div>
      <div class="gm-sp-re-error" hidden></div>
      <div class="gm-sp-reddit-editor-actions">
        <button type="button" class="gm-sp-re-save gm-sp-primary">保存</button>
        <button type="button" class="gm-sp-re-cancel">取消</button>
      </div>
    </div>`,
  )

  const listEl = form.querySelector('.gm-sp-re-list') as HTMLDivElement
  const inputEl = form.querySelector('.gm-sp-re-input') as HTMLInputElement
  const addBtn = form.querySelector('.gm-sp-re-add') as HTMLButtonElement
  const ttlInput = form.querySelector('.gm-sp-re-ttl') as HTMLInputElement
  const minInput = form.querySelector('.gm-sp-re-min') as HTMLInputElement
  const maxInput = form.querySelector('.gm-sp-re-max') as HTMLInputElement
  const ratioInput = form.querySelector('.gm-sp-re-ratio') as HTMLInputElement
  const elbowInput = form.querySelector('.gm-sp-re-elbow') as HTMLInputElement
  const cutoffInput = form.querySelector('.gm-sp-re-cutoff') as HTMLInputElement
  const errorEl = form.querySelector('.gm-sp-re-error') as HTMLDivElement
  const saveBtn = form.querySelector('.gm-sp-re-save') as HTMLButtonElement
  const cancelBtn = form.querySelector('.gm-sp-re-cancel') as HTMLButtonElement

  ttlInput.value = String(fresh.ttlMinutes)
  minInput.value = String(fresh.minItems)
  maxInput.value = String(fresh.maxItems)
  ratioInput.value = String(fresh.displayRatio)
  elbowInput.value = String(fresh.elbowDropRatio)
  cutoffInput.value = String(fresh.minCutoffScore)

  function showError(message: string): void {
    errorEl.textContent = message
    errorEl.hidden = false
  }
  function clearError(): void {
    errorEl.textContent = ''
    errorEl.hidden = true
  }

  function renderChips(): void {
    listEl.replaceChildren()
    if (subs.length === 0) {
      const empty = htmlToElement<HTMLDivElement>(
        document,
        '<div class="gm-sp-re-empty">尚未添加 subreddit</div>',
      )
      listEl.appendChild(empty)
      return
    }
    for (let i = 0; i < subs.length; i++) {
      const name = subs[i]!
      const chip = htmlToElement<HTMLDivElement>(
        document,
        `<div class="gm-sp-re-chip">
          <span class="gm-sp-re-chip-label"></span>
          <button type="button" class="gm-sp-re-chip-remove" aria-label="remove">×</button>
        </div>`,
      )
      chip.querySelector('.gm-sp-re-chip-label')!.textContent = `r/${name}`
      chip.querySelector('.gm-sp-re-chip-remove')!.addEventListener('click', () => {
        subs.splice(i, 1)
        renderChips()
      })
      listEl.appendChild(chip)
    }
  }

  function tryAdd(): void {
    clearError()
    const raw = inputEl.value
    const normalized = normalizeSubredditName(raw)
    if (!normalized) {
      showError('请输入有效的 subreddit 名称')
      return
    }
    if (subs.includes(normalized)) {
      showError(`r/${normalized} 已在列表中`)
      return
    }
    subs.push(normalized)
    inputEl.value = ''
    renderChips()
  }

  addBtn.addEventListener('click', tryAdd)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      tryAdd()
    }
  })

  cancelBtn.addEventListener('click', () => {
    ctx.close()
  })

  saveBtn.addEventListener('click', () => {
    clearError()
    if (subs.length === 0) {
      showError('至少添加一个 subreddit')
      return
    }
    const ttl = Number(ttlInput.value)
    const min = Number(minInput.value)
    const max = Number(maxInput.value)
    const ratio = Number(ratioInput.value)
    const elbow = Number(elbowInput.value)
    const cutoff = Number(cutoffInput.value)
    if (!Number.isFinite(ttl) || ttl < 1) {
      showError('TTL 必须是 ≥1 的整数')
      return
    }
    if (!Number.isFinite(min) || min < 1) {
      showError('最少条数必须是 ≥1 的整数')
      return
    }
    if (!Number.isFinite(max) || max < min) {
      showError('最多条数必须 ≥ 最少条数')
      return
    }
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      showError('显示比例必须是 0~1 之间')
      return
    }
    if (!Number.isFinite(elbow) || elbow < 0 || elbow > 1) {
      showError('拐点跌幅必须是 0~1 之间')
      return
    }
    if (!Number.isFinite(cutoff) || cutoff < 0) {
      showError('最低分数必须 ≥0')
      return
    }
    const reddit = {
      ttlMinutes: Math.round(ttl),
      subreddits: [...subs],
      minItems: Math.round(min),
      maxItems: Math.round(max),
      displayRatio: ratio,
      elbowDropRatio: elbow,
      minCutoffScore: Math.round(cutoff),
    }
    const validation = validateConfig({ reddit })
    if (!validation.ok) {
      showError(validation.error)
      return
    }
    const result = ctx.runtime
      .getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
      .then((existing) => {
        return ctx.runtime.setValue(CONFIG_KEY, { ...(existing ?? {}), reddit })
      })
    Promise.resolve(result).then(() => {
      ctx.close()
    })
  })

  renderChips()
  container.appendChild(form)
}
