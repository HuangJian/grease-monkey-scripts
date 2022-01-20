// ==UserScript==
// @name         GeekPark better UI
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      0.1
// @description  Better UI for http://www.geekpark.net/news/*.
// @author       ustc.hj@gmail.com
// @match        http://www.geekpark.net/news/*
// @grant        GM_addStyle
// ==/UserScript==

(async function() {
    'use strict';

    GM_addStyle ( `
        #post .main-wrap {
            max-width: 1080px;
        }
        #post .article-content {
            font-size: 20px;
            line-height: 1.8;
        }
        #post .article-sidebar {
            display: none;
        }
    `)
})();