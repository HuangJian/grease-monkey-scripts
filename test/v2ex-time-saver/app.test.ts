import { beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  createV2exApp,
  defaultLabels,
  extractRedeemUrl,
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

function multiMentionThreadHtml() {
  return `
    <html>
      <head></head>
      <body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">4 replies</div>
            <div class="cell" id="r_1">
              <table><tbody><tr>
                <td><span class="no">1</span></td>
                <td>
                  <strong><a class="dark" href="/member/alice">alice</a></strong>
                  <div class="reply_content">first point</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td>
                  <strong><a class="dark" href="/member/carol">carol</a></strong>
                  <div class="reply_content">second point</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_3">
              <table><tbody><tr>
                <td><span class="no">3</span></td>
                <td>
                  <strong><a class="dark" href="/member/dave">dave</a></strong>
                  <div class="reply_content">
                    <a href="/member/alice">@alice</a> #1 and
                    <a href="/member/carol">@carol</a> #2 this is the same reply
                  </div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_4">
              <table><tbody><tr>
                <td><span class="no">4</span></td>
                <td>
                  <strong><a class="dark" href="/member/erin">erin</a></strong>
                  <div class="reply_content">plain</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
      </body>
    </html>
  `;
}

function repeatedAuthorMentionThreadHtml() {
  return `
    <html>
      <head></head>
      <body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">3 replies</div>
            <div class="cell" id="r_9">
              <table><tbody><tr>
                <td><span class="no">9</span></td>
                <td>
                  <strong><a class="dark" href="/member/cctvbnm111X1">cctvbnm111X1</a></strong>
                  <div class="reply_content">first claim</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_10">
              <table><tbody><tr>
                <td><span class="no">10</span></td>
                <td>
                  <strong><a class="dark" href="/member/cctvbnm111X1">cctvbnm111X1</a></strong>
                  <div class="reply_content">second claim</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_37">
              <table><tbody><tr>
                <td><span class="no">37</span></td>
                <td>
                  <strong><a class="dark" href="/member/Yjhenan">Yjhenan</a></strong>
                  <div class="reply_content">
                    @<a href="/member/cctvbnm111X1">cctvbnm111X1</a> #9 <br>
                    @<a href="/member/cctvbnm111X1">cctvbnm111X1</a> #10 <br>
                    你在胡说八道什么呢？
                  </div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
      </body>
    </html>
  `;
}

function nestedReferenceThreadHtml() {
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
                  <div class="reply_content">root point</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td>
                  <strong><a class="dark" href="/member/bob">bob</a></strong>
                  <div class="reply_content">@<a href="/member/alice">alice</a> #1 child reply</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_3">
              <table><tbody><tr>
                <td><span class="no">3</span></td>
                <td>
                  <strong><a class="dark" href="/member/carol">carol</a></strong>
                  <div class="reply_content">
                    @<a href="/member/alice">alice</a> #1 primary
                    @<a href="/member/bob">bob</a> #2 secondary
                  </div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
      </body>
    </html>
  `;
}

function deepNestedReferenceThreadHtml() {
  return `
    <html>
      <head></head>
      <body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">4 replies</div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td>
                  <strong><a class="dark" href="/member/alice">alice</a></strong>
                  <div class="reply_content">root point</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_18">
              <table><tbody><tr>
                <td><span class="no">18</span></td>
                <td>
                  <strong><a class="dark" href="/member/bob">bob</a></strong>
                  <div class="reply_content">another point</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_19">
              <table><tbody><tr>
                <td><span class="no">19</span></td>
                <td>
                  <strong><a class="dark" href="/member/carl">carl</a></strong>
                  <div class="reply_content">@<a href="/member/alice">alice</a> #2 child reply</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_37">
              <table><tbody><tr>
                <td><span class="no">37</span></td>
                <td>
                  <strong><a class="dark" href="/member/dave">dave</a></strong>
                  <div class="reply_content">
                    @<a href="/member/bob">bob</a> #18 primary
                    @<a href="/member/carl">carl</a> #19 secondary
                  </div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
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

  test("preserves original thank handlers when adding label prompts", async () => {
    let topicThankCount = 0;
    let replyThankCount = 0;
    const topicThank = dom.window.document.querySelector<HTMLElement>("#topic_thank");
    const replyThank = dom.window.document.querySelector<HTMLElement>("#r_1 .thank_area > a.thank");
    topicThank!.onmousedown = () => {
      topicThankCount += 1;
    };
    replyThank!.onmousedown = () => {
      replyThankCount += 1;
    };
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.start();
    topicThank!.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    replyThank!.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));

    expect(topicThankCount).toBe(1);
    expect(replyThankCount).toBe(1);
    expect(JSON.parse(runtime.writes[thankKeyword])).toEqual([
      ["topic-author", { url: "https://www.v2ex.com/t/123#0", label: "洞察者" }],
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

  test("uses one primary embedded comment and modal references for extra mentions", async () => {
    dom = createDom(multiMentionThreadHtml());
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.embedDiscussions();

    expect(dom.window.document.querySelectorAll("#r_3")).toHaveLength(1);
    expect(dom.window.document.querySelector("#r_1 > #r_3")).not.toBeNull();
    expect(dom.window.document.querySelector("#r_2 > #r_3")).toBeNull();

    const referenceButton = dom.window.document.querySelector<HTMLButtonElement>("#r_2 .gm-reference-hint");
    expect(referenceButton?.textContent).toContain("#3");

    referenceButton!.click();

    const dialog = dom.window.document.querySelector(".gm-reference-dialog");
    expect(dialog?.textContent).toContain("引用回复 #3");
    expect(dialog?.textContent).toContain("this is the same reply");
    expect(dialog?.querySelectorAll("#r_3")).toHaveLength(0);

    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));

    expect(dom.window.document.querySelector(".gm-reference-dialog")).toBeNull();
    expect(dom.window.document.querySelectorAll("#r_3")).toHaveLength(1);
  });

  test("displays both replying and referenced floors in the modal dialog", async () => {
    dom = createDom(multiMentionThreadHtml());
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.embedDiscussions();

    const referenceButton = dom.window.document.querySelector<HTMLButtonElement>("#r_2 .gm-reference-hint");
    expect(referenceButton).not.toBeNull();

    referenceButton!.click();

    const dialog = dom.window.document.querySelector(".gm-reference-dialog");
    expect(dialog).not.toBeNull();
    
    expect(dialog?.querySelector(".gm-reference-dialog-header")?.textContent).toContain("引用回复 #3");
    
    const cards = dialog?.querySelectorAll(".gm-dialog-card");
    expect(cards).toHaveLength(2);

    const contextCard = cards?.[0];
    expect(contextCard?.querySelector(".gm-dialog-badge")?.textContent).toBe("原回复");
    expect(contextCard?.textContent).toContain("second point");

    const replyCard = cards?.[1];
    expect(replyCard?.querySelector(".gm-dialog-badge")?.textContent).toBe("引用回复");
    expect(replyCard?.textContent).toContain("this is the same reply");

    const connector = dialog?.querySelector(".gm-dialog-connector");
    expect(connector).not.toBeNull();

    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
    expect(dom.window.document.querySelector(".gm-reference-dialog")).toBeNull();
  });


  test("parses repeated real-world author mentions with distinct explicit floors", async () => {
    dom = createDom(repeatedAuthorMentionThreadHtml());
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.embedDiscussions();

    expect(dom.window.document.querySelectorAll("#r_37")).toHaveLength(1);
    expect(dom.window.document.querySelector("#r_9 > #r_37")).not.toBeNull();
    expect(dom.window.document.querySelector("#r_10 > #r_37")).toBeNull();
    expect(dom.window.document.querySelector("#r_10 .gm-reference-hint")?.textContent).toContain("#37");
  });

  test("places reference hints on the referenced comment before its children", async () => {
    dom = createDom(nestedReferenceThreadHtml());
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.embedDiscussions();

    const hint = dom.window.document.querySelector<HTMLButtonElement>("#r_2 > .gm-reference-hints .gm-reference-hint");
    expect(dom.window.document.querySelector("#r_1 > #r_2")).not.toBeNull();
    expect(dom.window.document.querySelector("#r_1 > #r_3")).not.toBeNull();
    expect(dom.window.document.querySelector("#r_1 > .gm-reference-hints .gm-reference-hint")).toBeNull();
    expect(hint?.textContent).toContain("#3");
    expect(hint?.textContent).toContain("#2");
  });

  test("keeps reference hints on the referenced nested comment", async () => {
    dom = createDom(deepNestedReferenceThreadHtml());
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.embedDiscussions();

    expect(dom.window.document.querySelector("#r_2 > #r_19")).not.toBeNull();
    expect(dom.window.document.querySelector("#r_18 > #r_37")).not.toBeNull();
    expect(dom.window.document.querySelector("#r_2 > .gm-reference-hints .gm-reference-hint")).toBeNull();
    const hint = dom.window.document.querySelector<HTMLButtonElement>("#r_19 > .gm-reference-hints .gm-reference-hint");
    expect(hint?.textContent).toContain("#37");
    expect(hint?.textContent).toContain("#19");
  });

  test("collapses sibling replies individually without affecting other sibling replies", async () => {
    const html = `
      <html>
        <body>
          <div id="Main">
            <div class="box"></div>
            <div class="box"></div>
            <div class="box">
              <div class="cell">3 replies</div>
              <div class="cell" id="r_1">
                <table><tbody><tr>
                  <td><span class="no">1</span></td>
                  <td><strong><a class="dark" href="/member/alice">alice</a></strong><div class="reply_content">hello</div></td>
                </tr></tbody></table>
              </div>
              <div class="cell" id="r_2">
                <table><tbody><tr>
                  <td><span class="no">2</span></td>
                  <td><strong><a class="dark" href="/member/bob">bob</a></strong><div class="reply_content"><a href="/member/alice">@alice</a> #1 comment 2</div></td>
                </tr></tbody></table>
              </div>
              <div class="cell" id="r_3">
                <table><tbody><tr>
                  <td><span class="no">3</span></td>
                  <td><strong><a class="dark" href="/member/carol">carol</a></strong><div class="reply_content"><a href="/member/alice">@alice</a> #1 comment 3</div></td>
                </tr></tbody></table>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    dom = createDom(html);
    const runtime = createRuntime(dom);
    const app = await createV2exApp(runtime);

    app.start();

    const r1 = dom.window.document.getElementById("r_1")!;
    const r2 = dom.window.document.getElementById("r_2")!;
    const r3 = dom.window.document.getElementById("r_3")!;

    expect(r1.contains(r2)).toBe(true);
    expect(r1.contains(r3)).toBe(true);

    const r2CollapseBtn = r2.querySelector("button.gm.collapse") as HTMLButtonElement | null;
    const r2ExpandBtn = r2.querySelector("button.gm.expand") as HTMLButtonElement | null;
    const r3CollapseBtn = r3.querySelector("button.gm.collapse") as HTMLButtonElement | null;
    const r3ExpandBtn = r3.querySelector("button.gm.expand") as HTMLButtonElement | null;

    expect(r2CollapseBtn).not.toBeNull();
    expect(r2ExpandBtn).not.toBeNull();
    expect(r3CollapseBtn).not.toBeNull();
    expect(r3ExpandBtn).not.toBeNull();

    expect(r2ExpandBtn?.textContent).toContain("（1）");
    expect(r3ExpandBtn?.textContent).toContain("（1）");

    expect(r2.classList.contains("discussions-collapsed")).toBe(false);
    expect(r3.classList.contains("discussions-collapsed")).toBe(false);

    r2CollapseBtn!.click();

    expect(r2.classList.contains("discussions-collapsed")).toBe(true);
    expect(r3.classList.contains("discussions-collapsed")).toBe(false);
    expect(r1.classList.contains("discussions-collapsed")).toBe(false);
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
  test("loads page 1 comments from DOM and fetches subsequent pages when on page 1", async () => {
    const page1Html = `
      <html><head></head><body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">2 replies</div>
            <div class="cell" id="r_1">
              <table><tbody><tr>
                <td><span class="no">1</span></td>
                <td><strong><a class="dark" href="/member/alice">alice</a></strong>
                  <div class="reply_content">page one comment</div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="cell ps_container">
          <a href="?p=1" class="page_current">1</a>
          <a href="?p=2" class="page_normal">2</a>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
      </body></html>
    `;
    const page2Html = `
      <html><head></head><body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">2 replies</div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td><strong><a class="dark" href="/member/bob">bob</a></strong>
                  <div class="reply_content">page two comment</div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
      </body></html>
    `;

    const dom = createDom(page1Html);
    let page2Callback: ((response: { responseText: string }) => void) | null = null;

    const runtime = {
      ...createRuntime(dom),
      request: ({ onload }: { url: string; method: string; timeout: number; onload: (r: { responseText: string }) => void }) => {
        page2Callback = onload;
      },
    };

    const app = await createV2exApp(runtime);
    app.start();

    // Before page 2 loads, page 1 comments should not yet be rendered (waiting for all pages).
    // Now simulate page 2 finishing.
    page2Callback!({ responseText: page2Html });

    const ids = Array.from(dom.window.document.querySelectorAll("#Main > .box:nth-child(n+3) > .cell[id]")).map(el => el.id);
    expect(ids).toContain("r_1");
    expect(ids).toContain("r_2");
  });
});

describe("auto sign-in", () => {
  test("extractRedeemUrl parses the redeem path from mission page HTML", () => {
    const html = `
      <html><body>
        <input type="button" class="super normal button" value="领取 88 铜币"
          onclick="location.href = '/mission/daily/redeem?once=75573';">
      </body></html>
    `;
    expect(extractRedeemUrl(html)).toBe("/mission/daily/redeem?once=75573");
  });

  test("extractRedeemUrl returns null when the redeem button is absent", () => {
    expect(extractRedeemUrl("<html><body><p>Already signed in.</p></body></html>")).toBeNull();
  });

  test("checkAndDoSignIn fetches mission page then fires redeem request", async () => {
    const homepageHtml = `
      <html><head></head><body>
        <a href="/mission/daily">每日登录</a>
      </body></html>
    `;
    const missionPageHtml = `
      <html><body>
        <input type="button" value="领取 60 铜币"
          onclick="location.href = '/mission/daily/redeem?once=99999';">
      </body></html>
    `;

    const dom = createDom(homepageHtml, "https://www.v2ex.com/");
    const requests: string[] = [];
    let missionOnload: ((r: { responseText: string }) => void) | null = null;
    let redeemOnload: ((r: { responseText: string }) => void) | null = null;

    const runtime = {
      ...createRuntime(dom),
      request: ({ url, onload }: { url: string; method: string; timeout: number; onload: (r: { responseText: string }) => void }) => {
        requests.push(url);
        if (url.includes("/mission/daily") && !url.includes("redeem")) {
          missionOnload = onload;
        } else if (url.includes("redeem")) {
          redeemOnload = onload;
        }
      },
    };

    const app = await createV2exApp(runtime);
    app.start();

    // Should have fetched the mission page.
    expect(requests).toContain("https://www.v2ex.com/mission/daily");

    // Simulate the mission page response.
    missionOnload!({ responseText: missionPageHtml });

    // Should now have fired the redeem request.
    expect(requests).toContain("https://www.v2ex.com/mission/daily/redeem?once=99999");
    expect(redeemOnload).not.toBeNull();
  });

  test("checkAndDoSignIn does nothing when mission link is absent", async () => {
    const dom = createDom("<html><head></head><body><p>no sign-in prompt</p></body></html>", "https://www.v2ex.com/");
    const requests: string[] = [];
    const runtime = {
      ...createRuntime(dom),
      request: ({ url }: { url: string; method: string; timeout: number; onload: (r: { responseText: string }) => void }) => {
        requests.push(url);
      },
    };

    const app = await createV2exApp(runtime);
    app.start();

    expect(requests.some(u => u.includes("mission"))).toBe(false);
  });
});
