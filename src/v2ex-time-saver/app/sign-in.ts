import type { Runtime } from '../../runtime'
import { SELECTORS } from './selectors'

/** GM storage key holding the last sign-in record. */
export const signInStateKey = 'v2ex_sign_in_state'

export type SignInState = {
  /**
   * Local calendar day (`YYYY-MM-DD`) of the last sign-in that was positively
   * resolved — redeemed by us, or already claimed. A day that could not be
   * resolved (error page, unrecognised markup) is deliberately not recorded, so
   * the next page load retries instead of silently skipping the rest of the day.
   */
  resolvedDate: string
  /** Epoch ms of the last sign-in we actually performed, or null. */
  signedAt: number | null
}

/** Format `ms` as the local calendar day `YYYY-MM-DD`. */
export function toLocalDateString(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseSignInState(value: unknown): SignInState | null {
  if (typeof value !== 'object' || value === null) return null
  const { resolvedDate, signedAt } = value as Record<string, unknown>
  if (typeof resolvedDate !== 'string') return null
  return { resolvedDate, signedAt: typeof signedAt === 'number' ? signedAt : null }
}

function setLinkFeedback(runtime: Runtime, text: string): void {
  const linkEl = runtime.document.querySelector(SELECTORS.signInLink)
  if (linkEl) linkEl.textContent = text
}

const NOTICE_DURATION_MS = 6000

const FAILURE_TEXT = '自动签到失败，请手动签到'

/** Transient corner notice. Styles live in `v2ex-time-saver/index.css`. */
function showNotice(runtime: Runtime, text: string, kind: 'ok' | 'error'): void {
  const parent = runtime.document.body ?? runtime.document.documentElement
  if (!parent) return
  const notice = runtime.document.createElement('div')
  notice.className = `gm-sign-in-notice gm-sign-in-notice-${kind}`
  notice.textContent = text
  parent.appendChild(notice)
  runtime.setTimeout(() => notice.remove(), NOTICE_DURATION_MS)
}

/**
 * Report an attempt that did not resolve. The sidebar link only exists on some
 * pages, so its absence would otherwise make the failure invisible — but a
 * notice on every page would nag an anonymous visitor, hence the guard.
 */
function reportFailure(runtime: Runtime, text: string): void {
  const linkEl = runtime.document.querySelector(SELECTORS.signInLink)
  if (!linkEl) return
  linkEl.textContent = text
  showNotice(runtime, text, 'error')
}

type PageResponse = { text: string; status: number }

function requestPage(runtime: Runtime, url: string): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: 30000,
      onload: (response) => resolve({ text: response.responseText, status: response.status }),
      onerror: () => reject(new Error(`request failed: ${url}`)),
      ontimeout: () => reject(new Error(`request timed out: ${url}`)),
    })
  })
}

/**
 * Pick the daily-reward redeem path out of the mission page.
 *
 * The button has historically been rendered as
 * `onclick="location.href = '/mission/daily/redeem?once=12345';"`, but the
 * surrounding markup does change (quoting style, plain `<a href>`). Match the
 * path itself rather than the `location.href` wrapper, and stop at the first
 * quote or `>` so no trailing markup leaks into the URL.
 */
export function extractRedeemUrl(html: string): string | null {
  const match = /(\/mission\/daily\/redeem\?[^"'\s>]+)/.exec(html)
  const path = match?.[1]
  return path ? path.replace(/&amp;/g, '&') : null
}

/** True when the mission page says today's reward is already gone. */
export function isAlreadyClaimed(html: string): boolean {
  return /每日登录奖励已领取|登录奖励已领取/.test(html)
}

async function resolveToday(
  runtime: Runtime,
  date: string,
  signedAt: number | null,
): Promise<void> {
  await runtime.setValue(signInStateKey, { resolvedDate: date, signedAt } satisfies SignInState)
}

/**
 * Sign in once per local calendar day, on whichever V2EX page is opened first.
 *
 * The daily reward does not depend on page content, so this does not wait for
 * the homepage's mission link. Only a positively resolved day is recorded, so
 * an error page or an unrecognised mission page retries on the next page load
 * rather than locking the day out.
 */
export async function runSignInIfNeeded(runtime: Runtime): Promise<void> {
  const today = toLocalDateString(runtime.now())
  const state = parseSignInState(await runtime.getValue<unknown>(signInStateKey, null))
  if (state?.resolvedDate === today) {
    console.debug('[gm-v2ex-time-saver] sign-in: already resolved today, skipping', state)
    return
  }

  console.debug('[gm-v2ex-time-saver] sign-in start', { today })
  try {
    const origin = runtime.location.origin
    const mission = await requestPage(runtime, `${origin}/mission/daily`)
    // Never parse an error page: a 403 or a WAF challenge looks exactly like a
    // mission page with no redeem button, which would otherwise be recorded as
    // resolved and silently skip the sign-in for the rest of the day.
    if (mission.status >= 400) {
      throw new Error(`mission/daily http ${mission.status}`)
    }

    const redeemPath = extractRedeemUrl(mission.text)
    if (redeemPath) {
      const redeem = await requestPage(runtime, `${origin}${redeemPath}`)
      if (redeem.status >= 400) throw new Error(`redeem http ${redeem.status}`)
      await resolveToday(runtime, today, runtime.now())
      setLinkFeedback(runtime, '自动签到成功')
      showNotice(runtime, 'V2EX 每日签到成功', 'ok')
      console.debug('[gm-v2ex-time-saver] sign-in done')
      return
    }

    if (isAlreadyClaimed(mission.text)) {
      await resolveToday(runtime, today, state?.signedAt ?? null)
      console.debug('[gm-v2ex-time-saver] sign-in: already claimed today')
      return
    }

    // Neither a redeem link nor a "claimed" marker: the page is not what we
    // expect (logged out, interstitial, restyled markup). Leave the day
    // unresolved so the next page retries, and make the failure visible.
    reportFailure(runtime, FAILURE_TEXT)
    console.warn('[gm-v2ex-time-saver] sign-in: unrecognised mission page', {
      status: mission.status,
      snippet: mission.text.slice(0, 200),
    })
  } catch (e) {
    reportFailure(runtime, FAILURE_TEXT)
    console.warn('[gm-v2ex-time-saver] sign-in failed', e)
  }
}

/** Fire-and-forget entry point used by the app bootstrap. */
export function checkAndDoSignIn(runtime: Runtime): void {
  void runSignInIfNeeded(runtime).catch((e) => {
    console.error('[gm-v2ex-time-saver] sign-in error', e)
  })
}

/**
 * Tampermonkey menu command: clears the day marker and signs in immediately, so
 * a failed attempt can be retried without waiting for the next day.
 */
export function registerSignInCommand(runtime: Runtime): void {
  runtime.registerMenuCommand('立即签到（清除今日记录后重试）', () => {
    void (async () => {
      await runtime.deleteValue(signInStateKey)
      await runSignInIfNeeded(runtime)
    })()
  })
}
