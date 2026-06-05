import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import { validateConfig } from '../config'
import { CONFIG_KEY } from '../types'
import type { SourceEditor } from '../types'
import type { V2exSourceOptions } from './source'

export function createV2exEditor(options: V2exSourceOptions): SourceEditor {
  return (container, ctx) => renderV2exEditor(container, options, ctx)
}

async function loadFreshV2exOptions(
  runtime: Runtime,
  fallback: V2exSourceOptions,
): Promise<V2exSourceOptions> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const v2ex = stored?.v2ex as V2exSourceOptions | undefined
    if (v2ex) {
      return {
        ttlMinutes: typeof v2ex.ttlMinutes === 'number' ? v2ex.ttlMinutes : fallback.ttlMinutes,
        minItems: typeof v2ex.minItems === 'number' ? v2ex.minItems : fallback.minItems,
        maxItems: typeof v2ex.maxItems === 'number' ? v2ex.maxItems : fallback.maxItems,
        displayRatio:
          typeof v2ex.displayRatio === 'number' ? v2ex.displayRatio : fallback.displayRatio,
        elbowDropRatio:
          typeof v2ex.elbowDropRatio === 'number' ? v2ex.elbowDropRatio : fallback.elbowDropRatio,
        minReplies: typeof v2ex.minReplies === 'number' ? v2ex.minReplies : fallback.minReplies,
      }
    }
  } catch {}
  return fallback
}

async function renderV2exEditor(
  container: HTMLElement,
  options: V2exSourceOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<void> {
  const document = container.ownerDocument
  const fresh = await loadFreshV2exOptions(ctx.runtime, options)

  const form = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-v2ex-editor">
      <div class="gm-sp-v2ex-editor-form">
        <label class="gm-sp-v2ex-editor-row">
          <span>TTL（分钟）</span>
          <input type="number" min="1" step="1" class="gm-sp-v2e-ttl" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>最少条数</span>
          <input type="number" min="1" step="1" class="gm-sp-v2e-min" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>最多条数</span>
          <input type="number" min="1" step="1" class="gm-sp-v2e-max" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>显示比例</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-v2e-ratio" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>拐点跌幅</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-v2e-elbow" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>回复阈值</span>
          <input type="number" min="0" step="1" class="gm-sp-v2e-min-replies" />
        </label>
      </div>
      <div class="gm-sp-v2e-error" hidden></div>
      <div class="gm-sp-v2ex-editor-actions">
        <button type="button" class="gm-sp-v2e-save gm-sp-primary">保存</button>
        <button type="button" class="gm-sp-v2e-cancel">取消</button>
      </div>
    </div>`,
  )

  const ttlInput = form.querySelector('.gm-sp-v2e-ttl') as HTMLInputElement
  const minInput = form.querySelector('.gm-sp-v2e-min') as HTMLInputElement
  const maxInput = form.querySelector('.gm-sp-v2e-max') as HTMLInputElement
  const ratioInput = form.querySelector('.gm-sp-v2e-ratio') as HTMLInputElement
  const elbowInput = form.querySelector('.gm-sp-v2e-elbow') as HTMLInputElement
  const minRepliesInput = form.querySelector('.gm-sp-v2e-min-replies') as HTMLInputElement
  const errorEl = form.querySelector('.gm-sp-v2e-error') as HTMLDivElement
  const saveBtn = form.querySelector('.gm-sp-v2e-save') as HTMLButtonElement
  const cancelBtn = form.querySelector('.gm-sp-v2e-cancel') as HTMLButtonElement

  ttlInput.value = String(fresh.ttlMinutes)
  minInput.value = String(fresh.minItems)
  maxInput.value = String(fresh.maxItems)
  ratioInput.value = String(fresh.displayRatio)
  elbowInput.value = String(fresh.elbowDropRatio)
  minRepliesInput.value = String(fresh.minReplies)

  function showError(message: string): void {
    errorEl.textContent = message
    errorEl.hidden = false
  }

  cancelBtn.addEventListener('click', () => {
    ctx.close()
  })

  saveBtn.addEventListener('click', () => {
    errorEl.hidden = true
    errorEl.textContent = ''
    const ttl = Number(ttlInput.value)
    const min = Number(minInput.value)
    const max = Number(maxInput.value)
    const ratio = Number(ratioInput.value)
    const elbow = Number(elbowInput.value)
    const minReplies = Number(minRepliesInput.value)
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
    if (!Number.isFinite(minReplies) || minReplies < 0) {
      showError('回复阈值必须 ≥0')
      return
    }
    const v2ex = {
      ttlMinutes: Math.round(ttl),
      minItems: Math.round(min),
      maxItems: Math.round(max),
      displayRatio: ratio,
      elbowDropRatio: elbow,
      minReplies: Math.round(minReplies),
    }
    const validation = validateConfig({ v2ex })
    if (!validation.ok) {
      showError(validation.error)
      return
    }
    const result = ctx.runtime
      .getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
      .then((existing) => {
        return ctx.runtime.setValue(CONFIG_KEY, { ...(existing ?? {}), v2ex })
      })
    Promise.resolve(result).then(() => {
      ctx.close()
    })
  })

  container.appendChild(form)
}
