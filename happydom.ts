import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({
  settings: {
    // Tests inject real-site HTML fixtures. Left enabled, happy-dom's
    // <link>/<script> handling issues real HTTP requests for the referenced
    // assets, which stalls every run on DNS/connection errors.
    disableCSSFileLoading: true,
    disableJavaScriptFileLoading: true,
    handleDisabledFileLoadingAsSuccess: true,
    // Simulated clicks on <a> would otherwise navigate and download the target
    // page. Navigation is disabled but the URL fallback is left on, so a click
    // still updates `location` without touching the network.
    navigation: {
      disableMainFrameNavigation: true,
      disableChildFrameNavigation: true,
      disableChildPageNavigation: true,
    },
  },
})

// Hard guard: no test may reach the network. Fail fast and loudly instead of
// hanging until the runner's timeout, so an accidental live call is obvious.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return Promise.reject(
      new Error(
        `[test] real network is blocked (${url}). Use a fixture or queue a response on the test runtime.`,
      ),
    )
  }
  return realFetch(input, init)
}) as typeof globalThis.fetch
