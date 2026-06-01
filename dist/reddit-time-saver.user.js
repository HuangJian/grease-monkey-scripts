// ==UserScript==
// @name         reddit time saver
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      1.0
// @description  Reddit companion: tag users, highlight comments, save time!
// @author       ustc.hj@gmail.com
// @match        *.reddit.com/*
// @icon         https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png
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

  // src/reddit-time-saver/app.ts
  var STORAGE_KEY = "reddit_author_tags";
  var BTN_CLASS = "gm-tag-btn";
  var PROCESSED_CLASS = "gm-processed";
  async function loadAuthorTagMap(runtime) {
    const value = await runtime.getValue(STORAGE_KEY, {});
    return parseAuthorTagMap(value);
  }
  function getAuthorName(authorLink) {
    const href = authorLink.getAttribute("href") || "";
    const match = href.match(/\/user\/([^/]+)/i);
    if (!match)
      return "";
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return "";
    }
  }
  function getCommentId(authorLink) {
    const comment = authorLink.closest('[id*="t1_"], .thing[id]');
    return comment?.id || "";
  }
  function buildAnchorUrl(runtime, commentId) {
    const path = runtime.location.pathname.replace(/\/$/, "");
    return `${path}/${commentId}/`;
  }
  async function createRedditApp(runtime) {
    const authorTagMap = await loadAuthorTagMap(runtime);
    let closePanel = null;
    function persist() {
      runtime.setValue(STORAGE_KEY, authorTagMap);
    }
    function tagAuthor(username, commentId, tag, delta) {
      const anchor = buildAnchorUrl(runtime, commentId);
      incrementTagScore(authorTagMap, username, tag, anchor, delta);
      persist();
      applyHighlights();
    }
    function setTag(username, tag, score, commentId) {
      const anchor = buildAnchorUrl(runtime, commentId);
      addTag(authorTagMap, username, tag, anchor, score);
      persist();
      applyHighlights();
    }
    function unsetTag(username, tag) {
      removeTag(authorTagMap, username, tag);
      persist();
      applyHighlights();
    }
    function dismissPanel() {
      closePanel?.();
      closePanel = null;
      const panel = runtime.document.querySelector(".gm-tag-panel");
      if (panel)
        panel.remove();
    }
    function buildTagPanel(username, commentId, triggerBtn) {
      dismissPanel();
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
          <button class="gm-tag-quick-shame">若婴 (-1)</button>
          <button class="gm-tag-quick-thank">智者 (+1)</button>
        </div>
      </div>`);
      panel.querySelector(".gm-tag-panel-title").textContent = username;
      const list = panel.querySelector(".gm-tag-list");
      panel.querySelector(".gm-tag-panel-close").addEventListener("click", dismissPanel);
      function renderTags() {
        const tags = authorTagMap[username] || {};
        const entries = Object.entries(tags);
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
            tagAuthor(username, commentId, tagName, 1);
            renderTags();
          });
          decBtn.addEventListener("click", () => {
            tagAuthor(username, commentId, tagName, -1);
            renderTags();
          });
          delBtn.addEventListener("click", () => {
            unsetTag(username, tagName);
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
        setTag(username, name, score, commentId);
        addNameInput.value = "";
        addScoreInput.value = "0";
        renderTags();
      });
      panel.querySelector(".gm-tag-quick-shame").addEventListener("click", () => {
        tagAuthor(username, commentId, "若婴", -1);
        renderTags();
      });
      panel.querySelector(".gm-tag-quick-thank").addEventListener("click", () => {
        tagAuthor(username, commentId, "智者", 1);
        renderTags();
      });
      renderTags();
      const rect = triggerBtn.getBoundingClientRect();
      panel.style.position = "fixed";
      panel.style.top = `${rect.bottom + 4}px`;
      panel.style.left = `${Math.min(rect.left, (runtime.document.defaultView?.innerWidth ?? 320) - 320)}px`;
      runtime.document.body.appendChild(panel);
      const outsideHandler = (e) => {
        if (e.target.closest(`.${BTN_CLASS}`))
          return;
        if (!panel.contains(e.target)) {
          dismissPanel();
        }
      };
      closePanel = () => {
        runtime.document.removeEventListener("mousedown", outsideHandler);
      };
      setTimeout(() => {
        if (!closePanel)
          return;
        runtime.document.addEventListener("mousedown", outsideHandler);
      }, 0);
    }
    function attachTagButton(authorLink) {
      if (authorLink.classList.contains(PROCESSED_CLASS))
        return;
      const username = getAuthorName(authorLink);
      if (!username)
        return;
      const commentId = getCommentId(authorLink);
      const authorNameSlot = authorLink.closest('span[slot="authorName"]');
      if (authorNameSlot) {
        if (authorNameSlot.classList.contains(PROCESSED_CLASS))
          return;
        authorNameSlot.classList.add(PROCESSED_CLASS);
      } else {
        const meta = authorLink.closest('[slot="commentMeta"]');
        if (meta) {
          if (meta.classList.contains(PROCESSED_CLASS))
            return;
          meta.classList.add(PROCESSED_CLASS);
        } else {
          if (authorLink.nextElementSibling?.classList.contains(BTN_CLASS))
            return;
        }
      }
      authorLink.classList.add(PROCESSED_CLASS);
      const btn = htmlToElement(runtime.document, `<a class="${BTN_CLASS}" href="#;">\uD83C\uDFF7</a>`);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        buildTagPanel(username, commentId, btn);
      });
      if (authorNameSlot) {
        authorNameSlot.insertAdjacentElement("afterend", btn);
      } else {
        const meta = authorLink.closest('[slot="commentMeta"]');
        if (meta) {
          meta.appendChild(btn);
        } else {
          authorLink.insertAdjacentElement("afterend", btn);
        }
      }
    }
    function isAuthorHeader(link) {
      const text = (link.textContent || "").trim();
      if (!text)
        return false;
      if (text.startsWith("u/") || text.startsWith("/u/"))
        return false;
      return true;
    }
    function findCommentContent(authorLink) {
      const meta = authorLink.closest('[slot="commentMeta"]');
      if (meta) {
        return meta.parentElement?.querySelector('[slot="comment"]') ?? null;
      }
      const entry = authorLink.closest(".entry");
      if (entry) {
        return entry.querySelector(".md");
      }
      return null;
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
      for (const authorLink of findAuthorLinks(runtime.document.body)) {
        if (!isAuthorHeader(authorLink))
          continue;
        const username = getAuthorName(authorLink);
        if (!username)
          continue;
        const tags = authorTagMap[username];
        if (!tags)
          continue;
        const total = getTotalScore(tags);
        for (const [tagName, record] of Object.entries(tags)) {
          const tagEl = htmlToElement(runtime.document, `<a class="gm-author-tag" href="${new URL(record.url, runtime.location.origin).href}" target="_blank"></a>`);
          tagEl.textContent = tagName;
          tagEl.style.color = tagColor(record.score);
          authorLink.insertAdjacentElement("afterend", tagEl);
        }
        const content = findCommentContent(authorLink);
        if (!content)
          continue;
        const clamped = clampScore(total);
        if (clamped !== 0) {
          const cls = `gm-highlight-${clamped < 0 ? `n${-clamped}` : clamped}`;
          content.classList.add(cls);
        }
      }
    }
    function processElement(root) {
      const links = findAuthorLinks(root);
      for (const link of links) {
        if (!isAuthorHeader(link))
          continue;
        const username = getAuthorName(link);
        if (!username)
          continue;
        if (link.classList.contains(PROCESSED_CLASS))
          continue;
        attachTagButton(link);
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
            const links = findAuthorLinks(node);
            for (const link of links) {
              if (!isAuthorHeader(link))
                continue;
              if (link.classList.contains(PROCESSED_CLASS))
                continue;
              attachTagButton(link);
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
    function start() {
      runtime.addStyle(`.gm-tag-btn {
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
}
.gm-highlight-1 {
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
      processElement(runtime.document.body);
      applyHighlights();
      setupObserver();
    }
    return {
      start,
      getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)),
      tagAuthor,
      setTag,
      unsetTag,
      applyHighlights: () => applyHighlights(),
      processElement: (root) => processElement(root)
    };
  }
  function findAuthorLinks(root) {
    const links = [];
    function walk(node) {
      if (node.nodeType !== 1)
        return;
      const el = node;
      if (el.tagName === "A") {
        const href = el.getAttribute("href") || "";
        if (href.toLowerCase().includes("/user/")) {
          links.push(el);
        }
      }
      const shadow = el.shadowRoot;
      if (shadow) {
        walk(shadow);
      }
      let child = el.firstChild;
      while (child) {
        walk(child);
        child = child.nextSibling;
      }
    }
    walk(root);
    return links;
  }
  async function startRedditTimeSaver(runtime) {
    const app = await createRedditApp(runtime);
    app.start();
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

  // src/reddit-time-saver/.index.user.ts
  startRedditTimeSaver(createBrowserRuntime());
})();
