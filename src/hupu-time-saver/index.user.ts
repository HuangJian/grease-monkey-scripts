// ==UserScript==
// @name         hupu time saver
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Hupu BBS companion: tag users, highlight comments
// @author       ustc.hj@gmail.com
// @match        *.hupu.com/*
// @icon         https://w1.hoopchina.com.cn/images/pc/old/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==
import { createHupuApp } from './app'
import { createBrowserRuntime } from '../runtime'

void createHupuApp(createBrowserRuntime()).then((app) => app.start())
