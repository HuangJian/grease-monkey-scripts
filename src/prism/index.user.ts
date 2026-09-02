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
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @require      https://cdn.jsdelivr.net/npm/preact@10.29.3/dist/preact.umd.js
// @require      https://cdn.jsdelivr.net/npm/preact@10.29.3/hooks/dist/hooks.umd.js
// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
// @connect      *
// @noframes
// ==/UserScript==

import { startDashboard } from './app'
import { createBrowserRuntime } from '../runtime'

void startDashboard(createBrowserRuntime())
