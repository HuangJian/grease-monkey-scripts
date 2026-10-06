// ==UserScript==
// @name         article preloader
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.4
// @description  Preload the next page of the articles!
// @author       ustc.hj@gmail.com
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @noframes
// ==/UserScript==

import { startArticlePreloader } from './app'
import { createBrowserRuntime } from '../runtime'

void startArticlePreloader(createBrowserRuntime())
