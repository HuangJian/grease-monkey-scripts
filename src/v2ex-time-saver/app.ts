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

  function toggleDiscussionVisibility(evt: Event) {
    const clickedButton = (evt.target as Element | null)?.closest("button");
    const comment = clickedButton?.closest(".cell[id]");
    comment?.classList.toggle("discussions-collapsed");
  }

  function addCollapseExpandButtons() {
    $$(".cell[id] > table + .cell[id]").forEach(embedded => {
      const discussionCount = embedded.parentElement?.querySelectorAll(".cell[id]").length || 0;
      [collapseIconSvg, expandIconSvg].forEach(iconStr => {
        const btn = htmlToElement<HTMLButtonElement>(runtime.document, iconStr);
        btn.onclick = toggleDiscussionVisibility;
        const span = btn.querySelector("span");
        if (span) {
          span.innerHTML += `（${discussionCount}）`;
        }
        embedded.insertAdjacentElement("beforebegin", btn);
      });
    });
  }

  function embedDiscussions() {
    const numberPattern = /\#(\d+)/;
    const mentions = $$(".reply_content a").reverse();
    mentions.forEach(mention => {
      const mentionedPeopleName = (mention.textContent || "").replace(/^@/, "");
      const currentComment = mention.closest(".cell[id]");
      const currentCommentNumber = parseInt(currentComment?.querySelector(".no")?.textContent || "", 10);
      const mentionLines = (mention.parentElement?.textContent || "")
        .split("\n")
        .filter(line => line.includes(`@${mentionedPeopleName}`));

      mentionLines.forEach(line => {
        let mentionedComment: Element | null | undefined;
        const numberMatch = numberPattern.exec(line);
        if (numberMatch) {
          mentionedComment = getCommentByNumber(parseInt(numberMatch[1], 10));
        }
        if (!mentionedComment) {
          mentionedComment = getLastCommentByAuthorBeforeNumber(mentionedPeopleName, currentCommentNumber);
        }
        if (!mentionedComment || !currentComment) {
          return;
        }

        const embeddedFlagKey = "data-is-embedded";
        let commentToEmbed = currentComment;
        if (currentComment.getAttribute(embeddedFlagKey) === "true") {
          commentToEmbed = currentComment.cloneNode(true) as Element;
        }
        mentionedComment.querySelector("table")?.insertAdjacentElement("afterend", commentToEmbed);
        currentComment.setAttribute(embeddedFlagKey, "true");
      });
    });
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
        margin-bottom: -24px;
        margin-left: -8px;
        padding: 0;
        border: 0;
        background: transparent;
      }
      .gm.expand {
        display: none;
        color: mediumpurple;
      }
      .gm.collapse {
        display: block;
        color: lightblue;
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
      .cell.discussions-collapsed > .cell {
        display: none;
      }
      .shame {
        opacity: .5;
      }
      .nice-author {
        background: lightcyan;
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
