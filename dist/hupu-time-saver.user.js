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

(() => {
  // src/shared/author-labels.ts
  function getTotalScore(tags) {
    if (!tags)
      return 0;
    return Object.values(tags).reduce((sum, t) => sum + (t.score || 0), 0);
  }
  function addTag(map, id, tag, url, score) {
    const trimmed = tag.trim();
    if (!trimmed)
      return;
    if (!map[id])
      map[id] = {};
    map[id][trimmed] = { url, score };
  }
  function removeTag(map, id, tag) {
    if (!map[id])
      return;
    delete map[id][tag];
    if (Object.keys(map[id]).length === 0) {
      delete map[id];
    }
  }
  function incrementTagScore(map, id, tag, url, delta) {
    if (!map[id])
      map[id] = {};
    const existing = map[id][tag];
    if (existing) {
      existing.score += delta;
    } else {
      map[id][tag] = { url, score: delta };
    }
  }
  function isValidTagRecord(v) {
    return v != null && typeof v === "object" && !Array.isArray(v) && typeof v.url === "string" && typeof v.score === "number";
  }
  function isValidAuthorTags(v) {
    if (v == null || typeof v !== "object" || Array.isArray(v))
      return false;
    return Object.values(v).every((tag) => isValidTagRecord(tag));
  }
  function tagColor(score) {
    if (score > 0)
      return "darkgreen";
    if (score < 0)
      return "red";
    return "gray";
  }
  function parseAuthorTagMap(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const result = {};
    for (const [id, tags] of Object.entries(value)) {
      if (typeof id === "string" && isValidAuthorTags(tags)) {
        result[id] = tags;
      }
    }
    return result;
  }

  // src/utils.ts
  function htmlToElement(document2, html) {
    const template = document2.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }
  function htmlToDocument(html, domParser) {
    return domParser.parseFromString(html, "text/html");
  }

  // src/shared/tag-panel.ts
  var tagPanelCss = `.gm-tag-btn {
  cursor: pointer;
  margin-left: 4px;
  font-size: 12px;
  text-decoration: none;
  user-select: none;
}
.gm-tag-btn:hover {
  text-decoration: none;
}
.gm-tag-panel {
  position: fixed;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 12px;
  min-width: 240px;
  max-width: 300px;
  font-size: 13px;
  line-height: 1.5;
  z-index: 9999;
}
.gm-tag-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: bold;
  font-size: 14px;
}
.gm-tag-panel-close {
  cursor: pointer;
  border: none;
  background: none;
  font-size: 16px;
  padding: 0 4px;
  color: #999;
}
.gm-tag-panel-close:hover {
  color: #333;
}
.gm-tag-list {
  margin-bottom: 4px;
}
.gm-tag-empty {
  color: #999;
  font-size: 12px;
  padding: 4px 0;
}
.gm-tag-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  border-bottom: 1px solid #f0f0f0;
}
.gm-tag-row:last-child {
  border-bottom: none;
}
.gm-tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.gm-tag-score {
  min-width: 24px;
  text-align: center;
  font-weight: bold;
  font-size: 12px;
}
.gm-tag-row button {
  cursor: pointer;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  background: #f8f8f8;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 1.4;
}
.gm-tag-row button:hover {
  background: #e8e8e8;
}
.gm-tag-del {
  color: #c00;
}
.gm-tag-add {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e0e0e0;
}
.gm-tag-input-name {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  font-size: 12px;
}
.gm-tag-input-score {
  width: 48px;
  padding: 3px 6px;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  font-size: 12px;
  text-align: center;
}
.gm-tag-add-btn {
  cursor: pointer;
  border: 1px solid #4a90d9;
  border-radius: 3px;
  background: #4a90d9;
  color: white;
  padding: 3px 10px;
  font-size: 12px;
  white-space: nowrap;
}
.gm-tag-add-btn:hover {
  background: #357abd;
}
.gm-tag-quick {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e0e0e0;
}
.gm-tag-quick button {
  cursor: pointer;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  padding: 3px 10px;
  font-size: 12px;
  background: #f8f8f8;
  flex: 1;
}
.gm-tag-quick button:hover {
  background: #e8e8e8;
}
.gm-tag-quick-shame {
  color: #c00;
}
.gm-tag-quick-thank {
  color: #080;
}`;
  var closePanelHandler = null;
  function closeTagPanel(runtime) {
    closePanelHandler?.();
    closePanelHandler = null;
    runtime.document.querySelector(".gm-tag-panel")?.remove();
  }
  function buildTagPanel(runtime, authorTagMap, authorId, commentNumber, triggerBtn, callbacks, quickLabels) {
    closeTagPanel(runtime);
    const btnClass = "gm-tag-btn";
    const panel = htmlToElement(runtime.document, `<div class="gm-tag-panel">
      <div class="gm-tag-panel-header">
        <span class="gm-tag-panel-title"></span>
        <button class="gm-tag-panel-close">✕</button>
      </div>
      <div class="gm-tag-list"></div>
      <div class="gm-tag-add">
        <input class="gm-tag-input-name" type="text" placeholder="标签名">
        <input class="gm-tag-input-score" type="number" value="0" step="1">
        <button class="gm-tag-add-btn">添加</button>
      </div>
      <div class="gm-tag-quick">
        <button class="gm-tag-quick-shame">${quickLabels.shame.display} (-1)</button>
        <button class="gm-tag-quick-thank">${quickLabels.thank.display} (+1)</button>
      </div>
    </div>`);
    panel.querySelector(".gm-tag-panel-title").textContent = authorId;
    const list = panel.querySelector(".gm-tag-list");
    function renderTags() {
      const currentTags = authorTagMap[authorId] || {};
      const entries = Object.entries(currentTags);
      list.innerHTML = "";
      if (entries.length === 0) {
        list.appendChild(htmlToElement(runtime.document, '<div class="gm-tag-empty">暂无标签</div>'));
        return;
      }
      for (const [tagName, record] of entries) {
        const scoreText = record.score > 0 ? `+${record.score}` : String(record.score);
        const row = htmlToElement(runtime.document, `<div class="gm-tag-row">
          <span class="gm-tag-name"></span>
          <span class="gm-tag-score">${scoreText}</span>
          <button class="gm-tag-inc">+1</button>
          <button class="gm-tag-dec">-1</button>
          <button class="gm-tag-del">删除</button>
        </div>`);
        row.querySelector(".gm-tag-name").textContent = tagName;
        const [incBtn, decBtn, delBtn] = row.querySelectorAll("button");
        incBtn.addEventListener("click", () => {
          callbacks.onTagAuthor(authorId, commentNumber, tagName, 1);
          renderTags();
        });
        decBtn.addEventListener("click", () => {
          callbacks.onTagAuthor(authorId, commentNumber, tagName, -1);
          renderTags();
        });
        delBtn.addEventListener("click", () => {
          callbacks.onUnsetTag(authorId, tagName);
          renderTags();
        });
        list.appendChild(row);
      }
    }
    const addNameInput = panel.querySelector(".gm-tag-input-name");
    const addScoreInput = panel.querySelector(".gm-tag-input-score");
    panel.querySelector(".gm-tag-add-btn").addEventListener("click", () => {
      const name = addNameInput.value.trim();
      if (!name)
        return;
      const score = parseInt(addScoreInput.value, 10);
      if (score === 0 || isNaN(score))
        return;
      callbacks.onSetTag(authorId, name, score, commentNumber);
      addNameInput.value = "";
      addScoreInput.value = "0";
      renderTags();
    });
    panel.querySelector(".gm-tag-quick-shame").addEventListener("click", () => {
      callbacks.onTagAuthor(authorId, commentNumber, quickLabels.shame.tag, -1);
      renderTags();
    });
    panel.querySelector(".gm-tag-quick-thank").addEventListener("click", () => {
      callbacks.onTagAuthor(authorId, commentNumber, quickLabels.thank.tag, 1);
      renderTags();
    });
    panel.querySelector(".gm-tag-panel-close").addEventListener("click", () => closeTagPanel(runtime));
    renderTags();
    const rect = triggerBtn.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${Math.min(rect.left, (runtime.document.defaultView?.innerWidth ?? 320) - 320)}px`;
    runtime.document.body.appendChild(panel);
    const handler = (e) => {
      if (e.target.closest(`.${btnClass}`))
        return;
      if (!panel.contains(e.target)) {
        closeTagPanel(runtime);
      }
    };
    closePanelHandler = () => {
      runtime.document.removeEventListener("mousedown", handler);
    };
    setTimeout(() => {
      if (!closePanelHandler)
        return;
      runtime.document.addEventListener("mousedown", handler);
    }, 0);
  }

  // src/hupu-time-saver/selectors.ts
  function extractNextData(doc) {
    const script = doc.getElementById("__NEXT_DATA__");
    if (!script)
      return null;
    try {
      return JSON.parse(script.textContent || "");
    } catch {
      return null;
    }
  }
  function parseNextData(rawJson) {
    if (rawJson == null || typeof rawJson !== "object")
      return null;
    const anyJson = rawJson;
    const props = anyJson.props;
    if (!props)
      return null;
    const pageProps = props.pageProps;
    if (!pageProps)
      return null;
    const detail = pageProps.detail;
    if (!detail)
      return null;
    const thread = detail.thread;
    if (!thread)
      return null;
    const tid = String(thread.tid ?? "");
    if (!tid)
      return null;
    const author = thread.author;
    if (!author)
      return null;
    const authorPuid = String(author.puid ?? "");
    if (!authorPuid)
      return null;
    const replies = detail.replies;
    if (!replies)
      return null;
    const pageCount = typeof replies.total === "number" ? replies.total : Number(replies.total ?? 1);
    const repliesPerPage = typeof replies.size === "number" ? replies.size : Number(replies.size ?? 20);
    const currentPage = typeof replies.current === "number" ? replies.current : Number(replies.current ?? 1);
    return {
      tid,
      authorPuid,
      authorPuname: String(author.puname ?? ""),
      authorEuid: String(author.euid ?? ""),
      authorUrl: String(author.url ?? ""),
      currentPage,
      pageCount,
      repliesPerPage
    };
  }
  function parseReplyList(rawJson) {
    if (rawJson == null || typeof rawJson !== "object")
      return [];
    const anyJson = rawJson;
    const props = anyJson.props;
    if (!props)
      return [];
    const pageProps = props.pageProps;
    if (!pageProps)
      return [];
    const detail = pageProps.detail;
    if (!detail)
      return [];
    const replies = detail.replies;
    if (!replies)
      return [];
    const list = replies.list;
    if (!Array.isArray(list))
      return [];
    const result = [];
    for (const item of list) {
      if (item == null || typeof item !== "object")
        continue;
      const reply = item;
      const author = reply.author;
      if (!author)
        continue;
      const puid = String(author.puid ?? "");
      const euid = String(author.euid ?? "");
      if (!puid || !euid)
        continue;
      result.push({
        pid: String(reply.pid ?? ""),
        authorPuid: puid,
        authorPuname: String(author.puname ?? ""),
        authorEuid: euid,
        authorUrl: String(author.url ?? "")
      });
    }
    return result;
  }
  function findAllAuthorLinks(root) {
    return root.querySelectorAll('a[href*="my.hupu.com"]');
  }
  function isAuthorNameLink(el) {
    return el.classList.contains("post-reply-list-user-info-top-name") || Array.from(el.classList).some((c) => c.startsWith("post-user_post-user-comp-info-top-name"));
  }
  function extractEuid(href) {
    const protoEnd = href.indexOf("://");
    const start = protoEnd >= 0 ? protoEnd + 3 : 0;
    const idx = href.lastIndexOf("/");
    if (idx < start)
      return "";
    return href.slice(idx + 1).split(/[?#]/)[0];
  }
  function buildPageUrl(tid, page) {
    return `https://bbs.hupu.com/${tid}-${page}.html`;
  }

  // src/hupu-time-saver/app.ts
  var STORAGE_KEY = "hupu_author_tags";
  var BTN_CLASS = "gm-tag-btn";
  var PROCESSED_CLASS = "gm-processed";
  var QUICK_LABELS = {
    shame: { tag: "串子", display: "串子" },
    thank: { tag: "家人", display: "家人" }
  };
  async function loadAuthorTagMap(runtime) {
    const value = await runtime.getValue(STORAGE_KEY, {});
    return parseAuthorTagMap(value);
  }
  async function createHupuApp(runtime) {
    const authorTagMap = await loadAuthorTagMap(runtime);
    const euidToPuidMap = new Map;
    function persist() {
      runtime.setValue(STORAGE_KEY, authorTagMap);
    }
    function tagAuthor(id, commentNumber, tag, delta) {
      const url = `https://my.hupu.com/${commentNumber}`;
      incrementTagScore(authorTagMap, id, tag, url, delta);
      persist();
      applyHighlights();
    }
    function setTag(id, tag, score, commentNumber) {
      const url = `https://my.hupu.com/${commentNumber}`;
      addTag(authorTagMap, id, tag, url, score);
      persist();
      applyHighlights();
    }
    function unsetTag(id, tag) {
      removeTag(authorTagMap, id, tag);
      persist();
      applyHighlights();
    }
    function clampScore(score) {
      return Math.max(-3, Math.min(3, score));
    }
    function clearHighlights() {
      runtime.document.querySelectorAll(".gm-author-tag").forEach((el) => el.remove());
      for (let i = -3;i <= 3; i++) {
        const cls = `gm-highlight-${i < 0 ? `n${-i}` : i}`;
        runtime.document.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
      }
    }
    function applyHighlights() {
      clearHighlights();
      for (const authorLink of findAllAuthorLinks(runtime.document.body)) {
        if (!isAuthorNameLink(authorLink))
          continue;
        const euid = extractEuid(authorLink.getAttribute("href") || "");
        if (!euid)
          continue;
        const puid = euidToPuidMap.get(euid) || euid;
        const tags = authorTagMap[puid];
        if (!tags)
          continue;
        const total = getTotalScore(tags);
        for (const [tagName, record] of Object.entries(tags)) {
          const tagEl = htmlToElement(runtime.document, `<a class="gm-author-tag" href="${new URL(record.url, runtime.location.origin).href}" target="_blank"></a>`);
          tagEl.textContent = tagName;
          tagEl.style.color = tagColor(record.score);
          authorLink.insertAdjacentElement("afterend", tagEl);
        }
        const replyContent = authorLink.closest(".post-reply-list-container")?.querySelector(".post-reply-list-content");
        if (replyContent) {
          const clamped = clampScore(total);
          if (clamped !== 0) {
            replyContent.classList.add(`gm-highlight-${clamped < 0 ? `n${-clamped}` : clamped}`);
          }
        }
      }
    }
    function attachTagButton(authorLink, authorPuid, euid) {
      authorLink.classList.add(PROCESSED_CLASS);
      const btn = htmlToElement(runtime.document, `<a class="${BTN_CLASS}" href="#;">\uD83C\uDFF7</a>`);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const callbacks = {
          onTagAuthor: (id, commentNum, tag, delta) => tagAuthor(id, commentNum, tag, delta),
          onSetTag: (id, tag, score, commentNum) => setTag(id, tag, score, commentNum),
          onUnsetTag: (id, tag) => unsetTag(id, tag)
        };
        buildTagPanel(runtime, authorTagMap, authorPuid, euid, btn, callbacks, QUICK_LABELS);
      });
      authorLink.insertAdjacentElement("afterend", btn);
    }
    function processElement(root) {
      for (const link of findAllAuthorLinks(root)) {
        if (link.classList.contains(PROCESSED_CLASS))
          continue;
        if (!isAuthorNameLink(link))
          continue;
        const euid = extractEuid(link.getAttribute("href") || "");
        if (!euid)
          continue;
        const puid = euidToPuidMap.get(euid) || euid;
        attachTagButton(link, puid, euid);
      }
    }
    function setupObserver() {
      let timer = null;
      const observer = new runtime.MutationObserver((mutations) => {
        let found = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element))
              continue;
            const links = findAllAuthorLinks(node);
            for (const link of links) {
              if (!isAuthorNameLink(link))
                continue;
              if (link.classList.contains(PROCESSED_CLASS))
                continue;
              const euid = extractEuid(link.getAttribute("href") || "");
              if (!euid)
                continue;
              const puid = euidToPuidMap.get(euid) || euid;
              attachTagButton(link, puid, euid);
              found = true;
            }
          }
        }
        if (found)
          applyHighlights();
      });
      observer.observe(runtime.document.body, { childList: true, subtree: true });
      if (timer === null) {
        timer = setTimeout(function scan() {
          processElement(runtime.document.body);
          applyHighlights();
          timer = setTimeout(scan, 3000);
        }, 2000);
      }
    }
    function loadAuthorMapFromOtherPages(tid, currentPage, totalPages) {
      if (totalPages <= 1)
        return;
      const otherPages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p !== currentPage);
      for (const page of otherPages) {
        const url = buildPageUrl(tid, page);
        runtime.request({
          url,
          method: "GET",
          timeout: 30000,
          onload(response) {
            const doc = htmlToDocument(response.responseText, new runtime.DOMParser);
            const json = extractNextData(doc);
            if (!json)
              return;
            for (const reply of parseReplyList(json)) {
              euidToPuidMap.set(reply.authorEuid, reply.authorPuid);
            }
          },
          onerror: () => {},
          ontimeout: () => {}
        });
      }
    }
    function start() {
      runtime.addStyle(tagPanelCss);
      runtime.addStyle(`.gm-highlight-1 {
  background-color: rgba(46, 139, 87, 0.08);
}
.gm-highlight-2 {
  background-color: rgba(46, 139, 87, 0.14);
}
.gm-highlight-3 {
  background-color: rgba(46, 139, 87, 0.2);
}
.gm-highlight-n1 {
  opacity: 0.4;
}
.gm-highlight-n2 {
  opacity: 0.2;
}
.gm-highlight-n3 {
  opacity: 0.1;
}

.gm-author-tag {
  text-decoration: none;
  margin-left: 2px;
  font-weight: normal;
  font-size: 11px;
}
.gm-author-tag:hover {
  text-decoration: underline;
}`);
      const nextData = extractNextData(runtime.document);
      if (!nextData)
        return;
      const threadData = parseNextData(nextData);
      if (!threadData)
        return;
      euidToPuidMap.set(threadData.authorEuid, threadData.authorPuid);
      for (const reply of parseReplyList(nextData)) {
        euidToPuidMap.set(reply.authorEuid, reply.authorPuid);
      }
      processElement(runtime.document.body);
      applyHighlights();
      setupObserver();
      loadAuthorMapFromOtherPages(threadData.tid, threadData.currentPage, threadData.pageCount);
    }
    return {
      start,
      tagAuthor,
      setTag,
      unsetTag,
      getTags: (puid) => authorTagMap[puid] ? { ...authorTagMap[puid] } : undefined,
      getScore: (puid) => getTotalScore(authorTagMap[puid]),
      getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)),
      applyHighlights: () => applyHighlights(),
      processElement: (root) => processElement(root)
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

  // src/hupu-time-saver/.index.user.ts
  createHupuApp(createBrowserRuntime()).then((app) => app.start());
})();
