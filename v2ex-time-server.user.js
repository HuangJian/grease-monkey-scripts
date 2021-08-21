// ==UserScript==
// @name         v2ex time saver
// @namespace    https://github.com/HuangJian/v2ex-time-saver
// @version      0.1
// @description  Save my time when browsing v2ex.com!
// @author       ustc.hj@gmail.com
// @match        https://www.v2ex.com/t/*
// @icon         https://www.v2ex.com/static/favicon.ico
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 高亮排序：根据「感谢数」倒序重排评论区。
     */
     function reorderCommentsByHearts() {
        const heartedCells = Array.from(document.querySelectorAll('[alt="❤️"]'))
            .sort((a, b) => parseInt(a.nextSibling.textContent) - parseInt(b.nextSibling.textContent))
            .map(it => it.closest('.cell'));
        if (heartedCells.length) {
            const countsElement = document.querySelector('#Main > .box:nth-child(n+3) > .cell');
            heartedCells.forEach(it => countsElement.insertAdjacentElement('afterend', it));
        }
    }

    /**
     * 高亮显示楼主。
     * 借鉴自 https://greasyfork.org/zh-CN/scripts/397787-v2ex-pro/code
     */
    function highlightAuthor() {
        const authorName = document.querySelector('.header .avatar').getAttribute('alt');
        document.querySelectorAll(`a[href="/member/${authorName}"].dark`).forEach(el => {
            el.innerHTML += " <font color=green>[楼主]</font>";
        });
    }

    /**
     * 优化讨论帖页面的布局和交互。
     */
    function enhanceThreadPage() {
        reorderCommentsByHearts();
        highlightAuthor();
    }

    let domParser;
    let comments;

    /**
     * 从 HTML 页面源代码中获取所有评论的 DOM 节点。
     * @param {string} htmlString HTML页码源代码
     * @returns 该页所有评论的 DOM 节点
     */
    function getCommentElementsFromHtmlString(htmlString) {
        if (!domParser) {
            domParser = new DOMParser();
        }
        const dom = domParser.parseFromString(htmlString, 'text/html');
        const commentsOfThisPage = dom.querySelectorAll('#Main > .box > .cell[id]');
        return commentsOfThisPage;
    }

    /**
     * 当所有评论页面下载完成后，在当前页显示所有评论。
     */
    function tryDisplayAllComments() {
        const isAllPagesLoaded = comments.reduce((prev, curr) => prev && curr.length > 0, true);
        if (!isAllPagesLoaded) {
            return;
        }

        const fragment = document.createDocumentFragment();
        comments.forEach(pageComments => {
            pageComments.forEach(it => fragment.appendChild(it));
        });

        const commentBox = document.querySelector('#Main > .box:nth-child(n+3)');
        const countsElement = commentBox.querySelector('.cell');
        commentBox.prepend(fragment);
        commentBox.prepend(countsElement);

        reorderCommentsByHearts();
    }

    /**
     * 加载分页评论。
     * @param {int} page 页码，从 1 开始
     */
    function loadCommentsByPage(page) {
        const url = document.URL + '?p=' + page;
        GM_xmlhttpRequest({
            url: url,
            method: "GET",
            timeout: 30000,
            onload: function (response) {
                comments[page - 1] = getCommentElementsFromHtmlString(response.responseText);
                tryDisplayAllComments();
            }
        });
    }

    // 多页自动加载：如果评论超过一页，则自动下载其它页的内容，并在当前页显示
    const pages = Array.from(document.querySelectorAll('.page_normal'))
        .map(it => parseInt(it.innerText))
        .filter(it => it <= 10) // 最多加载前十页，避免产生性能问题
        .filter((x, i, a) => a.indexOf(x) == i); // unique
    comments = pages.map(it => []);
    pages.forEach(it => loadCommentsByPage(it));

    // 如果评论不超过一页，直接调整本页布局交互
    if (!pages.length) {
        enhanceThreadPage();
    }
})();