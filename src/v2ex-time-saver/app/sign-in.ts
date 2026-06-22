import type { Runtime } from '../../runtime'

export function checkAndDoSignIn(runtime: Runtime): void {
  const linkEl = runtime.document.querySelector("a[href='/mission/daily']")
  if (!linkEl) return

  const missionUrl = `${runtime.location.origin}/mission/daily`
  runtime.request({
    url: missionUrl,
    method: 'GET',
    timeout: 30000,
    onload(response) {
      const redeemPath = extractRedeemUrl(response.responseText)
      if (!redeemPath) {
        linkEl.textContent = '自动签到失败，请手动签到'
        return
      }

      runtime.request({
        url: `${runtime.location.origin}${redeemPath}`,
        method: 'GET',
        timeout: 30000,
        onload() {
          linkEl.textContent = '自动签到成功'
        },
      })
    },
  })
}

export function extractRedeemUrl(html: string): string | null {
  const match = /location\.href\s*=\s*'(\/mission\/daily\/redeem[^']+)'/.exec(html)
  return match ? match[1] : null
}
