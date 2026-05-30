// ==UserScript==
// @name         article preloader
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.1
// @description  Preload the next page of the articles!
// @author       ustc.hj@gmail.com
// @match        https://www.xbiquge.so/book/*
// @match        https://www.biduoxs.com/biquge/*
// @match        https://www.sudugu.org/*
// @match        https://www.tongrenxsw.com/book/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    function htmlToElement(html) {
        var template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    }

    function htmlToDocument(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function getLinkText(link) {
        return (link?.textContent || '').replace(/\s+/g, '');
    }

    function isAbsoluteUrl(url) {
        return /^https?:\/\//i.test(url);
    }

    function toAbsoluteUrl(url) {
        if (!url) return '';
        return isAbsoluteUrl(url) ? url : new URL(url, document.location.href).href;
    }

    let retry = 0;
    let nextChapterContent = '';
    let nextChapterUrl = '';

    const SITE_CONFIGS = [
        {
            host: 'biduoxs.com',
            previousChapterLinkSelector: '.bottem2 a:nth-child(1)',
            indexLinkSelector: '.bottem2 a:nth-child(2)',
            nextChapterLinkSelector: '.bottem2 a:nth-child(3)',
        },
        {
            host: 'xbiquge.so',
            previousChapterLinkSelector: '#link-preview',
            indexLinkSelector: '#link-index',
            nextChapterLinkSelector: '#link-next',
            contentSelector: '#content',
        },
        {
            host: 'sudugu.org',
            chapterLinkSelector: '.prenext a',
            contentSelector: '.con',
            previousChapterTextPattern: /上一章|上一页/,
            nextChapterTextPattern: /下一章/,
            continuationPageTextPattern: /下一页|下页|下一页继续阅读/,
            indexPageTextPattern: /目录|书页|章节目录/,
        },
        {
            host: 'tongrenxsw.com',
            chapterLinkSelector: '.btnW a',
            contentSelector: '.content',
            previousChapterTextPattern: /上一章|上一页/,
            nextChapterTextPattern: /下一章/,
            continuationPageTextPattern: /下一页|下页/,
            indexPageTextPattern: /目录|章节目录/,
        },
    ];

    function matchesText(matcher, text) {
        return matcher instanceof RegExp ? matcher.test(text) : matcher(text);
    }

    function findChapterLink(linkSelector, matchers, doc = document) {
        const links = Array.from(doc.querySelectorAll(linkSelector));
        for (const matcher of matchers) {
            const link = links.find((item) => matchesText(matcher, getLinkText(item)));
            if (link) return link;
        }
        return null;
    }

    function selectorsFactory() {
        const siteConfig = SITE_CONFIGS.find((config) => document.location.host.includes(config.host));

        if (!siteConfig) {
            throw `Unsupported website: ${document.location.href}`;
        }

        if (siteConfig.chapterLinkSelector) {
            return {
                previousChapterLinkSelector: () => findChapterLink(siteConfig.chapterLinkSelector, [siteConfig.previousChapterTextPattern]),
                indexLinkSelector: () => findChapterLink(siteConfig.chapterLinkSelector, [siteConfig.indexPageTextPattern]),
                nextChapterLinkSelector: () => findChapterLink(siteConfig.chapterLinkSelector, [siteConfig.nextChapterTextPattern, siteConfig.continuationPageTextPattern]),
                contentSelector: siteConfig.contentSelector,
                paginationLinkSelector: siteConfig.chapterLinkSelector,
                isContinuationPageLinkText: (text) => siteConfig.continuationPageTextPattern.test(text),
                isNextChapterLinkText: (text) => siteConfig.nextChapterTextPattern.test(text),
                isIndexPageLinkText: (text) => siteConfig.indexPageTextPattern.test(text),
            };
        }

        return {
            previousChapterLinkSelector: () => document.querySelector(siteConfig.previousChapterLinkSelector),
            indexLinkSelector: () => document.querySelector(siteConfig.indexLinkSelector),
            nextChapterLinkSelector: () => document.querySelector(siteConfig.nextChapterLinkSelector),
            contentSelector: siteConfig.contentSelector,
        };
    }

    const factory = selectorsFactory();

    function fetchPage(url, onSuccess, onFailure) {
        GM_xmlhttpRequest({
            url: toAbsoluteUrl(url),
            method: "GET",
            timeout: 120000,
            onload: (response) => onSuccess(response.responseText),
            onerror: onFailure,
            ontimeout: onFailure,
        });
    }

    function getContentElement(doc) {
        return doc.querySelector(factory.contentSelector);
    }

    function getContinuationPageLink(doc) {
        const links = Array.from(doc.querySelectorAll(factory.paginationLinkSelector || 'a'));
        return links.find((link) => {
            const text = getLinkText(link);
            return factory.isContinuationPageLinkText?.(text);
        }) || null;
    }

    function loadChapter(url, onSuccess, onFailure) {
        fetchPage(url, (html) => {
            const chapterUrl = toAbsoluteUrl(url);
            const chapterDoc = htmlToDocument(html);
            const chapterContent = getContentElement(chapterDoc);
            const visited = new Set([chapterUrl]);

            if (!chapterContent) {
                throw new Error('未找到正文容器，无法拼接分页内容。');
            }

            const appendNextPage = (currentDoc) => {
                const nextPageLink = findChapterLink(factory.paginationLinkSelector || 'a', [factory.isContinuationPageLinkText], currentDoc);
                const nextChapterLink = findChapterLink(factory.paginationLinkSelector || 'a', [factory.isNextChapterLinkText], currentDoc);

                if (!nextPageLink) {
                    onSuccess({
                        html: '<!DOCTYPE html>\n' + chapterDoc.documentElement.outerHTML,
                        url: chapterUrl,
                        nextChapterUrl: toAbsoluteUrl(nextChapterLink?.getAttribute('href')),
                    });
                    return;
                }

                const nextPageUrl = toAbsoluteUrl(nextPageLink.getAttribute('href'));
                if (!nextPageUrl || visited.has(nextPageUrl)) {
                    onSuccess({
                        html: '<!DOCTYPE html>\n' + chapterDoc.documentElement.outerHTML,
                        url: chapterUrl,
                        nextChapterUrl: toAbsoluteUrl(nextChapterLink?.getAttribute('href')),
                    });
                    return;
                }

                visited.add(nextPageUrl);
                fetchPage(nextPageUrl, (nextHtml) => {
                    const nextDoc = htmlToDocument(nextHtml);
                    const nextContent = getContentElement(nextDoc);

                    if (!nextContent) {
                        throw new Error('未找到正文容器，无法拼接分页内容。');
                    }

                    chapterContent.append(...Array.from(nextContent.childNodes).map((node) => chapterDoc.importNode(node, true)));
                    appendNextPage(nextDoc);
                }, onFailure);
            };

            appendNextPage(chapterDoc);
        }, onFailure);
    }

    function mergeCurrentChapterIfNeeded(done) {
        if (!factory.isContinuationPageLinkText || !factory.paginationLinkSelector) {
            done();
            return;
        }

        const continuationLink = getContinuationPageLink(document);
        if (!continuationLink) {
            done();
            return;
        }

        const currentUrl = document.location.href;
        loadChapter(currentUrl, ({ html, nextChapterUrl }) => {
            document.documentElement.innerHTML = htmlToDocument(html).documentElement.innerHTML;
            if (nextChapterUrl) {
                const nextLink = factory.nextChapterLinkSelector();
                if (nextLink) {
                    nextLink.setAttribute('href', nextChapterUrl);
                    nextLink.textContent = '下一章';
                }
            }
            history.replaceState(null, '', currentUrl);
            window.scrollTo(0, 0);
            done();
        }, () => done());
    }

    /**
     * 预加载下一页的内容，防止网络抖动影响阅读体验。
     */
    function preloadNextChapter() {
        ++ retry;
        if (retry > 10) {
            console.error('预加载下一章内容失败：重试 10 次仍未成功，结束重试！');
        }

        const nextChapterLink = factory.nextChapterLinkSelector();

        // 可能是目录页
        if (!nextChapterLink) return;

        nextChapterUrl = nextChapterLink.getAttribute('href');
        nextChapterContent = '';
        loadChapter(nextChapterUrl, ({ html, url }) => {
                nextChapterContent = html;
                nextChapterUrl = url;
                const newLink = htmlToElement('<a style="cursor: pointer">下一章</a>');
                newLink.onclick = () => displayNextChapter();
                nextChapterLink.replaceWith(newLink);
                replaceNextChapterButtonEvent();
            }, () => preloadNextChapter());
    }

    function replaceNextChapterButtonEvent() {
        document.onkeydown = (evt) => {
            if (evt.key === 'ArrowLeft') {
                document.location = factory.previousChapterLinkSelector().getAttribute('href');
            }
            if (evt.key === 'Enter') {
                document.location = factory.indexLinkSelector().getAttribute('href');
            }
            if (evt.key === 'ArrowRight') {
                displayNextChapter();
            }
            evt.stopPropagation();
        }
    }

    function displayNextChapter() {
        retry = 0;
        document.documentElement.innerHTML = nextChapterContent;
        history.pushState(null, '', nextChapterUrl);
        window.scrollTo(0, 0);

        preloadNextChapter();
    }

    mergeCurrentChapterIfNeeded(() => preloadNextChapter());
})();
