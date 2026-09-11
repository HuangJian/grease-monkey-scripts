import type { Runtime } from '../../runtime'
import { SELECTORS } from './selectors'

/** GM storage key holding the last sign-in record. */
export const signInStateKey = 'v2ex_sign_in_state'

export type SignInState = {
  /** Local calendar day (`YYYY-MM-DD`) of the last attempt, successful or not. */
  attemptedDate: string
  /** Epoch ms of the last successful sign-in, or null when none succeeded yet. */
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
  const { attemptedDate, signedAt } = value as Record<string, unknown>
  if (typeof attemptedDate !== 'string') return null
  return { attemptedDate, signedAt: typeof signedAt === 'number' ? signedAt : null }
}

function setLinkFeedback(runtime: Runtime, text: string): void {
  const linkEl = runtime.document.querySelector(SELECTORS.signInLink)
  if (linkEl) linkEl.textContent = text
}

function requestMissionPage(runtime: Runtime): Promise<string> {
  return new Promise((resolve, reject) => {
    runtime.request({
      url: `${runtime.location.origin}/mission/daily`,
      method: 'GET',
      timeout: 30000,
      onload: (response) => resolve(response.responseText),
      onerror: () => reject(new Error('mission/daily request failed')),
      ontimeout: () => reject(new Error('mission/daily request timed out')),
    })
  })
}

function requestRedeem(runtime: Runtime, redeemPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    runtime.request({
      url: `${runtime.location.origin}${redeemPath}`,
      method: 'GET',
      timeout: 30000,
      onload: () => resolve(),
      onerror: () => reject(new Error('redeem request failed')),
      ontimeout: () => reject(new Error('redeem request timed out')),
    })
  })
}

/**
 * Sign in once per local calendar day, on whichever V2EX page is opened first.
 *
 * The daily reward does not depend on page content, so this no longer waits for
 * the homepage's mission link. A finished attempt is recorded under the local
 * date, so later pages on the same day stay silent; a failed request is not
 * recorded and is retried on the next page load.
 */
export async function runSignInIfNeeded(runtime: Runtime): Promise<void> {
  const today = toLocalDateString(runtime.now())
  const state = parseSignInState(await runtime.getValue<unknown>(signInStateKey, null))
  if (state?.attemptedDate === today) return

  console.debug('[gm-v2ex-time-saver] sign-in start', { today })
  try {
    const redeemPath = extractRedeemUrl(await requestMissionPage(runtime))
    if (!redeemPath) {
      // A mission page without the redeem button means there is nothing to
      // collect today — the reward was claimed manually or on another device
      // (a logged-out visit redirects to the sign-in page and lands here too).
      // Record the day either way, so later pages do not re-request it.
      await runtime.setValue(signInStateKey, {
        attemptedDate: today,
        signedAt: state?.signedAt ?? null,
      } satisfies SignInState)
      console.debug('[gm-v2ex-time-saver] sign-in: nothing to redeem today')
      return
    }

    await requestRedeem(runtime, redeemPath)
    await runtime.setValue(signInStateKey, {
      attemptedDate: today,
      signedAt: runtime.now(),
    } satisfies SignInState)
    setLinkFeedback(runtime, '自动签到成功')
    console.debug('[gm-v2ex-time-saver] sign-in done')
  } catch (e) {
    setLinkFeedback(runtime, '自动签到失败，请手动签到')
    console.warn('[gm-v2ex-time-saver] sign-in failed', e)
  }
}

/** Fire-and-forget entry point used by the app bootstrap. */
export function checkAndDoSignIn(runtime: Runtime): void {
  void runSignInIfNeeded(runtime).catch((e) => {
    console.error('[gm-v2ex-time-saver] sign-in error', e)
  })
}

export function extractRedeemUrl(html: string): string | null {
  const match = /location\.href\s*=\s*'(\/mission\/daily\/redeem[^']+)'/.exec(html)
  return match ? (match[1] ?? null) : null
}
