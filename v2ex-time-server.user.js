// ==UserScript==
// @name         v2ex time saver
// @namespace    https://github.com/HuangJian/v2ex-time-saver
// @version      0.1
// @description  Save my time when browsing v2ex.com!
// @author       ustc.hj@gmail.com
// @match        https://www.v2ex.com/t/*
// @icon         https://www.v2ex.com/static/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 高亮置顶：根据「感谢数」倒序重排评论区
    const heartedCells = Array.from(document.querySelectorAll('[alt="❤️"]'))
        .sort((a, b) => parseInt(a.nextSibling.textContent) - parseInt(b.nextSibling.textContent))
        .map(it => it.closest('.cell'));
    if (heartedCells.length) {
        const countCell = heartedCells[0].parentElement.firstElementChild;
        heartedCells.forEach(it => countCell.insertAdjacentElement('afterend', it));
    }

})();