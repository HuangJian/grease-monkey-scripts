// ==UserScript==
// @name         dashboard
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Personal info dashboard overlay (double-tap Shift) on host sites
// @author       ustc.hj@gmail.com
// @match        https://mail.google.com/*
// @match        https://v2ex.com/*
// @match        https://*.v2ex.com/*
// @match        https://github.com/*
// @match        https://reddit.com/*
// @match        https://*.reddit.com/*
// @match        https://bbs.hupu.com/*
// @match        https://*.hupu.com/*
// @match        https://xueqiu.com/*
// @match        https://www.xueqiu.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @connect      api.open-meteo.com
// @connect      air-quality-api.open-meteo.com
// @connect      weather.cma.cn
// @connect      www.v2ex.com
// @connect      www.sudugu.org
// @connect      www.reddit.com
// @connect      old.reddit.com
// @connect      bbs.hupu.com
// @connect      xueqiu.com
// @connect      rsshub.app
// @connect      rsshub.rssforever.com
// @connect      oauth2.googleapis.com
// @connect      cloudcode-pa.googleapis.com
// @connect      openrouter.ai
// @connect      api-sg-central.trae.ai
// @connect      chatgpt.com
// ==/UserScript==
// ==build.meta==
// css: src/dashboard/overlay/styles.ts
// placeholder: /*{{DASHBOARD_CSS}}*/
// ==/build.meta==

// tnews 镜像 fallback：仅对 rsshub.app 域名生效。
// 如需使用其它公共/私有 RSSHub 镜像，请同时：
//   1. 在上方 @connect 区添加对应 hostname
//   2. 在「编辑仪表盘配置」中把镜像 hostname 加到 tnews.mirrors 数组

import { startDashboard } from './app'
import { createBrowserRuntime } from '../runtime'

void startDashboard(createBrowserRuntime())
