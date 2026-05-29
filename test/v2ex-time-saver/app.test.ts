import { beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  createV2exApp,
  defaultLabels,
  getAuthorLabel,
  getAuthorRecord,
  parseAuthorMap,
  shameKeyword,
  thankKeyword,
} from "../../src/v2ex-time-saver/app";
import type { Runtime } from "../../src/v2ex-time-saver/types";

function createDom(html: string, url = "https://www.v2ex.com/t/123"): JSDOM {
  return new JSDOM(html, { url });
}

function createRuntime(dom: JSDOM, values: Record<string, string> = {}): Runtime & { writes: Record<string, string> } {
  const writes: Record<string, string> = {};

  return {
    document: dom.window.document,
    location: dom.window.location,
    DOMParser: dom.window.DOMParser,
    prompt: () => "洞察者",
    getValue: async <T,>(key: string, defaultValue: T) => (key in values ? (values[key] as T) : defaultValue),
    setValue: (key, value) => {
      writes[key] = value;
    },
    request: () => {},
    addStyle: css => {
      const style = dom.window.document.createElement("style");
      style.textContent = css;
      dom.window.document.head.appendChild(style);
    },
    writes,
  };
}

function threadHtml() {
  return `
    <html>
      <head></head>
      <body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">3 replies</div>
            <div class="cell" id="r_1">
              <table><tbody><tr>
                <td><span class="no">1</span></td>
                <td>
                  <strong><a class="dark" href="/member/alice">alice</a></strong>
                  <div class="reply_content">hello</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                  <img alt="❤️"> 2
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td>
                  <strong><a class="dark" href="/member/bob">bob</a></strong>
                  <div class="reply_content"><a href="/member/alice">@alice</a> #1 thanks</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                  <img alt="❤️"> 5
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_3">
              <table><tbody><tr>
                <td><span class="no">3</span></td>
                <td>
                  <strong><a class="dark" href="/member/carol">carol</a></strong>
                  <div class="reply_content">plain</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                  <img alt="❤️"> 1
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
        <a class="topic-link" href="/t/456">topic</a>
      </body>
    </html>
  `;
}

describe("author labels", () => {
  test("supports legacy string records and per-author labels", () => {
    const map = parseAuthorMap(
      JSON.stringify([
        ["legacy", "https://www.v2ex.com/t/1#2"],
        ["labeled", { url: "https://www.v2ex.com/t/2#3", label: "智者" }],
      ]),
    );

    expect(getAuthorRecord(map, "legacy")).toEqual({ url: "https://www.v2ex.com/t/1#2" });
    expect(getAuthorLabel(map, "legacy", defaultLabels.shame)).toBe(defaultLabels.shame);
    expect(getAuthorLabel(map, "labeled", defaultLabels.thank)).toBe("智者");
  });
});

describe("v2ex app unit flows", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = createDom(threadHtml());
  });

  test("highlights stored author labels", async () => {
    const runtime = createRuntime(dom, {
      [shameKeyword]: JSON.stringify([["alice", { url: "https://www.v2ex.com/t/123#1", label: "低质" }]]),
      [thankKeyword]: JSON.stringify([["bob", { url: "https://www.v2ex.com/t/123#2", label: "清醒" }]]),
    });
    const app = await createV2exApp(runtime);

    app.highlightCommentsAndTopics();

    expect(dom.window.document.querySelector('a[href="/member/alice"]')?.innerHTML).toContain("[低质]");
    expect(dom.window.document.querySelector('a[href="/member/bob"]')?.innerHTML).toContain("[清醒]");
    expect(dom.window.document.querySelector('a[href="/member/alice"]')?.closest("td")?.classList.contains("shame")).toBe(true);
    expect(dom.window.document.querySelector('a[href="/member/bob"]')?.closest("tr")?.classList.contains("nice-author")).toBe(true);
  });

  test("stores a prompted label for a disliked author", async () => {
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.likeDislikeAuthor("alice", 1, false);

    expect(JSON.parse(runtime.writes[shameKeyword])).toEqual([
      ["alice", { url: "https://www.v2ex.com/t/123#1", label: "洞察者" }],
    ]);
  });

  test("extracts comments from html strings", async () => {
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    const comments = app.getCommentElementsFromHtmlString(threadHtml());

    expect(comments).toHaveLength(3);
    expect(comments[0].id).toBe("r_1");
  });
});

describe("v2ex app integration", () => {
  test("runs the no-pagination startup flow in jsdom", async () => {
    const dom = createDom(threadHtml());
    const runtime = createRuntime(dom, {
      [shameKeyword]: JSON.stringify([["alice", { url: "https://www.v2ex.com/t/123#1", label: "低质" }]]),
      [thankKeyword]: JSON.stringify([["bob", { url: "https://www.v2ex.com/t/123#2", label: "清醒" }]]),
    });
    const app = await createV2exApp(runtime);

    app.start();

    const commentBoxIds = Array.from(dom.window.document.querySelectorAll("#Main > .box:nth-child(n+3) > .cell[id]")).map(
      it => it.id,
    );
    expect(commentBoxIds).toEqual(["r_1", "r_3"]);
    expect(dom.window.document.querySelector("#r_1 > #r_2")).not.toBeNull();
    expect(dom.window.document.querySelector('a[href="/member/alice"]')?.innerHTML).toContain("[低质]");
    expect(dom.window.document.querySelector(".topic-link")?.getAttribute("target")).toBe("_blank");
    expect(dom.window.document.querySelector("style")?.textContent).toContain(".nice-author");
  });
});
