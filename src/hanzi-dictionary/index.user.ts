// ==UserScript==
// @name         汉语字典查询
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @author       ustc.hj@gmail.com
// @description  选中汉字后点击浮动按钮查询汉典释义
// @match        *://*/*
// @connect       www.zdic.net
// @connect       zdic.net
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @noframes
// ==/UserScript==
import { startHanziDictionary } from './app'
import { createBrowserRuntime } from '../runtime'

startHanziDictionary(createBrowserRuntime())
