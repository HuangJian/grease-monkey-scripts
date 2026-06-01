// ==UserScript==
// @name         reddit time saver
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Reddit companion: tag users, highlight comments, save time!
// @author       ustc.hj@gmail.com
// @match        *.reddit.com/*
// @icon         https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==
// ==build.meta==
// css: src/reddit-time-saver/reddit-time-saver.css
// placeholder: /*{{REDDIT_TIME_SAVER_CSS}}*/
// ==/build.meta==

import { startRedditTimeSaver } from './app'
import { createBrowserRuntime } from '../runtime'

void startRedditTimeSaver(createBrowserRuntime())
