import type { Runtime } from '../../runtime'
import { SELECTORS } from './selectors'

/** GM storage key holding the last sign-in record. */
export const signInStateKey = 'v2ex_sign_in_state'

export type SignInState = {
  /**
   * UTC calendar day (`YYYY-MM-DD`) whose daily reward is already resolved —
   * either redeemed by us, or reported as already claimed.
   *
   * V2EX refreshes the reward at **00:00 UTC** (= 08:00 in GMT+8), so the gate
   * has to use the site's day, not the browser's: a check made at 02:00 local
   * (18:00 UTC of the *previous* day) resolves the previous UTC day, and must
   * not block the reward that becomes available at 08:00 local.
   */
  claimedUtcDate: string
  /** Epoch ms of the last sign-in we actually performed, or null. */
  signedAt: number | null
}

/** Format `ms` as the UTC calendar day `YYYY-MM-DD` — V2EX's reward day. */
export function toUtcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Format `ms` as local wall-clock `HH:MM` (what the user reads on the page). */
export function formatClockTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseSignInState(value: unknown): SignInState | null {
  if (typeof value !== 'object' || value === null) return null
  const { claimedUtcDate, signedAt } = value as Record<string, unknown>
  if (typeof claimedUtcDate !== 'string') return null
  return { claimedUtcDate, signedAt: typeof signedAt === 'number' ? signedAt : null }
}

function hasSignInLink(runtime: Runtime): boolean {
  return Boolean(runtime.document.querySelector(SELECTORS.signInLink))
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
 * Report an attempt that did not succeed. The sidebar link only exists on some
 * pages, so its absence would otherwise make the failure invisible — but a
 * notice on every page would nag an anonymous visitor, hence the guard.
 */
function reportFailure(runtime: Runtime, text: string): void {
  if (!hasSignInLink(runtime)) return
  setLinkFeedback(runtime, text)
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

/** True when the mission page says the reward is already gone. */
export function isAlreadyClaimed(html: string): boolean {
  return /每日登录奖励已领取|登录奖励已领取/.test(html)
}

async function saveState(runtime: Runtime, state: SignInState): Promise<void> {
  await runtime.setValue(signInStateKey, state)
}

/**
 * Sign in on whichever V2EX page is opened first, once per UTC reward day.
 *
 * The reward does not depend on page content, so this does not wait for the
 * homepage's mission link. The gate is the **UTC** day (V2EX refreshes at
 * 00:00 UTC), so opening the site in the morning before the rollover resolves
 * the outgoing day and never blocks the incoming one.
 *
 * A failed check (error page, unrecognised markup) records nothing, so the next
 * page retries and the failure stays visible.
 */
export async function runSignInIfNeeded(runtime: Runtime): Promise<void> {
  const now = runtime.now()
  const utcDay = toUtcDateString(now)
  const state = parseSignInState(await runtime.getValue<unknown>(signInStateKey, null))

  if (state?.claimedUtcDate === utcDay) {
    // Say so in the sidebar: a silent skip is indistinguishable from a broken
    // script when the link is still sitting there offering the reward. V2EX
    // drops that link once the reward is taken, hence the log flag.
    const signedAt = state.signedAt
    const signedToday = signedAt !== null && toUtcDateString(signedAt) === utcDay
    console.debug(
      '[gm-v2ex-time-saver] sign-in: reward already resolved for this UTC day, skipping',
      {
        claimedUtcDate: state.claimedUtcDate,
        signedAt,
        sidebarLink: hasSignInLink(runtime),
      },
    )
    setLinkFeedback(
      runtime,
      signedToday ? `今日已签到 ${formatClockTime(signedAt)}` : '今日签到奖励已领取',
    )
    return
  }

  console.debug('[gm-v2ex-time-saver] sign-in start', { utcDay })
  try {
    const origin = runtime.location.origin
    const mission = await requestPage(runtime, `${origin}/mission/daily`)
    // Never parse an error page: a 403 or a WAF challenge looks exactly like a
    // mission page with no redeem button.
    if (mission.status >= 400) {
      throw new Error(`mission/daily http ${mission.status}`)
    }

    const redeemPath = extractRedeemUrl(mission.text)
    if (redeemPath) {
      const redeem = await requestPage(runtime, `${origin}${redeemPath}`)
      if (redeem.status >= 400) throw new Error(`redeem http ${redeem.status}`)
      await saveState(runtime, { claimedUtcDate: utcDay, signedAt: now })
      setLinkFeedback(runtime, '自动签到成功')
      showNotice(runtime, 'V2EX 每日签到成功', 'ok')
      console.debug('[gm-v2ex-time-saver] sign-in done', { signedAt: now })
      return
    }

    if (isAlreadyClaimed(mission.text)) {
      // Reward for this UTC day is gone (claimed elsewhere, or by us earlier).
      // Nothing can become available again before the next 00:00 UTC, so the
      // day is resolved without a retry.
      await saveState(runtime, { claimedUtcDate: utcDay, signedAt: state?.signedAt ?? null })
      setLinkFeedback(runtime, '今日签到奖励已领取')
      showNotice(runtime, '今日签到奖励已领取', 'ok')
      console.debug('[gm-v2ex-time-saver] sign-in: already claimed for this UTC day')
      return
    }

    // Neither a redeem link nor a "claimed" marker: the page is not what we
    // expect (logged out, interstitial, restyled markup). Record nothing so the
    // next page retries, and make the failure visible.
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
 * Tampermonkey menu command: drops the record and checks the mission page again,
 * so the current state (signed in, already claimed, or failing) can be reported
 * on demand instead of only during the first page load of the day.
 */
export function registerSignInCommand(runtime: Runtime): void {
  runtime.registerMenuCommand('检查/重试今日签到', () => {
    void (async () => {
      await runtime.deleteValue(signInStateKey)
      await runSignInIfNeeded(runtime)
    })()
  })
}
