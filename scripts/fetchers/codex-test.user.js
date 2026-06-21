// ==UserScript==
// @name         codex-usage-test
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      2.0
// @description  Test Codex usage API via GM_xmlhttpRequest (standalone, needs Bearer token)
//
// == 如何获取 Bearer Token ==
//
// 参考项目: https://github.com/haozi/pi-codex-status
//
// 1. 登录 https://chatgpt.com, 打开浏览器 DevTools (F12)
// 2. 切换到 Application > Cookies, 找到 __Secure-next-auth.session-token
//    或切换到 Network, 找一个请求找到 authorization: Bearer 头
//    或
// 3. 从本地文件提取 (~/.codex/auth.json) 中的 accessToken 字段
//    或
// 4. 在 chatgpt.com 的控制台执行:
//      fetch('/backend-api/wham/usage', {headers:{authorization:'Bearer '+document.cookie.match(/__Secure-next-auth.session-token=([^;]+)/)?.[1]}})
//      .then(r=>r.json()).then(console.log)
//
// @match        https://github.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      chatgpt.com
// ==/UserScript==

;(function () {
  'use strict'

  const CONFIG_KEY = 'gm:misc:codex'
  const WHAM_URL = 'https://chatgpt.com/backend-api/wham/usage'

  function ts() {
    const d = new Date()
    return (
      d.toLocaleTimeString('zh-CN', { hour12: false }) +
      '.' +
      String(d.getTime() % 1000).padStart(3, '0')
    )
  }
  function log(m) {
    console.log('[' + ts() + '][codex-test] ' + m)
  }

  async function loadToken() {
    try {
      const raw = await GM.getValue(CONFIG_KEY, null)
      if (raw && typeof raw === 'object' && raw.token) return raw.token
    } catch (e) {
      log('loadToken error: ' + e.message)
    }
    return null
  }

  async function saveToken(token) {
    await GM.setValue(CONFIG_KEY, { token: token, savedAt: Date.now() })
    log('Token saved')
  }

  function fetchUsage(token) {
    log('Fetching ' + WHAM_URL + ' ...')
    GM_xmlhttpRequest({
      url: WHAM_URL,
      method: 'GET',
      timeout: 15000,
      headers: {
        accept: '*/*',
        authorization: 'Bearer ' + token,
      },
      onload: function (resp) {
        if (resp.status >= 400) {
          log('HTTP ' + resp.status + ' ' + resp.statusText)
          return
        }
        try {
          var data = JSON.parse(resp.responseText)
          log('=== Codex Usage ===')
          log('plan_type=' + data.plan_type)
          log('email=' + data.email)
          log('allowed=' + data.rate_limit?.allowed)
          log('limit_reached=' + data.rate_limit?.limit_reached)
          if (data.rate_limit?.primary_window) {
            var w = data.rate_limit.primary_window
            log('primary.used_percent=' + w.used_percent)
            log('primary.left_percent=' + (100 - w.used_percent))
            log('primary.reset_at=' + new Date(w.reset_at * 1000).toLocaleString())
            log('primary.window_seconds=' + w.limit_window_seconds)
          }
          if (data.credits) {
            log('credits.has_credits=' + data.credits.has_credits)
            log('credits.balance=' + data.credits.balance)
            log('credits.approx_local_messages=' + data.credits.approx_local_messages)
            log('credits.approx_cloud_messages=' + data.credits.approx_cloud_messages)
          }
          log('full=' + JSON.stringify(data, null, 2))
        } catch (e) {
          log('parse error: ' + e.message)
        }
      },
      onerror: function () {
        log('network error')
      },
      ontimeout: function () {
        log('timeout')
      },
    })
  }

  async function setTokenViaPrompt() {
    var token = prompt('Paste your Codex Bearer token:')
    if (!token) {
      log('No token entered')
      return
    }
    // Strip "Bearer " prefix if present
    token = token.replace(/^Bearer\s+/i, '')
    await saveToken(token)
    log('Token saved (' + token.slice(0, 20) + '...). Refreshing page to fetch...')
    fetchUsage(token)
  }

  async function main() {
    log('Starting...')

    const token = await loadToken()
    if (token) {
      log('Token found: ' + token.slice(0, 20) + '...')
      fetchUsage(token)
    } else {
      log('No token stored. Use Tampermonkey menu → "Set Codex Token" to configure.')
      log('Or run in console: GM_setValue("gm:misc:codex", {token: "paste-token-here"})')
    }
  }

  // Register menu commands
  GM_registerMenuCommand('Set Codex Token', function () {
    void setTokenViaPrompt()
  })
  GM_registerMenuCommand('Clear Codex Token', function () {
    GM_setValue(CONFIG_KEY, null)
    log('Token cleared')
  })

  log('Ready — use Tampermonkey menu to set token')
  setTimeout(main, 1000)
})()
