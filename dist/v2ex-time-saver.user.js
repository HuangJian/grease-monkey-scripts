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
  // src/v2ex-time-saver/author-labels.ts
  var defaultLabels = {
    shame: "若婴",
    thank: "智者"
  };
  function getAuthorRecord(map, id) {
    const value = map.get(id);
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      return { url: value };
    }
    return value;
  }
  function getAuthorLabel(map, id, fallbackLabel) {
    return getAuthorRecord(map, id)?.label || fallbackLabel;
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

  // src/utils.ts
  function htmlToElement(document2, html) {
    const template = document2.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstChild;
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
    const container = runtime.document.createElement("div");
    container.className = "gm-reference-hints";
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

  // src/v2ex-time-saver/constants.ts
  var COMMENT_BOX_SELECTOR = "#Main > .box:nth-child(n+3)";
  var COMMENT_CELLS_SELECTOR = `${COMMENT_BOX_SELECTOR} > .cell[id]`;
  var COMMENT_BOX_FIRST_CELL_SELECTOR = `${COMMENT_BOX_SELECTOR} > .cell`;

  // src/v2ex-time-saver/discussion-embedder.ts
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

  // src/v2ex-time-saver/thread-enhancements.ts
  function getTagMarkup(text, color) {
    return ` <span style="color:${color}">[${text}]</span>`;
  }
  function getAuthorIdAndCommentNumber(thankArea) {
    const cell = thankArea.closest(".cell");
    const id = cell?.querySelector("a.dark[href]")?.getAttribute("href")?.split("/")[2];
    const commentNumber = cell?.querySelector("span.no")?.textContent;
    if (!id || !commentNumber) {
      return null;
    }
    return { id, commentNumber };
  }
  function highlightCommentsAndTopics(runtime, shamedMap, thankedMap) {
    runtime.document.querySelectorAll(".cell").forEach((cell) => {
      const it = cell.querySelector("strong > a[href]");
      if (!it)
        return;
      const id = it.getAttribute("href")?.split("/")[2];
      if (!id) {
        return;
      }
      const shameLabel = getAuthorLabel(shamedMap, id, defaultLabels.shame);
      const thankLabel = getAuthorLabel(thankedMap, id, defaultLabels.thank);
      if (shamedMap.has(id) && !it.textContent?.includes(shameLabel)) {
        it.insertAdjacentHTML("beforeend", getTagMarkup(shameLabel, "red"));
        it.closest("td")?.classList.add("shame");
      }
      if (thankedMap.has(id) && !it.textContent?.includes(thankLabel)) {
        it.insertAdjacentHTML("beforeend", getTagMarkup(thankLabel, "darkgreen"));
        it.closest("tr")?.classList.add("nice-author");
      }
    });
  }
  function reorderCommentsByHearts(runtime) {
    const heartsFlagKey = "data-hearts";
    const comments = Array.from(runtime.document.querySelectorAll(COMMENT_CELLS_SELECTOR));
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
  function addShameButtons(runtime, likeDislikeAuthor) {
    const btn = htmlToElement(runtime.document, '<a style="margin-left: 12px; color: lightpink" class="thank" href="#;">不说人话</a>');
    btn.addEventListener("click", () => {
      const authorId = runtime.document.querySelector(".header .avatar")?.getAttribute("alt");
      if (authorId) {
        likeDislikeAuthor(authorId, 0, false);
      }
    });
    runtime.document.querySelector(".topic_buttons")?.appendChild(btn);
    runtime.document.querySelectorAll(".thank_area").forEach((it) => {
      const info = getAuthorIdAndCommentNumber(it);
      if (!info)
        return;
      const cloned = btn.cloneNode(true);
      cloned.addEventListener("click", () => likeDislikeAuthor(info.id, info.commentNumber, false));
      it.appendChild(cloned);
    });
  }
  function addMoreThankActions(runtime, likeDislikeAuthor) {
    const topic = runtime.document.querySelector("#topic_thank");
    if (topic) {
      topic.addEventListener("mouseup", () => {
        setTimeout(() => {
          const authorId = runtime.document.querySelector(".header .avatar")?.getAttribute("alt");
          if (authorId) {
            likeDislikeAuthor(authorId, 0, true);
          }
        });
      });
    }
    Array.from(runtime.document.querySelectorAll(".thank_area > a.thank")).filter((it) => it.textContent?.includes("感谢回复者")).forEach((it) => {
      const info = getAuthorIdAndCommentNumber(it);
      if (!info)
        return;
      it.addEventListener("mouseup", () => setTimeout(() => likeDislikeAuthor(info.id, info.commentNumber, true)));
    });
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

  // src/v2ex-time-saver/app.ts
  function parseAuthorMap(value) {
    if (!value) {
      return new Map;
    }
    return new Map(JSON.parse(value));
  }
  var shameKeyword = "shame_on_them";
  var thankKeyword = "thanks_to_them";
  async function startV2exTimeSaver(runtime) {
    const app = await createV2exApp(runtime);
    app.start();
  }
  async function createV2exApp(runtime) {
    const [shamedMap, thankedMap] = (await Promise.all([shameKeyword, thankKeyword].map(async (key) => runtime.getValue(key, "[]")))).map((value) => parseAuthorMap(value));
    function likeDislikeAuthorWrapper(id, commentNumber, isLike) {
      const url = `${runtime.location.origin}${runtime.location.pathname}#${commentNumber}`;
      const map = isLike ? thankedMap : shamedMap;
      const keyword = isLike ? thankKeyword : shameKeyword;
      const fallbackLabel = isLike ? defaultLabels.thank : defaultLabels.shame;
      const currentLabel = getAuthorLabel(map, id, fallbackLabel);
      const actionName = isLike ? "感谢" : "标记";
      const label = runtime.prompt(`请输入给作者 ${id} 的${actionName}标签：`, currentLabel);
      if (label === null) {
        return;
      }
      map.set(id, {
        url,
        label: label.trim() || fallbackLabel
      });
      runtime.setValue(keyword, JSON.stringify(Array.from(map)));
      highlightCommentsAndTopics(runtime, shamedMap, thankedMap);
    }
    function enhanceThreadPage() {
      embedDiscussions(runtime);
      reorderCommentsByHearts(runtime);
      addCollapseExpandButtons(runtime);
      addShameButtons(runtime, likeDislikeAuthorWrapper);
      addMoreThankActions(runtime, likeDislikeAuthorWrapper);
      highlightCommentsAndTopics(runtime, shamedMap, thankedMap);
      addTargetToTopicLinks(runtime);
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
      const commentBox = runtime.document.querySelector(COMMENT_BOX_SELECTOR);
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
          commentsOfPages[idx] = runtime.document.querySelectorAll(COMMENT_CELLS_SELECTOR);
        } else {
          loadCommentsByPage(pageNum, idx);
        }
      });
      tryDisplayAllComments();
    }
    function addStyles() {
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
.shame {
  opacity: 0.5;
}
.nice-author {
  background: lightcyan;
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
      highlightCommentsAndTopics: () => highlightCommentsAndTopics(runtime, shamedMap, thankedMap),
      likeDislikeAuthor: likeDislikeAuthorWrapper,
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
