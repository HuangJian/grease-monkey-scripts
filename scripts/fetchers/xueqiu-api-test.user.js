// ==UserScript==
// @name         xueqiu-api-test-v3
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      3.0
// @description  Verify direct API approach — page-context fetch for WAF-protected HOT, GM_xhr for NEWS
// @match        https://xueqiu.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      xueqiu.com
// @run-at       document-idle
// ==/UserScript==

;(function () {
  'use strict'

  function log(m) {
    console.log('[xq-api] ' + m)
  }

  // ---- Page-context fetch (bypasses WAF — runs with page's cookies + fingerprint) ----

  async function pageFetch(url) {
    var res = await unsafeWindow.fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*' },
    })
    if (!res.ok) {
      var body = await res.text()
      throw new Error(
        'pageFetch HTTP ' + res.status + ' for ' + url + '\n  body[:300]: ' + body.slice(0, 300),
      )
    }
    return res.json()
  }

  // ---- GM_xmlhttpRequest (for NEWS — works without WAF issues) ----

  function gmFetch(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        timeout: 15000,
        onload: function (res) {
          if (res.status !== 200) {
            reject(
              new Error(
                'gmFetch HTTP ' +
                  res.status +
                  ' for ' +
                  url +
                  '\n  body[:300]: ' +
                  String(res.responseText).slice(0, 300),
              ),
            )
            return
          }
          try {
            resolve(JSON.parse(res.responseText))
          } catch (e) {
            reject(
              new Error(
                'gmFetch JSON parse failed for ' +
                  url +
                  ': ' +
                  e.message +
                  '\n  body[:300]: ' +
                  String(res.responseText).slice(0, 300),
              ),
            )
          }
        },
        onerror: function () {
          reject(new Error('gmFetch network error for ' + url))
        },
        ontimeout: function () {
          reject(new Error('gmFetch timeout for ' + url))
        },
      })
    })
  }

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms)
    })
  }

  // Random delay in [min, max] ms — simulates human pacing to avoid rate limiting
  function waitRandom(minMs, maxMs) {
    var ms = minMs + Math.random() * (maxMs - minMs)
    return wait(ms)
  }

  // ---- Field analysis (matches toNewsItem in fetcher.ts) ----

  var ALL_FIELDS = [
    'id',
    'title',
    'text',
    'description',
    'target',
    'created_at',
    'status_id',
    'reply_count',
    'like_count',
    'share_count',
    'view_count',
    'sub_type',
    'fav_count',
    'retweet_count',
    'type',
  ]

  function analyzeItem(item) {
    var present = ALL_FIELDS.filter(function (f) {
      return f in item
    })
    var absent = ALL_FIELDS.filter(function (f) {
      return !(f in item)
    })
    log('  item keys (' + present.length + '): ' + present.sort().join(', '))
    if (absent.length) log('  absent: ' + absent.sort().join(', '))
  }

  function showSample(item) {
    log(
      '  sample: id=' +
        item.id +
        ' created_at=' +
        new Date(item.created_at).toLocaleString('zh-CN') +
        ' text=' +
        String(item.text || item.title || item.description || '').slice(0, 60),
    )
  }

  function showResponseKeys(data, label) {
    var keys = Object.keys(data).sort()
    log(label + ' response root keys: ' + keys.join(', '))
    var pageKeys = keys.filter(function (k) {
      return /next|page|max|cursor|has/i.test(k)
    })
    if (pageKeys.length)
      log(
        label +
          ' pagination fields: ' +
          pageKeys
            .map(function (k) {
              return k + '=' + data[k]
            })
            .join(', '),
      )
  }

  // ---- Paginated fetcher (supports page-based and cursor-based) ----
  // pageMode: 'page'   → increment ?page=N each round (HOT)
  //           'cursor' → use server-provided next_max_id (NEWS)

  async function fetchPaginated(label, baseUrl, fetchFn, maxRounds, pageMode) {
    var allItems = []
    var nextMaxId = null

    for (var round = 1; round <= maxRounds; round++) {
      var url = baseUrl
      if (pageMode === 'page') {
        // Replace or append page=N
        url = url.replace(/([?&])page=\d+/, '$1page=' + round)
        if (url.indexOf('page=') === -1) {
          url += (url.indexOf('?') === -1 ? '?' : '&') + 'page=' + round
        }
      } else if (nextMaxId) {
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'max_id=' + nextMaxId
      }

      var t0 = Date.now()
      var data
      try {
        data = await fetchFn(url)
      } catch (e) {
        log(label + ' round ' + round + ' FAILED: ' + e.message)
        return allItems
      }
      var elapsed = Date.now() - t0

      if (round === 1) showResponseKeys(data, label)

      var items = data.list || data.items || []
      log(
        label +
          ' round ' +
          round +
          ': ' +
          items.length +
          ' items in ' +
          elapsed +
          'ms' +
          ' total=' +
          (allItems.length + items.length),
      )

      if (items.length === 0) {
        log(label + ': empty page, stopping')
        break
      }

      if (round === 1) {
        showSample(items[0])
        analyzeItem(items[0])
      }

      allItems = allItems.concat(items)

      if (pageMode === 'cursor') {
        nextMaxId = data.next_max_id || data.next_id
        if (!nextMaxId) {
          log(label + ': no next_max_id in response, stopping')
          break
        }
      }
      if (data.has_next_page === false) {
        log(label + ': has_next_page=false, stopping')
        break
      }

      await waitRandom(3000, 5000)
    }

    // Dedup
    var seen = {}
    var unique = allItems.filter(function (it) {
      if (seen[it.id]) return false
      seen[it.id] = true
      return true
    })
    log(label + ': done — ' + allItems.length + ' fetched, ' + unique.length + ' unique')
    return unique
  }

  // ---- Main ----

  async function main() {
    var t0 = Date.now()
    log('Starting direct API verification...')

    // HOT: page-context fetch (WAF-protected endpoint)
    log('=== HOT POSTS (page-context fetch) ===')
    var hot = await fetchPaginated(
      'HOT',
      'https://xueqiu.com/statuses/hot/listV3.json?page=1',
      pageFetch,
      5,
      'page',
    )

    await waitRandom(3000, 5000)

    // NEWS: GM_xmlhttpRequest (no WAF on this endpoint)
    log('=== NEWS (GM_xmlhttpRequest) ===')
    var news = await fetchPaginated(
      'NEWS',
      'https://xueqiu.com/statuses/livenews/list.json',
      gmFetch,
      5,
      'cursor',
    )

    // ---- Print all titles ----
    log('=== HOT TITLES (' + hot.length + ') ===')
    hot.forEach(function (it, i) {
      var title = String(it.title || it.text || it.description || '')
      log(i + 1 + '. [' + it.id + '] ' + title.slice(0, 100))
    })

    await waitRandom(3000, 5000)

    log('=== NEWS TITLES (' + news.length + ') ===')
    news.forEach(function (it, i) {
      var title = String(it.title || it.text || it.description || '')
      log(i + 1 + '. [' + it.id + '] ' + title.slice(0, 100))
    })

    log('=== SUMMARY ===')
    log('HOT:  ' + hot.length + ' items (via pageFetch)')
    log('NEWS: ' + news.length + ' items (via gmFetch)')
    log('=== ALL DONE in ' + (Date.now() - t0) + 'ms ===')
  }

  setTimeout(main, 2000)
})()
