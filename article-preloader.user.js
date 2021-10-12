// ==UserScript==
// @name         article preloader
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Preload the next page of the articles!
// @author       ustc.hj@gmail.com
// @match        https://www.xbiquge.so/book/*
// @match        https://www.biduoxs.com/biquge/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    /** 
     * 将 html 字符串转为 DOM 节点：https://stackoverflow.com/a/35385518/474231 。
     * @param {String} HTML representing a single element
     * @return {Element}
     */
     function htmlToElement(html) {
        var template = document.createElement('template');
        template.innerHTML = html.trim(); // Never return a text node of whitespace as the result
        return template.content.firstChild;
    }

    let retry = 0;
    let nextPageContent = '';
    let nextPageUrl = '';

    function selectorsFactory() {
        if (document.location.host.includes('biduoxs.com')) {
            return {
                prevPageLinkSelector: () => document.querySelectorAll('.bottem2 a')[0],
                indexLinkSelector: () => document.querySelectorAll('.bottem2 a')[1],
                nextPageLinkSelector: () => document.querySelectorAll('.bottem2 a')[2],
            }
        } else if (document.location.host.includes('xbiquge.so')) {
            return {
                prevPageLinkSelector: () => document.querySelector('#link-preview'),
                indexLinkSelector: () => document.querySelectorAll('#link-index'),
                nextPageLinkSelector: () => document.querySelector('#link-next'),
            }
        }
        throw `Unsupported website: ${document.location.href}`;
    }

    const factory = selectorsFactory();

    /**
     * 预加载下一页的内容，防止网络抖动影响阅读体验。
     */
    function preload() {
        ++ retry;
        if (retry > 10) {
            console.error('预加载下一章内容失败：重试 10 次仍未成功，结束重试！');
        }

        const nextPageLink = factory.nextPageLinkSelector();

        // 可能是目录页
        if (!nextPageLink) return;

        nextPageUrl = nextPageLink.getAttribute('href');
        nextPageContent = '';
        GM_xmlhttpRequest({
            url: nextPageUrl,
            method: "GET",
            timeout: 120000,
            onload: function (response) {
                nextPageContent = response.responseText;
                const newLink = htmlToElement('<a style="cursor: pointer">下一章</a>');
                newLink.onclick = () => displayNextPage();
                nextPageLink.replaceWith(newLink);
                replaceNextPageButtonEvent();
            },
            onerror: () => preload(),
            ontimeout: () => preload()
        });
    }

    function replaceNextPageButtonEvent() {
        document.onkeydown = (evt) => {
            if (evt.key === 'ArrowLeft') {
                document.location = factory.prevPageLinkSelector().getAttribute('href');
            }
            if (evt.key === 'Enter') {
                document.location = factory.indexLinkSelector().getAttribute('href');
            }
            if (evt.key === 'ArrowRight') {
                displayNextPage();
            }
            evt.stopPropagation();
        }
    }

    function displayNextPage() {
        retry = 0;
        document.documentElement.innerHTML = nextPageContent;
        history.pushState(null, '', nextPageUrl);  
        window.scrollTo(0, 0);

        preload();
    }

    preload();
})();