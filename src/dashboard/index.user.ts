// ==UserScript==
// @name         dashboard
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Personal info dashboard overlay (double-tap Shift) on host sites
// @author       ustc.hj@gmail.com
// @match        https://mail.google.com/*
// @match        https://*.v2ex.com/*
// @match        https://github.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.open-meteo.com
// @connect      www.v2ex.com
// ==/UserScript==
// ==build.meta==
// css: src/dashboard/overlay/overlay.css
// placeholder: /*{{DASHBOARD_CSS}}*/
// ==/build.meta==

import { startDashboard } from './dashboard'
import { createBrowserRuntime } from '../runtime'

void startDashboard(createBrowserRuntime())
