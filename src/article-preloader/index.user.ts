// ==UserScript==
// @name         article preloader
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.2
// @description  Preload the next page of the articles!
// @author       ustc.hj@gmail.com
// @match        https://www.xbiquge.so/book/*
// @match        https://www.biduoxs.com/biquge/*
// @match        https://www.sudugu.org/*
// @match        https://www.tongrenxsw.com/book/*
// @grant        GM_xmlhttpRequest
// @noframes
// ==/UserScript==

import { startArticlePreloader } from './app'
import { createBrowserRuntime } from '../runtime'

void startArticlePreloader(createBrowserRuntime())
