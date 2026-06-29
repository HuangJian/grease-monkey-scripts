// ==UserScript==
// @name         Prism · 棱镜
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      2.0
// @description  Prism · 棱镜 —— Observe. Reflect. Create.
// @author       ustc.hj@gmail.com
// @match        https://v2ex.com/*
// @match        https://*.v2ex.com/*
// @match        https://github.com/*
// @match        https://reddit.com/*
// @match        https://*.reddit.com/*
// @match        https://*.hupu.com/*
// @match        https://xueqiu.com/*
// @match        https://*.xueqiu.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        GM_addStyle
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
// @connect      rsshub.rssforever.com
// @connect      oauth2.googleapis.com
// @connect      cloudcode-pa.googleapis.com
// @connect      openrouter.ai
// @connect      api-sg-central.trae.ai
// @connect      chatgpt.com
// ==/UserScript==

import { startDashboard } from './app'
import { createBrowserRuntime } from '../runtime'

void startDashboard(createBrowserRuntime())
