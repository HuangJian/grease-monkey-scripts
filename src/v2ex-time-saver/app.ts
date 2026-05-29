import type { AuthorMap, AuthorRecord, Runtime } from "./types";

export const shameKeyword = "shame_on_them";
export const thankKeyword = "thanks_to_them";

export const defaultLabels = {
  shame: "若婴",
  thank: "智者",
} as const;

const collapseIconSvg = `
  <button class="gm collapse" title="折叠讨论">
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  </button>
`;

const expandIconSvg = `
  <button class="gm expand" title="展开讨论">
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
    <span>展开讨论</span>
  </button>
`;

export type V2exApp = Awaited<ReturnType<typeof createV2exApp>>;

export async function startV2exTimeSaver(runtime: Runtime): Promise<void> {
  const app = await createV2exApp(runtime);
  app.start();
}

export async function createV2exApp(runtime: Runtime) {
  const [shamedMap, thankedMap] = (
    await Promise.all(
      [shameKeyword, thankKeyword].map(async key => runtime.getValue(key, "[]")),
    )
  ).map(value => parseAuthorMap(value));

  const $ = <T extends Element = Element>(selector: string): T | null =>
    runtime.document.querySelector<T>(selector);
  const $$ = <T extends Element = Element>(selector: string): T[] =>
    Array.from(runtime.document.querySelectorAll<T>(selector));

  function likeDislikeAuthor(id: string, commentNumber: number | string, isLike: boolean) {
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
      label: label.trim() || fallbackLabel,
    });
    void runtime.setValue(keyword, JSON.stringify(Array.from(map)));
    highlightCommentsAndTopics();
  }

  function addShameButtons() {
    const btn = htmlToElement<HTMLAnchorElement>(
      runtime.document,
      '<a style="margin-left: 12px; color: lightpink" class="thank" href="#;">不说人话</a>',
    );

    btn.onclick = () => {
      const authorId = $(".header .avatar")?.getAttribute("alt");
      if (authorId) {
        likeDislikeAuthor(authorId, 0, false);
      }
    };
    $(".topic_buttons")?.appendChild(btn);

    $$(".thank_area").forEach(it => {
      const id = it.closest(".cell")?.querySelector("a.dark[href]")?.getAttribute("href")?.split("/")[2];
      const commentNumber = it.parentElement?.querySelector("span.no")?.textContent;
      if (!id || !commentNumber) {
        return;
      }
      const cloned = btn.cloneNode(true) as HTMLAnchorElement;
      cloned.onclick = () => likeDislikeAuthor(id, commentNumber, false);
      it.appendChild(cloned);
    });
  }

  function addMoreThankActions() {
    const topic = $("#topic_thank") as HTMLElement | null;
    if (topic) {
      topic.addEventListener("mousedown", () => {
        const authorId = $(".header .avatar")?.getAttribute("alt");
        if (authorId) {
          likeDislikeAuthor(authorId, 0, true);
        }
      });
    }

    $$(".thank_area > a.thank")
      .filter(it => it.innerHTML.includes("感谢回复者"))
      .forEach(it => {
        const id = it.closest(".cell")?.querySelector("a.dark[href]")?.getAttribute("href")?.split("/")[2];
        const commentNumber = it.closest(".cell")?.querySelector("span.no")?.textContent;
        if (!id || !commentNumber) {
          return;
        }
        it.addEventListener("mousedown", () => likeDislikeAuthor(id, commentNumber, true));
      });
  }

  function highlightCommentsAndTopics() {
    $$(".cell strong > a[href]").forEach(it => {
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

  function reorderCommentsByHearts() {
    const heartsFlagKey = "data-hearts";
    const comments = $$("#Main > .box:nth-child(n+3) > .cell[id]");
    comments.forEach(comment => {
      const hearts = Array.from(comment.querySelectorAll('[alt="❤️"]'))
        .map(it => parseInt(it.nextSibling?.textContent || "0", 10))
        .reduce((prev, curr) => prev + curr, 0);
      comment.setAttribute(heartsFlagKey, String(hearts));
    });

    const countsElement = $("#Main > .box:nth-child(n+3) > .cell");
    comments
      .filter(it => it.getAttribute(heartsFlagKey) !== "0")
      .reverse()
      .sort(
        (a, b) =>
          parseInt(a.getAttribute(heartsFlagKey) || "0", 10) -
          parseInt(b.getAttribute(heartsFlagKey) || "0", 10),
      )
      .forEach(it => countsElement?.insertAdjacentElement("afterend", it));
  }

  function addTargetToTopicLinks() {
    $$(".topic-link, .item_hot_topic_title > a").forEach(it => it.setAttribute("target", "_blank"));
  }

  function enhanceThreadPage() {
    embedDiscussions();
    addCollapseExpandButtons();
    reorderCommentsByHearts();
    addShameButtons();
    addMoreThankActions();
    highlightCommentsAndTopics();
    addTargetToTopicLinks();
  }

  function getCommentByNumber(num: number) {
    return $$(".no")
      .filter(it => it.textContent?.includes(String(num)))[0]
      ?.closest(".cell[id]");
  }

  function getLastCommentByAuthorBeforeNumber(authorName: string, num: number) {
    return $$(`a[href="/member/${authorName}"].dark`)
      .map(it => it.closest(".cell[id]"))
      .filter((it): it is Element => Boolean(it))
      .filter(it => {
        const commentNumber = parseInt(it.querySelector(".no")?.textContent || "", 10);
        return commentNumber < num;
      })
      .reverse()
      .reduce<Element | null>((prev, curr) => prev || curr, null);
  }

  function getCommentNumber(comment: Element) {
    return comment.querySelector(".no")?.textContent?.trim() || "";
  }

  function toggleDiscussionVisibility(evt: Event) {
    const clickedButton = (evt.target as Element | null)?.closest("button");
    const comment = clickedButton?.closest(".cell[id]");
    comment?.classList.toggle("discussions-collapsed");
  }

  function addCollapseExpandButtons() {
    $$(".cell[id] > .cell[id]").forEach(embedded => {
      const discussionCount = 1 + embedded.querySelectorAll(".cell[id]").length;
      [collapseIconSvg, expandIconSvg].forEach(iconStr => {
        const btn = htmlToElement<HTMLButtonElement>(runtime.document, iconStr);
        btn.onclick = toggleDiscussionVisibility;
        const span = btn.querySelector("span");
        if (span) {
          span.innerHTML += `（${discussionCount}）`;
        }
        embedded.insertAdjacentElement("afterbegin", btn);
      });
    });
  }


  function embedDiscussions() {
    const comments = $$("#Main > .box:nth-child(n+3) > .cell[id]");
    const commentByNumber = new Map(
      comments.map(comment => [getCommentNumber(comment), comment] as const).filter(([number]) => number),
    );

    const commentsByAuthor = new Map<string, Element[]>();
    comments.forEach(comment => {
      const authorName = getCommentAuthorName(comment);
      if (!authorName) {
        return;
      }
      commentsByAuthor.set(authorName, [...(commentsByAuthor.get(authorName) || []), comment]);
    });

    const plans = comments
      .slice()
      .reverse()
      .map(currentComment => ({
        currentComment,
        mentionedComments: getMentionedComments(currentComment, commentByNumber, commentsByAuthor),
      }))
      .filter(({ mentionedComments }) => mentionedComments.length > 0);

    plans.forEach(({ currentComment, mentionedComments }) => {
      const [primaryComment] = mentionedComments;
      if (!primaryComment) {
        return;
      }

      primaryComment.querySelector(":scope > table")?.insertAdjacentElement("afterend", currentComment);
      currentComment.setAttribute("data-is-embedded", "true");
    });

    plans.forEach(({ currentComment, mentionedComments }) => {
      const [, ...referenceComments] = mentionedComments;
      referenceComments.forEach(referencedComment => addReferenceHint(referencedComment, currentComment));
    });
  }

  function getCommentAuthorName(comment: Element) {
    return comment.querySelector(":scope > table strong a.dark[href^='/member/']")?.getAttribute("href")?.split("/")[2] || "";
  }

  function getOwnReplyContent(comment: Element) {
    return comment.querySelector(":scope > table .reply_content");
  }

  function getMentionedComments(
    currentComment: Element,
    commentByNumber: Map<string, Element>,
    commentsByAuthor: Map<string, Element[]>,
  ) {
    const currentCommentNumber = parseInt(getCommentNumber(currentComment), 10);
    const replyContent = getOwnReplyContent(currentComment);
    if (!replyContent) {
      return [];
    }

    const seenComments = new Set<Element>();
    const mentionedComments: Element[] = [];
    const mentions = Array.from(replyContent.querySelectorAll("a[href^='/member/']"));

    mentions.forEach(mention => {
      const mentionedPeopleName =
        mention.getAttribute("href")?.split("/")[2] || (mention.textContent || "").replace(/^@/, "");
      let mentionedComment = getExplicitMentionedComment(mention, commentByNumber);
      if (!mentionedComment) {
        mentionedComment = getLastCommentByAuthorBeforeNumberFromSnapshot(
          commentsByAuthor.get(mentionedPeopleName) || [],
          currentCommentNumber,
        );
      }
      if (!mentionedComment || mentionedComment === currentComment || seenComments.has(mentionedComment)) {
        return;
      }
      seenComments.add(mentionedComment);
      mentionedComments.push(mentionedComment);
    });

    return mentionedComments;
  }

  function getLastCommentByAuthorBeforeNumberFromSnapshot(authorComments: Element[], num: number) {
    return authorComments
      .filter(comment => {
        const commentNumber = parseInt(getCommentNumber(comment), 10);
        return commentNumber < num;
      })
      .at(-1) || null;
  }

  function getExplicitMentionedComment(mention: Element, commentByNumber: Map<string, Element>) {
    const numberMatch = /\#(\d+)/.exec(getTextUntilNextMemberMention(mention));
    if (!numberMatch) {
      return null;
    }

    return commentByNumber.get(numberMatch[1]) || null;
  }

  function getTextUntilNextMemberMention(mention: Element) {
    let text = "";
    let node = mention.nextSibling;

    while (node) {
      if (node.nodeType === 1) {
        const element = node as Element;
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

  function addReferenceHint(referencedComment: Element, comment: Element) {
    const commentNumber = getCommentNumber(comment);
    const referencedCommentNumber = getCommentNumber(referencedComment);
    const host = getReferenceHintHost(referencedComment);
    const container = getReferenceHintContainer(host);
    const button = runtime.document.createElement("button");
    button.type = "button";
    button.className = "gm-reference-hint";
    button.textContent = `↪ #${commentNumber} 也回复了 #${referencedCommentNumber}`;
    button.addEventListener("click", () => showReferenceDialog(comment));
    container.appendChild(button);
  }

  function getReferenceHintHost(referencedComment: Element) {
    return referencedComment;
  }

  function getReferenceHintContainer(host: Element) {
    const existing = host.querySelector(":scope > .gm-reference-hints");
    if (existing) {
      return existing;
    }

    const container = runtime.document.createElement("div");
    container.className = "gm-reference-hints";
    host.querySelector(":scope > table")?.insertAdjacentElement("afterend", container);
    return container;
  }

  function showReferenceDialog(comment: Element) {
    $(".gm-reference-dialog")?.remove();

    const dialog = runtime.document.createElement("div");
    dialog.className = "gm-reference-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const panel = runtime.document.createElement("div");
    panel.className = "gm-reference-dialog-panel";

    const header = runtime.document.createElement("div");
    header.className = "gm-reference-dialog-header";
    header.textContent = `引用回复 #${getCommentNumber(comment)}`;

    const closeButton = runtime.document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "gm-reference-dialog-close";
    closeButton.textContent = "关闭";

    const content = runtime.document.createElement("div");
    content.className = "gm-reference-dialog-content";
    const clonedComment = comment.cloneNode(true) as Element;
    clonedComment.removeAttribute("id");
    clonedComment.querySelectorAll("[id]").forEach(it => it.removeAttribute("id"));
    clonedComment.querySelectorAll(".gm, .gm-reference-hint").forEach(it => it.remove());
    content.appendChild(clonedComment);

    const close = () => {
      runtime.document.removeEventListener("keydown", onKeydown);
      dialog.remove();
    };
    const onKeydown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        close();
      }
    };

    closeButton.addEventListener("click", close);
    dialog.addEventListener("click", evt => {
      if (evt.target === dialog) {
        close();
      }
    });
    runtime.document.addEventListener("keydown", onKeydown);

    header.appendChild(closeButton);
    panel.append(header, content);
    dialog.appendChild(panel);
    runtime.document.body.appendChild(dialog);
  }

  let domParser: DOMParser | null = null;
  let commentsOfPages: NodeListOf<Element>[] = [];

  function getCommentElementsFromHtmlString(htmlString: string) {
    if (!domParser) {
      domParser = new runtime.DOMParser();
    }
    const dom = domParser.parseFromString(htmlString, "text/html");
    return dom.querySelectorAll("#Main > .box > .cell[id]");
  }

  function tryDisplayAllComments() {
    const isAllPagesLoaded = commentsOfPages.reduce((prev, curr) => prev && curr.length > 0, true);
    if (!isAllPagesLoaded) {
      return;
    }

    const fragment = runtime.document.createDocumentFragment();
    commentsOfPages.forEach(pageComments => {
      pageComments.forEach(it => fragment.appendChild(it));
    });

    const commentBox = $("#Main > .box:nth-child(n+3)");
    const countsElement = commentBox?.querySelector(".cell");
    if (!commentBox || !countsElement) {
      return;
    }

    commentBox.prepend(fragment);
    commentBox.prepend(countsElement);
    enhanceThreadPage();
  }

  function loadCommentsByPage(page: number) {
    const url = `${runtime.location.origin}${runtime.location.pathname}?p=${page}`;
    runtime.request({
      url,
      method: "GET",
      timeout: 30000,
      onload(response) {
        commentsOfPages[page - 1] = getCommentElementsFromHtmlString(response.responseText);
        tryDisplayAllComments();
      },
    });
  }

  function start() {
    const isReadingTopic = runtime.location.href.indexOf("www.v2ex.com/t/") > 0;
    const pages = $$(".page_normal")
      .map(it => parseInt(it.textContent || "", 10))
      .filter(() => isReadingTopic)
      .filter(it => it <= 10)
      .filter((x, i, a) => a.indexOf(x) === i);
    commentsOfPages = pages.map(() => runtime.document.querySelectorAll("__empty__"));
    pages.forEach(it => loadCommentsByPage(it));

    if (!pages.length) {
      enhanceThreadPage();
    }

    runtime.addStyle(`
      .cell[id] > .cell[id] {
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
        opacity: .5;
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
        background: rgba(0, 0, 0, .36);
      }
      .gm-reference-dialog-panel {
        box-sizing: border-box;
        width: min(780px, 100%);
        max-height: min(720px, 90vh);
        overflow: auto;
        border-radius: 8px;
        background: white;
        box-shadow: 0 12px 48px rgba(0, 0, 0, .24);
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
    `);
  }

  return {
    addTargetToTopicLinks,
    embedDiscussions,
    getCommentElementsFromHtmlString,
    highlightCommentsAndTopics,
    likeDislikeAuthor,
    reorderCommentsByHearts,
    start,
  };
}

export function parseAuthorMap(value: string | null): AuthorMap {
  if (!value) {
    return new Map();
  }
  return new Map(JSON.parse(value));
}

export function getAuthorRecord(map: AuthorMap, id: string): AuthorRecord | null {
  const value = map.get(id);
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return { url: value };
  }
  return value;
}

export function getAuthorLabel(map: AuthorMap, id: string, fallbackLabel: string): string {
  return getAuthorRecord(map, id)?.label || fallbackLabel;
}

export function getTagMarkup(text: string, color: string): string {
  return ` <font color="${color}">[${text}]</font>`;
}

export function htmlToElement<T extends Element = Element>(document: Document, html: string): T {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstChild as T;
}
