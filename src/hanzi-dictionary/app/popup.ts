import { escapeHtml } from '../../utils'
import type { Runtime } from '../../runtime'
import type { ZdicResult, ZdicError } from './zdic'
import { buildZdicUrl } from './zdic'

export class PopupController {
  private btn: HTMLElement | null = null
  private popup: HTMLElement | null = null
  private runtime: Runtime
  private currentText = ''

  constructor(runtime: Runtime) {
    this.runtime = runtime
  }

  showButton(text: string, x: number, y: number): void {
    this.currentText = text
    if (!this.btn) {
      this.runtime.document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="gm-hdz-btn" data-action="hanzi-dict-lookup" style="display:none">查</div>`,
      )
      this.btn = this.runtime.document.querySelector(
        '[data-action="hanzi-dict-lookup"]',
      ) as HTMLElement
    }
    this.btn.style.display = 'block'
    this.btn.style.top = `${y}px`
    this.btn.style.left = `${x}px`
  }

  hideButton(): void {
    if (this.btn) {
      this.btn.style.display = 'none'
    }
  }

  get currentUrl(): string {
    return buildZdicUrl(this.currentText)
  }

  showResult(result: ZdicResult): void {
    this.closePopup()
    this.popup = this.buildResultDom(result)
    this.runtime.document.body.appendChild(this.popup)
    this.attachCloseHandlers()
  }

  showError(error: ZdicError): void {
    this.closePopup()
    this.popup = this.buildErrorDom(error)
    this.runtime.document.body.appendChild(this.popup)
    this.attachCloseHandlers()
  }

  closePopup(): void {
    if (this.popup) {
      this.popup.remove()
      this.popup = null
    }
  }

  get isPopupOpen(): boolean {
    return this.popup !== null
  }

  private buildResultDom(result: ZdicResult): HTMLElement {
    const url = buildZdicUrl(result.word)
    const el = this.runtime.document.createElement('div')
    el.className = 'gm-hdz-popup-wrap'
    const senses = result.definitions
      .map(
        (d, i) =>
          `<li class="gm-hdz-popup-sense"><span class="gm-hdz-popup-sense-num">${i + 1}</span>${escapeHtml(d)}</li>`,
      )
      .join('')
    el.insertAdjacentHTML(
      'beforeend',
      `<button class="gm-hdz-popup-close" type="button" aria-label="关闭">×</button>` +
        `<div class="gm-hdz-popup"><div class="gm-hdz-popup-header"><span class="gm-hdz-popup-char">${escapeHtml(result.word)}</span><span class="gm-hdz-popup-py">${escapeHtml(result.pinyin)}</span></div>` +
        `<ul class="gm-hdz-popup-senses">${senses}</ul>` +
        `<div class="gm-hdz-popup-footer"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">更多 →</a></div></div>`,
    )
    return el
  }

  private buildErrorDom(error: ZdicError): HTMLElement {
    const el = this.runtime.document.createElement('div')
    el.className = 'gm-hdz-popup-wrap'
    el.insertAdjacentHTML(
      'beforeend',
      `<button class="gm-hdz-popup-close" type="button" aria-label="关闭">×</button>` +
        `<div class="gm-hdz-popup"><div class="gm-hdz-popup-error">未找到「${escapeHtml(error.word)}」</div>` +
        `<div class="gm-hdz-popup-footer"><a href="${escapeHtml(error.url)}" target="_blank" rel="noopener">前往汉典 →</a></div></div>`,
    )
    return el
  }

  private attachCloseHandlers(): void {
    if (!this.popup) return
    this.popup
      .querySelector('.gm-hdz-popup-close')
      ?.addEventListener('click', () => this.closePopup())
    const onOutside = (e: Event) => {
      if (!this.popup!.contains(e.target as Node)) {
        this.closePopup()
        this.runtime.document.removeEventListener('mousedown', onOutside)
        this.runtime.document.removeEventListener('keydown', onKey, true)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closePopup()
        this.runtime.document.removeEventListener('mousedown', onOutside)
        this.runtime.document.removeEventListener('keydown', onKey, true)
      }
    }
    setTimeout(() => {
      this.runtime.document.addEventListener('mousedown', onOutside)
      this.runtime.document.addEventListener('keydown', onKey, true)
    }, 0)
  }
}
