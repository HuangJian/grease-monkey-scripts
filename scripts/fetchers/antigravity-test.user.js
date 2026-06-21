// ==UserScript==
// @name         antigravity-quota-test
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Test Antigravity quota API via GM_xmlhttpRequest (needs Google OAuth refresh token)
//
// == 如何获取 Refresh Token ==
//
// 参考项目: https://github.com/fhyfhy17/anti-quota
//          https://github.com/frieser/opencode-antigravity-quota
//
// 1. 安装 anti-quota 扩展（https://github.com/fhyfhy17/anti-quota）
//    登录 Antigravity IDE 后会自动导入账号，token 保存在 ~/.anti-quota/accounts.json
//    或
// 2. 安装 opencode-antigravity-auth 插件
//    执行 opencode auth login，token 保存在 ~/.config/opencode/antigravity-accounts.json
//    或
// 3. 直接从 Antigravity IDE 数据库提取:
//      sqlite3 ~/Library/Application\ Support/Antigravity/User/globalStorage/state.vscdb \
//        "SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.oauthToken'" \
//        | bun run scripts/extract-antigravity-token.ts
//
// @match        https://github.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      oauth2.googleapis.com
// @connect      cloudcode-pa.googleapis.com
// ==/UserScript==

;(function () {
  'use strict'

  const CONFIG_KEY = 'gm:misc:antigravity'

  const CLIENT_ID = ''
  const CLIENT_SECRET = ''
  const TOKEN_URL = 'https://oauth2.googleapis.com/token'
  const CLOUDCODE_URL = 'https://cloudcode-pa.googleapis.com'

  function ts() {
    const d = new Date()
    return (
      d.toLocaleTimeString('zh-CN', { hour12: false }) +
      '.' +
      String(d.getTime() % 1000).padStart(3, '0')
    )
  }
  function log(m) {
    console.log('[' + ts() + '][antigravity-test] ' + m)
  }

  function gmFetch(opts) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        url: opts.url,
        method: opts.method || 'GET',
        headers: opts.headers || {},
        data: opts.data,
        timeout: opts.timeout || 20000,
        onload: function (resp) {
          resolve(resp)
        },
        onerror: function () {
          reject(new Error('network error for ' + opts.url))
        },
        ontimeout: function () {
          reject(new Error('timeout for ' + opts.url))
        },
      })
    })
  }

  async function loadConfig() {
    try {
      const raw = await GM.getValue(CONFIG_KEY, null)
      if (raw && typeof raw === 'object') return raw
    } catch (e) {
      log('loadConfig error: ' + e.message)
    }
    return {}
  }

  async function saveConfig(cfg) {
    cfg.savedAt = Date.now()
    await GM.setValue(CONFIG_KEY, cfg)
    log('Config saved')
  }

  async function refreshAccessToken(refreshToken) {
    log('Refreshing access token...')
    const body =
      'client_id=' +
      encodeURIComponent(CLIENT_ID) +
      '&client_secret=' +
      encodeURIComponent(CLIENT_SECRET) +
      '&refresh_token=' +
      encodeURIComponent(refreshToken) +
      '&grant_type=refresh_token'

    const resp = await gmFetch({
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: body,
    })

    if (resp.status >= 400) {
      throw new Error(
        'token refresh failed: ' + resp.status + ' ' + resp.responseText.slice(0, 200),
      )
    }

    const data = JSON.parse(resp.responseText)
    log('Access token obtained (expires_in=' + data.expires_in + 's)')
    return data.access_token
  }

  async function loadCodeAssist(accessToken) {
    log('Calling loadCodeAssist...')
    const resp = await gmFetch({
      url: CLOUDCODE_URL + '/v1internal:loadCodeAssist',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'User-Agent': 'antigravity',
      },
      data: JSON.stringify({
        metadata: {
          ideType: 'ANTIGRAVITY',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
        },
      }),
    })

    if (resp.status >= 400) {
      throw new Error(
        'loadCodeAssist failed: ' + resp.status + ' ' + resp.responseText.slice(0, 200),
      )
    }

    const data = JSON.parse(resp.responseText)
    log('loadCodeAssist response keys: ' + Object.keys(data).join(', '))

    // Extract project ID — can be string or { id: string }
    const project = data.cloudaicompanionProject
    let projectId
    if (typeof project === 'string' && project) {
      projectId = project
    } else if (project && typeof project === 'object' && project.id) {
      projectId = project.id
    }

    if (projectId) {
      log('Project ID: ' + projectId)
    } else {
      log('No project ID found, will try without')
    }

    return { projectId, raw: data }
  }

  async function fetchAvailableModels(accessToken, projectId) {
    const payload = projectId ? { project: projectId } : {}
    log('Calling fetchAvailableModels (projectId=' + (projectId || 'none') + ')...')

    const resp = await gmFetch({
      url: CLOUDCODE_URL + '/v1internal:fetchAvailableModels',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'User-Agent': 'antigravity',
      },
      data: JSON.stringify(payload),
    })

    if (resp.status >= 400) {
      throw new Error(
        'fetchAvailableModels failed: ' + resp.status + ' ' + resp.responseText.slice(0, 200),
      )
    }

    const data = JSON.parse(resp.responseText)
    log('fetchAvailableModels models count: ' + (data.models ? Object.keys(data.models).length : 0))

    return data
  }

  function formatDuration(ms) {
    if (ms <= 0) return 'Ready'
    const min = Math.ceil(ms / 60000)
    if (min < 60) return min + 'm'
    const h = Math.floor(min / 60)
    if (h < 24) return h + 'h ' + (min % 60) + 'm'
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
  }

  function printQuota(data) {
    if (!data.models) {
      log('No models data in response')
      return
    }

    log('=== Antigravity Quota ===')
    const now = Date.now()

    Object.keys(data.models)
      .sort()
      .forEach(function (key) {
        const m = data.models[key]
        const qi = m.quotaInfo
        if (!qi) return

        const pct = Math.min(100, Math.max(0, (qi.remainingFraction || 0) * 100))
        const label = m.displayName || key
        const modelId = m.model || key

        // Parse reset time
        let resetAt = 'unknown'
        if (qi.resetTime) {
          const parsed = new Date(qi.resetTime)
          if (!isNaN(parsed.getTime())) {
            const diff = parsed.getTime() - now
            resetAt = diff > 0 ? formatDuration(diff) : 'Ready'
          }
        }

        var bar = ''
        var filled = Math.round(pct / 10)
        for (var i = 0; i < 10; i++) {
          bar += i < filled ? '█' : '░'
        }

        log('[' + bar + '] ' + pct.toFixed(1) + '%  ' + label)
        log('  model=' + modelId + '  reset=' + resetAt)
        if (m.recommended) log('  (recommended)')
        if (m.tagTitle) log('  tag=' + m.tagTitle)
      })
  }

  async function setRefreshTokenViaPrompt() {
    var token = prompt('Paste your Antigravity refresh token:')
    if (!token) {
      log('No token entered')
      return
    }
    token = token.trim()
    await saveConfig({ refreshToken: token })
    log('Refresh token saved. Refreshing page to fetch...')
    await runQuotaCheck(token)
  }

  async function runQuotaCheck(refreshToken) {
    try {
      var accessToken = await refreshAccessToken(refreshToken)
      var projectInfo = await loadCodeAssist(accessToken)
      var quotaData = await fetchAvailableModels(accessToken, projectInfo.projectId)
      printQuota(quotaData)
      log('=== Full response ===')
      log(JSON.stringify(quotaData, null, 2))
    } catch (e) {
      log('Error: ' + e.message)
    }
  }

  async function main() {
    log('Starting...')

    const cfg = await loadConfig()
    if (cfg.refreshToken) {
      log('Refresh token found (' + cfg.refreshToken.slice(0, 20) + '...)')
      await runQuotaCheck(cfg.refreshToken)
    } else {
      log('No refresh token stored. Use Tampermonkey menu → "Set Antigravity Token" to configure.')
    }
  }

  GM_registerMenuCommand('Set Antigravity Refresh Token', function () {
    void setRefreshTokenViaPrompt()
  })
  GM_registerMenuCommand('Clear Antigravity Token', function () {
    GM_setValue(CONFIG_KEY, null)
    log('Token cleared')
  })

  log('Ready — use Tampermonkey menu to set refresh token')
  setTimeout(main, 1000)
})()
