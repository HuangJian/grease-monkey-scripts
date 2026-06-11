import type { Runtime } from '../../runtime'
import { toAbsoluteUrl } from '../../utils'

export function fetchPage(
  runtime: Runtime,
  url: string,
  onSuccess: (result: { html: string; status: number }) => void,
  onFailure: () => void,
) {
  runtime.request({
    url: toAbsoluteUrl(url, runtime.location.href),
    method: 'GET',
    timeout: 120000,
    onload: (response) =>
      onSuccess({ html: response.responseText, status: response.status ?? 200 }),
    onerror: onFailure,
    ontimeout: onFailure,
  })
}
