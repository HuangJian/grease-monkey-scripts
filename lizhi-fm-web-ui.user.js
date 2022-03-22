// ==UserScript==
// @name         lizhi-fm-web-ui
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      0.01
// @description  Nice lizhi.fm web ui, with player, indexing and searching.
// @author       ustc.hj@gmail.com
// @match        https://www.v2ex.com/*
// @icon         https://www.v2ex.com/static/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(async function() {
    'use strict';

    function $(selector) {
        return document.querySelector(selector)
    }

    function $$(selector) {
        return Array.from(document.querySelectorAll(selector))
    }

    /** 
     * 将 html 字符串转为 DOM 节点：https://stackoverflow.com/a/35385518/474231 。
     * @param {String} HTML representing a single element
     * @return {Element}
     */
    function htmlToElement(html) {
        var template = document.createElement('template');
        template.innerHTML =  html.trim(); // Never return a text node of whitespace as the result
        return template.content.firstChild;
    }

    // TODO:
    // 1. embed the player into the resource page
    // 2. scrap the resource of an author to a local database (indexdb?)
    // 3. add a ui to search audios from the local database
    // 4. select audios from the search results and add them to the playlist.

})();