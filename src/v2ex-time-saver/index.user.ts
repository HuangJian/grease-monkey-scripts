// ==UserScript==
// @name         v2ex time saver
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Save my time when browsing v2ex.com!
// @author       ustc.hj@gmail.com
// @match        *.v2ex.com/*
// @match        v2ex.com/*
// @icon         https://www.v2ex.com/static/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==
import { startV2exTimeSaver } from './app'
import { createBrowserRuntime } from '../runtime'

void startV2exTimeSaver(createBrowserRuntime())
