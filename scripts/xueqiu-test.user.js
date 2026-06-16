// ==UserScript==
// @name         xueqiu-test-v29
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      30.0
// @description  Captures API + Vue cross-validation, capped at 10 rounds
// @match        https://xueqiu.com/*
// @grant        none
// ==/UserScript==

;(function () {
  'use strict'

  function ts() {
    var d = new Date()
    return (
      d.toLocaleTimeString('zh-CN', { hour12: false }) +
      '.' +
      String(d.getTime() % 1000).padStart(3, '0')
    )
  }
  function log(m) {
    console.log('[' + ts() + '][xq-test] ' + m)
  }

  function jitter(b, v) {
    return b * (1 - v + Math.random() * v * 2)
  }

  // === Collector (page context) ===
  function injectCollector() {
    var el = document.createElement('script')
    el.textContent = `
      (function() {
        var hotItems = [], hotCount = 0
        var newsItems = [], newsCount = 0
        var origOpen = XMLHttpRequest.prototype.open
        XMLHttpRequest.prototype.open = function(method, url) {
          var u = typeof url === 'string' ? url : (url ? url.toString() : '')
          var self = this

          if (u.indexOf('/statuses/hot/listV3.json') !== -1) {
            self.addEventListener('load', function() {
              hotCount++
              try {
                var d = JSON.parse(self.responseText), items = d.list || []
                var page = (u.match(/page=(\\d+)/) || [])[1] || '?'
                var maxId = (u.match(/max_id=(\\d+)/) || [])[1] || '-'
                hotItems = hotItems.concat(items)
                console.log('[xq-test:HOT] #' + hotCount + ' page=' + page + ' max_id=' + maxId + ' items=' + items.length + ' has_next=' + d.has_next_page + ' total=' + hotItems.length)
              } catch(e) { console.log('[xq-test:HOT] #' + hotCount + ' parse error') }
            })
          }

          if (u.indexOf('/statuses/livenews/list.json') !== -1) {
            self.addEventListener('load', function() {
              newsCount++
              try {
                var d = JSON.parse(self.responseText), items = d.list || d.items || []
                var maxId = (u.match(/max_id=(\\d+)/) || [])[1] || '-'
                newsItems = newsItems.concat(items)
                console.log('[xq-test:NEWS] #' + newsCount + ' max_id=' + maxId + ' items=' + items.length + ' total=' + newsItems.length)
              } catch(e) { console.log('[xq-test:NEWS] #' + newsCount + ' parse error') }
            })
          }

          return origOpen.apply(this, arguments)
        }
        window.__xqCaptured = function() {
          return { hot: { items: hotItems, count: hotCount }, news: { items: newsItems, count: newsCount } }
        }
      })();
    `
    document.documentElement.appendChild(el)
  }

  // === Vue data reader ===
  function getVueStatuses() {
    var app = document.querySelector('#app')
    if (!app || !app.__vue__) return null
    var timeline = findVueComponent(app.__vue__, 'HomeTimeline', 0)
    if (!timeline) return null
    var data = timeline.$data
    if (!Array.isArray(data?.statuses)) return null
    return data.statuses
  }

  function findVueComponent(comp, name, depth) {
    if (depth > 8) return null
    if (comp.$options && comp.$options.name === name) return comp
    var children = comp.$children || []
    for (var i = 0; i < children.length; i++) {
      var found = findVueComponent(children[i], name, depth + 1)
      if (found) return found
    }
    return null
  }

  // === DOM helpers ===
  function humanClick(el) {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    el.click()
  }

  function clickTab(text) {
    var links = document.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      if (links[i].textContent && links[i].textContent.trim() === text) {
        if (!links[i].classList.contains('active')) {
          log('Click tab: ' + text)
          humanClick(links[i])
          return true
        }
      }
    }
    log('Tab not found: ' + text)
    return false
  }

  function doScroll() {
    var main = document.querySelector('.home__main')
    if (main) {
      var f = 0.4 + Math.random() * 0.5
      main.scrollBy(0, Math.round(main.clientHeight * f))
      return
    }
    window.scrollBy(0, Math.round(window.innerHeight * (0.4 + Math.random() * 0.5)))
  }

  function clickLoadMore() {
    var btn =
      document.querySelector('.home-timeline > a') || document.querySelector('.status-list > a')
    if (btn) {
      btn.click()
      return true
    }
    return false
  }

  // === Round-based loop: exit immediately when no new data ===
  async function scrollLoop(label, maxRounds) {
    var prevTotal = -1
    for (var r = 1; r <= maxRounds; r++) {
      doScroll()
      await wait(jitter(4000, 0.4))
      clickLoadMore()
      await wait(jitter(4000, 0.4))

      var cap = window.__xqCaptured ? window.__xqCaptured() : null
      var total =
        label === 'hot' ? (cap?.hot?.items?.length ?? -1) : (cap?.news?.items?.length ?? -1)
      if (prevTotal >= 0 && total === prevTotal) {
        log(label + ': no new data, stopping after ' + r + ' rounds')
        return
      }
      prevTotal = total
    }
  }

  var wait = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms)
    })
  }

  // === Main ===
  setTimeout(async function () {
    log('Starting...')

    // Phase 1: 7x24 news
    clickTab('7x24')
    await wait(jitter(5000, 0.4))
    log('Phase 1: scrolling 7x24 (max 10 rounds)')
    await scrollLoop('news', 10)

    // Snapshot Vue after news
    var vueNews = getVueStatuses()
    log('Vue news count: ' + (vueNews ? vueNews.length : 'N/A'))

    // Phase 2: hot posts
    clickTab('热门')
    await wait(jitter(5000, 0.4))
    log('Phase 2: scrolling hot (max 10 rounds)')
    await scrollLoop('hot', 10)

    // Snapshot Vue after hot
    var vueHot = getVueStatuses()
    log('Vue hot count: ' + (vueHot ? vueHot.length : 'N/A'))

    // === Cross-validate ===
    await wait(2000)
    var cap = window.__xqCaptured ? window.__xqCaptured() : null
    log('=== CROSS-VALIDATION ===')

    if (cap) {
      // News
      var nApi = cap.news.items
      log('NEWS: API=' + nApi.length + ' items | Vue=' + (vueNews ? vueNews.length : 'N/A'))
      if (nApi.length && vueNews) {
        var apiIds = new Set(
          nApi.map(function (i) {
            return i.id
          }),
        )
        var vueIds = new Set(
          vueNews.map(function (i) {
            return i.id
          }),
        )
        var overlap = new Set(
          [...apiIds].filter(function (x) {
            return vueIds.has(x)
          }),
        )
        log(
          'NEWS: API unique=' +
            apiIds.size +
            ' Vue unique=' +
            vueIds.size +
            ' overlap=' +
            overlap.size,
        )
      }

      // Hot
      var hApi = cap.hot.items
      log('HOT: API=' + hApi.length + ' items | Vue=' + (vueHot ? vueHot.length : 'N/A'))
      if (hApi.length && vueHot) {
        var apiIds2 = new Set(
          hApi.map(function (i) {
            return i.id
          }),
        )
        var vueIds2 = new Set(
          vueHot.map(function (i) {
            return i.id
          }),
        )
        var overlap2 = new Set(
          [...apiIds2].filter(function (x) {
            return vueIds2.has(x)
          }),
        )
        log(
          'HOT: API unique=' +
            apiIds2.size +
            ' Vue unique=' +
            vueIds2.size +
            ' overlap=' +
            overlap2.size,
        )

        // Show items in API but not in Vue (newer data?)
        var apiOnly = [...apiIds2].filter(function (x) {
          return !vueIds2.has(x)
        })
        if (apiOnly.length)
          log(
            'HOT: items in API only (newer?): ' +
              apiOnly.slice(0, 5).join(',') +
              (apiOnly.length > 5 ? '...' : ''),
          )
      }
    }

    log('=== DONE ===')
  }, 3000)

  injectCollector()
  log('Ready')
})()
