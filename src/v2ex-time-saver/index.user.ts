// ==UserScript==
// @name         v2ex time saver
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Save my time when browsing v2ex.com!
// @author       ustc.hj@gmail.com
// @match        *.v2ex.com/*
// @icon         https://www.v2ex.com/static/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==
// ==build.meta==
// css: src/v2ex-time-saver/v2ex-time-saver.css
// placeholder: /*{{V2EX_TIME_SAVER_CSS}}*/
// ==/build.meta==

import { startV2exTimeSaver } from "./app";
import { createBrowserRuntime } from "./runtime";

void startV2exTimeSaver(createBrowserRuntime());
