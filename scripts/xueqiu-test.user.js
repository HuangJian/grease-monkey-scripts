// ==UserScript==
// @name         xueqiu-test-v16
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      16.0
// @description  Test Xueqiu fetch logic - debug hot posts issue
// @match        https://xueqiu.com/*
// @grant        none
// ==/UserScript==

;(function () {
  'use strict'

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms)
    })
  }

  function getStatuses(comp) {
    if (!comp) return []
    var data = comp.$data || {}
    return Array.isArray(data.statuses) ? data.statuses : []
  }

  function findHomeTimeline(comp, depth) {
    if (depth > 6) return null
    if (comp.$options && comp.$options.name === 'HomeTimeline') return comp
    var children = comp.$children || []
    for (var i = 0; i < children.length; i++) {
      var found = findHomeTimeline(children[i], depth + 1)
      if (found) return found
    }
    return null
  }

  function clickTab(text) {
    var links = document.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      if (links[i].textContent && links[i].textContent.trim() === text) {
        if (!links[i].classList.contains('active')) {
          links[i].click()
        }
        return true
      }
    }
    return false
  }

  function scrollToBottom() {
    var main = document.querySelector('.home__main')
    if (main) {
      main.scrollBy(0, main.clientHeight)
    } else {
      window.scrollBy(0, window.innerHeight)
    }
  }

  function clickLoadMore() {
    var btn = document.querySelector('.home-timeline > a')
    if (btn) {
      btn.click()
      return true
    }
    return false
  }

  async function autoScrollAndLoad() {
    var scrollWaitMs = 100
    var scrollMaxNoChange = 20
    var lastCount = 0
    var noChangeCount = 0

    for (var i = 0; i < 50; i++) {
      var appEl = document.querySelector('#app')
      var timeline = appEl && appEl.__vue__ ? findHomeTimeline(appEl.__vue__, 0) : null
      var statuses = timeline ? getStatuses(timeline) : []
      var currentCount = statuses.length

      if (currentCount === lastCount) {
        noChangeCount++
        if (noChangeCount >= scrollMaxNoChange) {
          break
        }
      } else {
        noChangeCount = 0
      }

      lastCount = currentCount

      scrollToBottom()
      await wait(scrollWaitMs)

      clickLoadMore()
      await wait(scrollWaitMs)
    }
  }

  setTimeout(async function () {
    console.log('[xueqiu-test] === Starting test ===')

    // Step 1: Check Vue instance
    var app = document.querySelector('#app')
    if (!app || !app.__vue__) {
      console.error('[xueqiu-test] FAIL: Vue instance not found')
      return
    }
    console.log('[xueqiu-test] OK: Vue instance found')

    // Step 2: Find HomeTimeline component
    var timeline = findHomeTimeline(app.__vue__, 0)
    if (!timeline) {
      console.error('[xueqiu-test] FAIL: HomeTimeline component not found')
      return
    }
    console.log('[xueqiu-test] OK: HomeTimeline component found')

    // Step 3: Test 7x24 tab
    console.log('[xueqiu-test] === Testing 7x24 tab ===')
    clickTab('7x24')
    await wait(1000)

    var statuses7x24 = getStatuses(timeline)
    console.log('[xueqiu-test] 7x24 initial count:', statuses7x24.length)

    // Load more
    await autoScrollAndLoad()

    var statuses7x24After = getStatuses(timeline)
    console.log('[xueqiu-test] 7x24 final count:', statuses7x24After.length)

    if (statuses7x24After.length > 0) {
      var firstItem = statuses7x24After[0]
      console.log('[xueqiu-test] First 7x24 item:')
      console.log('[xueqiu-test]   id:', firstItem.id)
      console.log('[xueqiu-test]   title:', (firstItem.title || '').slice(0, 50))
      console.log('[xueqiu-test]   text:', (firstItem.text || '').slice(0, 50))
      console.log('[xueqiu-test]   target:', firstItem.target)
      console.log('[xueqiu-test]   reply_count:', firstItem.reply_count)
      console.log('[xueqiu-test]   like_count:', firstItem.like_count)
    }

    // Step 4: Test 热门 tab - debug
    console.log('[xueqiu-test] === Testing 热门 tab ===')

    // Check tab links
    var allLinks = document.querySelectorAll('a')
    var tabLinks = []
    for (var j = 0; j < allLinks.length; j++) {
      var text = allLinks[j].textContent.trim()
      if (text === '7x24' || text === '热门') {
        tabLinks.push({
          text: text,
          active: allLinks[j].classList.contains('active'),
          href: allLinks[j].href,
        })
      }
    }
    console.log('[xueqiu-test] Tab links found:', tabLinks)

    // Click 热门 tab
    var clickedHot = clickTab('热门')
    console.log('[xueqiu-test] Clicked 热门 tab:', clickedHot)

    // Wait longer for data to load
    console.log('[xueqiu-test] Waiting 3 seconds for data...')
    await wait(3000)

    // Check Vue data
    console.log('[xueqiu-test] HomeTimeline $data keys:', Object.keys(timeline.$data || {}))

    var statusesHot = getStatuses(timeline)
    console.log('[xueqiu-test] 热门 statuses count:', statusesHot.length)

    // Check if there are other components with data
    console.log('[xueqiu-test] Checking for other timeline components...')
    function findAllTimelines(comp, depth) {
      if (depth > 6) return []
      var results = []
      if (comp.$options && comp.$options.name) {
        results.push({
          name: comp.$options.name,
          hasStatuses: Array.isArray(comp.$data?.statuses),
          statusesCount: Array.isArray(comp.$data?.statuses) ? comp.$data.statuses.length : 0,
        })
      }
      var children = comp.$children || []
      for (var i = 0; i < children.length; i++) {
        results = results.concat(findAllTimelines(children[i], depth + 1))
      }
      return results
    }

    var allTimelines = findAllTimelines(app.__vue__, 0)
    console.log('[xueqiu-test] All timeline-like components:', allTimelines)

    // Try to scroll and load more for hot posts
    console.log('[xueqiu-test] Scrolling for hot posts...')
    await autoScrollAndLoad()

    var statusesHotAfter = getStatuses(timeline)
    console.log('[xueqiu-test] 热门 after scroll:', statusesHotAfter.length, 'items')

    // Summary
    console.log('[xueqiu-test] === Summary ===')
    console.log('[xueqiu-test] 7x24 news:', statuses7x24After.length, 'items')
    console.log('[xueqiu-test] 热门 hotPosts:', statusesHotAfter.length, 'items')

    if (statusesHotAfter.length === 0) {
      console.error('[xueqiu-test] WARNING: 热门 tab has no data')
      console.log('[xueqiu-test] Possible causes:')
      console.log('[xueqiu-test]   1. "热门" tab might not be the correct selector')
      console.log('[xueqiu-test]   2. Data might be stored in a different component')
      console.log('[xueqiu-test]   3. Need to wait longer for data to load')
    }

    console.log('[xueqiu-test] === Test complete ===')
  }, 3000)
})()
