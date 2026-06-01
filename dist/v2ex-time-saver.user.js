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

(() => {
  // src/shared/author-labels.ts
  function toRelativeUrl(url) {
    try {
      const u = new URL(url);
      return u.pathname.replace(/^\//, "") + u.hash;
    } catch {
      return url;
    }
  }
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

  // src/v2ex-time-saver/comment-helpers.ts
  function getCommentNumber(comment) {
    return comment.querySelector(".no")?.textContent?.trim() || "";
  }
  function getCommentElementsFromHtmlString(runtime, htmlString) {
    const domParser = new runtime.DOMParser;
    const dom = domParser.parseFromString(htmlString, "text/html");
    return dom.querySelectorAll("#Main > .box > .cell[id]");
  }

  // src/v2ex-time-saver/ui.ts
  var collapseIconSvg = `
  <button class="gm collapse" title="折叠讨论">
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  </button>
`;
  var expandIconSvg = `
  <button class="gm expand" title="展开讨论">
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
    <span>展开讨论</span>
  </button>
`;
  function createCollapseExpandButtons(runtime, discussionCount, onclick) {
    const [collapseBtn, expandBtn] = [collapseIconSvg, expandIconSvg].map((iconStr) => htmlToElement(runtime.document, iconStr));
    collapseBtn.onclick = onclick;
    expandBtn.onclick = onclick;
    const span = expandBtn.querySelector("span");
    if (span) {
      span.innerHTML += `（${discussionCount}）`;
    }
    return [collapseBtn, expandBtn];
  }
  function createReferenceHint(runtime, commentNumber, referencedCommentNumber, onclick) {
    const button = htmlToElement(runtime.document, `<button type="button" class="gm-reference-hint">↪ #${commentNumber} 也回复了 #${referencedCommentNumber}</button>`);
    button.addEventListener("click", onclick);
    return button;
  }
  function getOrCreateReferenceHintContainer(runtime, host) {
    const existing = host.querySelector(":scope > .gm-reference-hints");
    if (existing) {
      return existing;
    }
    const container = htmlToElement(runtime.document, '<div class="gm-reference-hints"></div>');
    host.querySelector(":scope > table")?.insertAdjacentElement("afterend", container);
    return container;
  }
  function createReferenceDialog(runtime, comment, referencedComment) {
    const existingDialog = runtime.document.querySelector(".gm-reference-dialog");
    if (existingDialog) {
      existingDialog.remove();
    }
    const dialog = htmlToElement(runtime.document, `<div class="gm-reference-dialog" role="dialog" aria-modal="true">
      <div class="gm-reference-dialog-panel">
        <div class="gm-reference-dialog-header">引用回复 #${getCommentNumber(comment)}<button type="button" class="gm-reference-dialog-close">关闭</button></div>
        <div class="gm-reference-dialog-content">
          <div class="gm-dialog-card gm-dialog-context-card"><span class="gm-dialog-badge gm-dialog-context-badge">原回复</span></div>
          <div class="gm-dialog-connector">
            <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
            </svg>
          </div>
          <div class="gm-dialog-card gm-dialog-reply-card"><span class="gm-dialog-badge gm-dialog-reply-badge">引用回复</span></div>
        </div>
      </div>
    </div>`);
    const content = dialog.querySelector(".gm-reference-dialog-content");
    const cleanComment = (node) => {
      const cloned = node.cloneNode(true);
      cloned.removeAttribute("id");
      cloned.querySelectorAll("[id]").forEach((it) => it.removeAttribute("id"));
      cloned.querySelectorAll(".gm, .gm-reference-hint").forEach((it) => it.remove());
      return cloned;
    };
    const contextCard = content.querySelector(".gm-dialog-context-card");
    contextCard.appendChild(cleanComment(referencedComment));
    const replyCard = content.querySelector(".gm-dialog-reply-card");
    replyCard.appendChild(cleanComment(comment));
    const closeButton = dialog.querySelector(".gm-reference-dialog-close");
    const close = () => {
      runtime.document.removeEventListener("keydown", onKeydown);
      dialog.remove();
    };
    const onKeydown = (evt) => {
      if (evt.key === "Escape") {
        close();
      }
    };
    closeButton.addEventListener("click", close);
    dialog.addEventListener("click", (evt) => {
      if (evt.target === dialog) {
        close();
      }
    });
    runtime.document.addEventListener("keydown", onKeydown);
    runtime.document.body.appendChild(dialog);
  }

  // src/v2ex-time-saver/discussion-embedder.ts
  var COMMENT_CELLS_SELECTOR = "#Main > .box:nth-child(n+3) > .cell[id]";
  function getCommentAuthorName(comment) {
    return comment.querySelector(":scope > table strong a.dark[href^='/member/']")?.getAttribute("href")?.split("/")[2] || "";
  }
  function getOwnReplyContent(comment) {
    return comment.querySelector(":scope > table .reply_content");
  }
  function getLastCommentByAuthorBeforeNumber(authorComments, currentCommentNumber) {
    return authorComments.filter((comment) => {
      const commentNumber = parseInt(getCommentNumber(comment), 10);
      return commentNumber < currentCommentNumber;
    }).at(-1) || null;
  }
  function getCommentHearts(comment) {
    return Array.from(comment.querySelectorAll('[alt="❤️"]')).map((it) => parseInt(it.nextSibling?.textContent || "0", 10)).reduce((prev, curr) => prev + curr, 0);
  }
  function getTextUntilNextMemberMention(mention) {
    let text = "";
    let node = mention.nextSibling;
    while (node) {
      if (node.nodeType === 1) {
        const element = node;
        if (element.matches("a[href^='/member/']")) {
          break;
        }
        text += element.textContent || "";
      } else {
        text += node.textContent || "";
      }
      node = node.nextSibling;
    }
    return text;
  }
  function getExplicitMentionedComment(mention, commentByNumber) {
    const numberMatch = /#(\d+)/.exec(getTextUntilNextMemberMention(mention));
    if (!numberMatch) {
      return null;
    }
    return commentByNumber.get(numberMatch[1]) || null;
  }
  function getMentionedComments(currentComment, commentByNumber, commentsByAuthor) {
    const currentCommentNumber = parseInt(getCommentNumber(currentComment), 10);
    const replyContent = getOwnReplyContent(currentComment);
    if (!replyContent) {
      return [];
    }
    const seenComments = new Set;
    const mentionedComments = [];
    const mentions = replyContent.querySelectorAll("a[href^='/member/']");
    mentions.forEach((mention) => {
      const mentionedPeopleName = mention.getAttribute("href")?.split("/")[2] || (mention.textContent || "").replace(/^@/, "");
      let mentionedComment = getExplicitMentionedComment(mention, commentByNumber);
      if (!mentionedComment) {
        mentionedComment = getLastCommentByAuthorBeforeNumber(commentsByAuthor.get(mentionedPeopleName) || [], currentCommentNumber);
      }
      if (!mentionedComment || mentionedComment === currentComment || seenComments.has(mentionedComment)) {
        return;
      }
      seenComments.add(mentionedComment);
      mentionedComments.push(mentionedComment);
    });
    return mentionedComments;
  }
  function embedDiscussions(runtime) {
    const comments = Array.from(runtime.document.querySelectorAll(COMMENT_CELLS_SELECTOR));
    const commentByNumber = new Map(comments.map((comment) => [getCommentNumber(comment), comment]).filter(([number]) => number));
    const commentsByAuthor = new Map;
    comments.forEach((comment) => {
      const authorName = getCommentAuthorName(comment);
      if (!authorName) {
        return;
      }
      commentsByAuthor.set(authorName, [...commentsByAuthor.get(authorName) || [], comment]);
    });
    const plans = comments.slice().reverse().map((currentComment) => ({
      currentComment,
      mentionedComments: getMentionedComments(currentComment, commentByNumber, commentsByAuthor)
    })).filter(({ mentionedComments }) => mentionedComments.length > 0);
    plans.forEach(({ currentComment, mentionedComments }) => {
      if (mentionedComments.length === 0) {
        return;
      }
      const sortedByHearts = mentionedComments.slice().sort((a, b) => getCommentHearts(b) - getCommentHearts(a));
      const [primaryComment, ...secondaryComments] = sortedByHearts;
      primaryComment.querySelector(":scope > table")?.insertAdjacentElement("afterend", currentComment);
      currentComment.setAttribute("data-is-embedded", "true");
      secondaryComments.forEach((referencedComment) => addReferenceHint(runtime, referencedComment, currentComment));
    });
  }
  function addReferenceHint(runtime, referencedComment, comment) {
    const commentNumber = getCommentNumber(comment);
    const referencedCommentNumber = getCommentNumber(referencedComment);
    const container = getOrCreateReferenceHintContainer(runtime, referencedComment);
    const button = createReferenceHint(runtime, commentNumber, referencedCommentNumber, () => createReferenceDialog(runtime, comment, referencedComment));
    container.appendChild(button);
  }
  function addCollapseExpandButtons(runtime) {
    runtime.document.querySelectorAll(".cell[id] > .cell[id]").forEach((embedded) => {
      const discussionCount = 1 + embedded.querySelectorAll(".cell[id]").length;
      const [collapseBtn, expandBtn] = createCollapseExpandButtons(runtime, discussionCount, toggleDiscussionVisibility);
      embedded.insertAdjacentElement("afterbegin", collapseBtn);
      embedded.insertAdjacentElement("afterbegin", expandBtn);
    });
  }
  function toggleDiscussionVisibility(evt) {
    const clickedButton = evt.target?.closest("button");
    const comment = clickedButton?.closest(".cell[id]");
    comment?.classList.toggle("discussions-collapsed");
  }

  // src/v2ex-time-saver/sign-in.ts
  function checkAndDoSignIn(runtime) {
    const linkEl = runtime.document.querySelector("a[href='/mission/daily']");
    if (!linkEl)
      return;
    const missionUrl = `${runtime.location.origin}/mission/daily`;
    runtime.request({
      url: missionUrl,
      method: "GET",
      timeout: 30000,
      onload(response) {
        const redeemPath = extractRedeemUrl(response.responseText);
        if (!redeemPath) {
          linkEl.textContent = "自动签到失败，请手动签到";
          return;
        }
        runtime.request({
          url: `${runtime.location.origin}${redeemPath}`,
          method: "GET",
          timeout: 30000,
          onload() {
            linkEl.textContent = "自动签到成功";
          }
        });
      }
    });
  }
  function extractRedeemUrl(html) {
    const match = /location\.href\s*=\s*'(\/mission\/daily\/redeem[^']+)'/.exec(html);
    return match ? match[1] : null;
  }

  // src/v2ex-time-saver/thread-enhancements.ts
  var COMMENT_BOX_SELECTOR = "#Main > .box:nth-child(n+3)";
  var COMMENT_CELLS_SELECTOR2 = `${COMMENT_BOX_SELECTOR} > .cell[id]`;
  var COMMENT_BOX_FIRST_CELL_SELECTOR = `${COMMENT_BOX_SELECTOR} > .cell`;
  var SCORE_CLASS_MIN = -3;
  var SCORE_CLASS_MAX = 3;
  var SCORE_CLASS_RE = /^gm-author--?\d+$/;
  function clampScoreClass(score) {
    if (score > SCORE_CLASS_MAX)
      return SCORE_CLASS_MAX;
    if (score < SCORE_CLASS_MIN)
      return SCORE_CLASS_MIN;
    return score;
  }
  function clearExistingHighlight(authorLink) {
    authorLink.querySelectorAll(".gm-author-tag").forEach((el) => el.remove());
    const tr = authorLink.closest("tr");
    if (!tr)
      return;
    Array.from(tr.classList).filter((c) => SCORE_CLASS_RE.test(c)).forEach((c) => tr.classList.remove(c));
  }
  function scrollToComment(number, runtime) {
    if (number === "0") {
      runtime.document.defaultView?.scrollTo(0, 0);
      return;
    }
    for (const cell of runtime.document.querySelectorAll(".cell[id]")) {
      const no = cell.querySelector("span.no")?.textContent?.trim();
      if (no === number) {
        cell.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
    }
  }
  function highlightCommentsAndTopics(runtime, authorTagMap) {
    const origin = runtime.location.origin;
    runtime.document.querySelectorAll(".cell").forEach((cell) => {
      const authorLink = cell.querySelector("strong > a[href]");
      if (!authorLink)
        return;
      const id = authorLink.getAttribute("href")?.split("/")[2];
      if (!id)
        return;
      const tags = authorTagMap[id];
      if (!tags)
        return;
      clearExistingHighlight(authorLink);
      const total = getTotalScore(tags);
      const cls = `gm-author-${clampScoreClass(total)}`;
      authorLink.closest("tr")?.classList.add(cls);
      for (const [tagName, tag] of Object.entries(tags)) {
        const fullUrl = new URL(tag.url, origin).href;
        const [pathPart] = tag.url.split("#");
        const isSamePage = pathPart === runtime.location.pathname.replace(/^\//, "");
        const tagLink = htmlToElement(runtime.document, `<a class="gm-author-tag" href="${fullUrl}" style="color:${tagColor(tag.score)}"${isSamePage ? "" : ' target="_blank"'}>x</a>`);
        tagLink.textContent = tagName;
        if (isSamePage) {
          tagLink.addEventListener("click", (e) => {
            e.preventDefault();
            const num = tag.url.split("#")[1];
            scrollToComment(num, runtime);
          });
        }
        authorLink.insertAdjacentElement("beforeend", tagLink);
      }
    });
  }
  function reorderCommentsByHearts(runtime) {
    const heartsFlagKey = "data-hearts";
    const comments = Array.from(runtime.document.querySelectorAll(COMMENT_CELLS_SELECTOR2));
    comments.forEach((comment) => {
      const hearts = Array.from(comment.querySelectorAll('[alt="❤️"]')).map((it) => parseInt(it.nextSibling?.textContent || "0", 10)).reduce((prev, curr) => prev + curr, 0);
      comment.setAttribute(heartsFlagKey, String(hearts));
    });
    const countsElement = runtime.document.querySelector(COMMENT_BOX_FIRST_CELL_SELECTOR);
    comments.filter((it) => it.getAttribute(heartsFlagKey) !== "0").reverse().sort((a, b) => parseInt(a.getAttribute(heartsFlagKey) || "0", 10) - parseInt(b.getAttribute(heartsFlagKey) || "0", 10)).forEach((it) => countsElement?.insertAdjacentElement("afterend", it));
  }
  function addTargetToTopicLinks(runtime) {
    runtime.document.querySelectorAll(".topic-link, .item_hot_topic_title > a").forEach((it) => it.setAttribute("target", "_blank"));
  }

  // src/v2ex-time-saver/app.ts
  var authorTagsKeyword = "author_tags";
  var defaultLabels = {
    shame: "若婴",
    thank: "智者"
  };
  async function startV2exTimeSaver(runtime) {
    const app = await createV2exApp(runtime);
    app.start();
  }
  async function loadAuthorTagMap(runtime) {
    const value = await runtime.getValue(authorTagsKeyword, {});
    return parseAuthorTagMap(value);
  }
  var COMMENT_BOX_SELECTOR2 = "#Main > .box:nth-child(n+3)";
  var COMMENT_CELLS_SELECTOR3 = `${COMMENT_BOX_SELECTOR2} > .cell[id]`;
  async function createV2exApp(runtime) {
    const authorTagMap = await loadAuthorTagMap(runtime);
    function buildAuthorUrl(commentNumber) {
      return `${runtime.location.origin}${runtime.location.pathname}#${commentNumber}`;
    }
    function getRelativeAuthorUrl(commentNumber) {
      return toRelativeUrl(buildAuthorUrl(commentNumber));
    }
    function persist() {
      runtime.setValue(authorTagsKeyword, authorTagMap);
    }
    function tagAuthor(id, commentNumber, tag, delta) {
      const url = getRelativeAuthorUrl(commentNumber);
      incrementTagScore(authorTagMap, id, tag, url, delta);
      persist();
      highlightCommentsAndTopics(runtime, authorTagMap);
    }
    function setTag(id, tag, score, commentNumber) {
      const url = getRelativeAuthorUrl(commentNumber);
      addTag(authorTagMap, id, tag, url, score);
      persist();
      highlightCommentsAndTopics(runtime, authorTagMap);
    }
    function unsetTag(id, tag) {
      removeTag(authorTagMap, id, tag);
      persist();
      highlightCommentsAndTopics(runtime, authorTagMap);
    }
    function scrollToCommentByHash() {
      const hash = runtime.location.hash;
      if (!/^#\d+$/.test(hash))
        return;
      scrollToComment(hash.slice(1), runtime);
    }
    const callbacks = { onTagAuthor: tagAuthor, onSetTag: setTag, onUnsetTag: unsetTag };
    const quickLabels = {
      shame: { tag: defaultLabels.shame, display: "不说人话" },
      thank: { tag: defaultLabels.thank, display: defaultLabels.thank }
    };
    const btnClass = "gm-tag-btn";
    function ensureTagBtn(container, id, commentNumber, ref) {
      if (container.querySelector(`.${btnClass}`))
        return;
      const btn = htmlToElement(runtime.document, `<a class="${btnClass}" href="#;">\uD83C\uDFF7</a>`);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        buildTagPanel(runtime, authorTagMap, id, commentNumber, btn, callbacks, quickLabels);
      });
      if (ref) {
        ref.insertAdjacentElement("afterend", btn);
      } else {
        container.appendChild(btn);
      }
    }
    function addTagPanel() {
      const topicAuthorId = runtime.document.querySelector(".header .avatar")?.getAttribute("alt");
      if (topicAuthorId) {
        const topicButtons = runtime.document.querySelector(".topic_buttons");
        if (topicButtons) {
          ensureTagBtn(topicButtons, topicAuthorId, 0, null);
        }
      }
      runtime.document.querySelectorAll(".cell").forEach((cell) => {
        const authorLink = cell.querySelector("strong > a[href]");
        if (!authorLink)
          return;
        const id = authorLink.getAttribute("href")?.split("/")[2];
        if (!id)
          return;
        const commentNumber = cell.querySelector("span.no")?.textContent?.trim();
        if (!commentNumber)
          return;
        ensureTagBtn(cell, id, commentNumber, authorLink);
      });
    }
    function enhanceThreadPage() {
      embedDiscussions(runtime);
      reorderCommentsByHearts(runtime);
      addCollapseExpandButtons(runtime);
      addTagPanel();
      highlightCommentsAndTopics(runtime, authorTagMap);
      addTargetToTopicLinks(runtime);
      scrollToCommentByHash();
    }
    let commentsOfPages = [];
    function tryDisplayAllComments() {
      const isAllPagesLoaded = commentsOfPages.every((page) => page !== null && page.length > 0);
      if (!isAllPagesLoaded) {
        return;
      }
      const fragment = runtime.document.createDocumentFragment();
      commentsOfPages.forEach((pageComments) => {
        pageComments?.forEach((it) => fragment.appendChild(it));
      });
      const commentBox = runtime.document.querySelector(COMMENT_BOX_SELECTOR2);
      const countsElement = commentBox?.querySelector(".cell");
      if (!commentBox || !countsElement) {
        return;
      }
      commentBox.prepend(fragment);
      commentBox.prepend(countsElement);
      Array.from(runtime.document.querySelectorAll(".ps_container")).filter((it, idx) => idx > 0).forEach((it) => it.remove());
      enhanceThreadPage();
    }
    function loadCommentsByPage(page, idx) {
      const url = `${runtime.location.origin}${runtime.location.pathname}?p=${page}`;
      runtime.request({
        url,
        method: "GET",
        timeout: 30000,
        onload(response) {
          commentsOfPages[idx] = getCommentElementsFromHtmlString(runtime, response.responseText);
          tryDisplayAllComments();
        }
      });
    }
    function start() {
      const isReadingTopic = runtime.location.href.indexOf("v2ex.com/t/") > 0;
      addStyles();
      checkAndDoSignIn(runtime);
      const allPageNumbers = Array.from(runtime.document.querySelectorAll(".page_current, .page_normal")).map((it) => parseInt(it.textContent || "", 10)).filter((it) => isReadingTopic && !isNaN(it) && it >= 1 && it <= 10).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
      if (!allPageNumbers.length) {
        enhanceThreadPage();
        return;
      }
      const currentPageEl = runtime.document.querySelector(".page_current");
      const currentPageNum = currentPageEl ? parseInt(currentPageEl.textContent || "", 10) : parseInt(new URL(runtime.location.href).searchParams.get("p") || "1", 10) || 1;
      commentsOfPages = allPageNumbers.map(() => null);
      allPageNumbers.forEach((pageNum, idx) => {
        if (pageNum === currentPageNum) {
          commentsOfPages[idx] = runtime.document.querySelectorAll(COMMENT_CELLS_SELECTOR3);
        } else {
          loadCommentsByPage(pageNum, idx);
        }
      });
      tryDisplayAllComments();
    }
    function addStyles() {
      runtime.addStyle(tagPanelCss);
      runtime.addStyle(`.cell[id] > .cell[id] {
  border-left: 2px solid lightblue;
  padding-bottom: 0;
  padding-right: 0;
}
button.gm {
  cursor: pointer;
  padding: 0;
  border: 0;
  background: transparent;
  position: relative;
  z-index: 2;
}
.gm.expand {
  display: none;
  color: mediumpurple;
}
.gm.collapse {
  display: block;
  color: lightblue;
}
button.gm.collapse > svg {
  position: absolute;
  top: -13px;
  right: -2px;
}
.cell.discussions-collapsed > .gm.expand {
  display: block;
  margin-bottom: -12px;
}
.cell.discussions-collapsed > .gm.expand > span {
  vertical-align: super;
}
.cell.discussions-collapsed > .gm.collapse {
  display: none;
}
.cell.discussions-collapsed > :not(.gm) {
  display: none;
}
.gm-author--3 > td {
  opacity: 0.1;
}
.gm-author--2 > td {
  opacity: 0.3;
}
.gm-author--1 > td {
  opacity: 0.4;
}
.gm-author-1 {
  background: rgba(46, 139, 87, 0.1);
}
.gm-author-2 {
  background: rgba(46, 139, 87, 0.15);
}
.gm-author-3 {
  background: rgba(46, 139, 87, 0.2);
}
.gm-author-tag {
  text-decoration: none;
  margin-left: 2px;
  font-weight: normal;
}

.gm-reference-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0 8px 8px;
}
.gm-reference-hint {
  cursor: pointer;
  border: 1px solid lightblue;
  border-radius: 4px;
  padding: 2px 8px;
  background: aliceblue;
  color: steelblue;
}
.gm-reference-dialog {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.36);
}
.gm-reference-dialog-panel {
  box-sizing: border-box;
  width: min(780px, 100%);
  max-height: min(720px, 90vh);
  overflow: auto;
  border-radius: 8px;
  background: white;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.24);
}
.gm-reference-dialog-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e5e5;
  background: white;
  font-weight: bold;
}
.gm-reference-dialog-close {
  cursor: pointer;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  padding: 2px 8px;
  background: #f8f8f8;
}
.gm-reference-dialog-content {
  padding: 0 12px 12px;
}
.gm-reference-dialog-content > .cell {
  border-bottom: 0;
}
.gm-dialog-card {
  position: relative;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.gm-dialog-context-card {
  background: #f8fafc;
  border-color: #e2e8f0;
}
.gm-dialog-reply-card {
  background: #ffffff;
  border-color: #e1e4e8;
}
.gm-dialog-badge {
  position: absolute;
  top: -8px;
  right: 8px;
  font-size: 11px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  user-select: none;
}
.gm-dialog-context-badge {
  background: #e2e8f0;
  color: #475569;
}
.gm-dialog-reply-badge {
  background: #dbeafe;
  color: #1e40af;
}
.gm-dialog-connector {
  display: flex;
  justify-content: center;
  align-items: center;
  color: #94a3b8;
  margin: 6px 0;
}
.gm-dialog-card > .cell {
  border-bottom: 0;
  padding: 0;
}`);
    }
    return {
      addTargetToTopicLinks,
      embedDiscussions,
      getCommentElementsFromHtmlString: (html) => getCommentElementsFromHtmlString(runtime, html),
      highlightCommentsAndTopics: () => highlightCommentsAndTopics(runtime, authorTagMap),
      tagAuthor,
      setTag,
      unsetTag,
      getTags: (id) => authorTagMap[id] ? { ...authorTagMap[id] } : undefined,
      getScore: (id) => getTotalScore(authorTagMap[id]),
      getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)),
      reorderCommentsByHearts,
      start
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

  // src/v2ex-time-saver/.index.user.ts
  startV2exTimeSaver(createBrowserRuntime());
})();
