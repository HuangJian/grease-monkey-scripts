// ==UserScript==
// @name         article preloader
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.2
// @description  Preload the next page of the articles!
// @author       ustc.hj@gmail.com
// @match        https://www.xbiquge.so/book/*
// @match        https://www.biduoxs.com/biquge/*
// @match        https://www.sudugu.org/*
// @match        https://www.tongrenxsw.com/book/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(() => {
  // src/utils.ts
  function htmlToElement(document2, html) {
    const template = document2.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }
  function htmlToDocument(html, domParser) {
    return domParser.parseFromString(html, "text/html");
  }
  function getLinkText(link) {
    return (link?.textContent || "").replace(/\s+/g, "");
  }
  function isAbsoluteUrl(url) {
    return /^https?:\/\//i.test(url);
  }
  function toAbsoluteUrl(url, base) {
    if (!url)
      return "";
    return isAbsoluteUrl(url) ? url : new URL(url, base).href;
  }
  function matchesText(matcher, text) {
    return matcher instanceof RegExp ? matcher.test(text) : matcher(text);
  }

  // src/article-preloader/config.ts
  var SITE_CONFIGS = [
    {
      kind: "direct",
      host: "biduoxs.com",
      previousChapterLinkSelector: ".bottem2 a:nth-child(1)",
      indexLinkSelector: ".bottem2 a:nth-child(2)",
      nextChapterLinkSelector: ".bottem2 a:nth-child(3)"
    },
    {
      kind: "direct",
      host: "xbiquge.so",
      previousChapterLinkSelector: "#link-preview",
      indexLinkSelector: "#link-index",
      nextChapterLinkSelector: "#link-next",
      contentSelector: "#content"
    },
    {
      kind: "text",
      host: "sudugu.org",
      chapterLinkSelector: ".prenext a",
      contentSelector: ".con",
      previousChapterTextPattern: /上一章|上一页/,
      nextChapterTextPattern: /下一章/,
      continuationPageTextPattern: /下一页|下页|下一页继续阅读/,
      indexPageTextPattern: /目录|书页|章节目录/
    },
    {
      kind: "text",
      host: "tongrenxsw.com",
      chapterLinkSelector: ".btnW a",
      contentSelector: ".content",
      previousChapterTextPattern: /上一章|上一页/,
      nextChapterTextPattern: /下一章/,
      continuationPageTextPattern: /下一页|下页/,
      indexPageTextPattern: /目录|章节目录/
    }
  ];

  // src/article-preloader/selectors.ts
  function findChapterLink(linkSelector, matchers, doc) {
    const links = Array.from(doc.querySelectorAll(linkSelector));
    for (const matcher of matchers) {
      const link = links.find((item) => matchesText(matcher, getLinkText(item)));
      if (link)
        return link;
    }
    return null;
  }
  function selectorsFactory(host, doc) {
    const config = SITE_CONFIGS.find((c) => host.includes(c.host));
    if (!config)
      throw new Error(`Unsupported website: ${host}`);
    if (config.kind === "text") {
      return {
        previousChapterLinkSelector: () => findChapterLink(config.chapterLinkSelector, [config.previousChapterTextPattern], doc),
        indexLinkSelector: () => findChapterLink(config.chapterLinkSelector, [config.indexPageTextPattern], doc),
        nextChapterLinkSelector: () => findChapterLink(config.chapterLinkSelector, [config.nextChapterTextPattern, config.continuationPageTextPattern], doc),
        contentSelector: config.contentSelector,
        paginationSelector: config.chapterLinkSelector,
        matchContinuationText: (text) => config.continuationPageTextPattern.test(text),
        matchNextChapterText: (text) => config.nextChapterTextPattern.test(text)
      };
    }
    return {
      previousChapterLinkSelector: () => doc.querySelector(config.previousChapterLinkSelector),
      indexLinkSelector: () => doc.querySelector(config.indexLinkSelector),
      nextChapterLinkSelector: () => doc.querySelector(config.nextChapterLinkSelector),
      contentSelector: config.contentSelector,
      paginationSelector: "a",
      matchContinuationText: () => false,
      matchNextChapterText: () => false
    };
  }

  // src/article-preloader/app.ts
  function fetchPage(runtime, url, onSuccess, onFailure) {
    runtime.request({
      url: toAbsoluteUrl(url, runtime.location.href),
      method: "GET",
      timeout: 120000,
      onload: (response) => onSuccess({ html: response.responseText, status: response.status ?? 200 }),
      onerror: onFailure,
      ontimeout: onFailure
    });
  }
  function buildResult(chapterDoc, chapterUrl, currentDoc, selectors) {
    const nextChapterLink = findChapterLink(selectors.paginationSelector, [selectors.matchNextChapterText], currentDoc);
    const nextChapterUrl = toAbsoluteUrl(nextChapterLink?.getAttribute("href") ?? null, chapterUrl);
    if (nextChapterUrl) {
      const firstPageNextLink = findChapterLink(selectors.paginationSelector, [selectors.matchNextChapterText], chapterDoc);
      if (!firstPageNextLink) {
        const continuationLink = findChapterLink(selectors.paginationSelector, [selectors.matchContinuationText], chapterDoc);
        if (continuationLink) {
          continuationLink.textContent = "下一章";
          continuationLink.setAttribute("href", nextChapterUrl);
        }
      }
    }
    return {
      html: `<!DOCTYPE html>
` + chapterDoc.documentElement.outerHTML,
      url: chapterUrl,
      nextChapterUrl
    };
  }
  function appendNextPage(runtime, selectors, chapterDoc, chapterUrl, chapterContent, visited, currentDoc, onSuccess, onFailure) {
    const nextPageLink = findChapterLink(selectors.paginationSelector, [selectors.matchContinuationText], currentDoc);
    if (!nextPageLink || visited.has(toAbsoluteUrl(nextPageLink.getAttribute("href"), chapterUrl))) {
      onSuccess(buildResult(chapterDoc, chapterUrl, currentDoc, selectors));
      return;
    }
    const nextPageUrl = toAbsoluteUrl(nextPageLink.getAttribute("href"), chapterUrl);
    visited.add(nextPageUrl);
    fetchPage(runtime, nextPageUrl, ({ html, status }) => {
      const nextDoc = htmlToDocument(html, new runtime.DOMParser);
      const nextContent = nextDoc.querySelector(selectors.contentSelector || "");
      if (!nextContent) {
        if (status === 200) {
          onSuccess(buildResult(chapterDoc, chapterUrl, currentDoc, selectors));
          return;
        }
        onFailure();
        return;
      }
      chapterContent.append(...Array.from(nextContent.childNodes).map((node) => chapterDoc.importNode(node, true)));
      appendNextPage(runtime, selectors, chapterDoc, chapterUrl, chapterContent, visited, nextDoc, onSuccess, onFailure);
    }, onFailure);
  }
  function startArticlePreloader(runtime) {
    let retry = 0;
    let nextChapterContent = "";
    let nextChapterUrl = "";
    const selectors = selectorsFactory(runtime.location.host, runtime.document);
    function loadChapter(url, onSuccess, onFailure) {
      fetchPage(runtime, url, ({ html, status }) => {
        const chapterUrl = toAbsoluteUrl(url, runtime.location.href);
        const chapterDoc = htmlToDocument(html, new runtime.DOMParser);
        const chapterContent = chapterDoc.querySelector(selectors.contentSelector || "");
        if (!chapterContent) {
          if (status === 200)
            return;
          onFailure();
          return;
        }
        const visited = new Set([chapterUrl]);
        appendNextPage(runtime, selectors, chapterDoc, chapterUrl, chapterContent, visited, chapterDoc, onSuccess, onFailure);
      }, onFailure);
    }
    function mergeCurrentChapterIfNeeded(done) {
      const links = Array.from(runtime.document.querySelectorAll(selectors.paginationSelector));
      const continuationLink = links.find((link) => selectors.matchContinuationText(getLinkText(link))) || null;
      if (!continuationLink) {
        done();
        return;
      }
      const currentUrl = runtime.location.href;
      const contentSelector = selectors.contentSelector || "";
      const currentContent = runtime.document.querySelector(contentSelector);
      if (!currentContent) {
        done();
        return;
      }
      const visited = new Set([currentUrl]);
      function fetchNextPages(doc) {
        const nextLink = findChapterLink(selectors.paginationSelector, [selectors.matchContinuationText], doc);
        if (!nextLink || visited.has(toAbsoluteUrl(nextLink.getAttribute("href"), currentUrl))) {
          const nextChapterLink = findChapterLink(selectors.paginationSelector, [selectors.matchNextChapterText], doc);
          const nextUrl = nextChapterLink ? toAbsoluteUrl(nextChapterLink.getAttribute("href"), currentUrl) : "";
          if (nextUrl) {
            const link = selectors.nextChapterLinkSelector();
            if (link) {
              link.setAttribute("href", nextUrl);
              link.textContent = "下一章";
            }
          }
          runtime.document.defaultView?.history.replaceState(null, "", currentUrl);
          done();
          return;
        }
        const nextPageUrl = toAbsoluteUrl(nextLink.getAttribute("href"), currentUrl);
        visited.add(nextPageUrl);
        fetchPage(runtime, nextPageUrl, ({ html }) => {
          const nextDoc = htmlToDocument(html, new runtime.DOMParser);
          const nextContent = nextDoc.querySelector(contentSelector);
          if (!nextContent) {
            done();
            return;
          }
          currentContent.append(...Array.from(nextContent.childNodes).map((node) => runtime.document.importNode(node, true)));
          fetchNextPages(nextDoc);
        }, () => done());
      }
      fetchNextPages(runtime.document);
    }
    function displayNextChapter() {
      retry = 0;
      runtime.document.documentElement.innerHTML = nextChapterContent;
      runtime.document.defaultView?.history.pushState(null, "", nextChapterUrl);
      runtime.document.defaultView?.scrollTo(0, 0);
      preloadNextChapter();
    }
    function preloadNextChapter() {
      ++retry;
      if (retry > 10) {
        console.error("预加载下一章内容失败：重试 10 次仍未成功，结束重试！");
        return;
      }
      const nextChapterLink = selectors.nextChapterLinkSelector();
      if (!nextChapterLink)
        return;
      nextChapterUrl = nextChapterLink.getAttribute("href") || "";
      nextChapterContent = "";
      loadChapter(nextChapterUrl, ({ html, url }) => {
        nextChapterContent = html;
        nextChapterUrl = url;
        const newLink = htmlToElement(runtime.document, '<a style="cursor: pointer">下一章</a>');
        if (newLink) {
          newLink.addEventListener("click", () => displayNextChapter());
          nextChapterLink.replaceWith(newLink);
        }
        runtime.document.onkeydown = (evt) => {
          if (evt.key === "ArrowLeft") {
            const prev = selectors.previousChapterLinkSelector();
            if (prev)
              runtime.document.location.href = prev.getAttribute("href") || "";
          }
          if (evt.key === "Enter") {
            const index = selectors.indexLinkSelector();
            if (index)
              runtime.document.location.href = index.getAttribute("href") || "";
          }
          if (evt.key === "ArrowRight")
            displayNextChapter();
          evt.stopPropagation();
        };
      }, () => preloadNextChapter());
    }
    mergeCurrentChapterIfNeeded(() => preloadNextChapter());
    return {
      loadChapter,
      mergeCurrentChapterIfNeeded,
      get selectors() {
        return selectors;
      }
    };
  }

  // src/runtime.ts
  function createBrowserRuntime() {
    return {
      document,
      location,
      DOMParser,
      MutationObserver,
      prompt: window.prompt.bind(window),
      getValue: (key, defaultValue) => GM.getValue(key, defaultValue),
      setValue: (key, value) => GM.setValue(key, value),
      request: (details) => GM_xmlhttpRequest(details),
      addStyle: (css) => GM_addStyle(css)
    };
  }

  // src/article-preloader/.index.user.ts
  startArticlePreloader(createBrowserRuntime());
})();
