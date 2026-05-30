import { beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  embedDiscussions,
  getCommentAuthorName,
  getCommentHearts,
  getCommentNumber,
  getLastCommentByAuthorBeforeNumber,
  getTextUntilNextMemberMention,
} from '../../src/v2ex-time-saver/discussion-embedder'
import type { Runtime } from '../../src/v2ex-time-saver/types'
import { createDom, createRuntime } from './helpers'

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
  `
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
  `
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
  `
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
  `
}

function heartsPriorityThreadHtml() {
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
                  <div class="reply_content">alice point</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td>
                  <strong><a class="dark" href="/member/bob">bob</a></strong>
                  <div class="reply_content">bob point</div>
                  <div class="thank_area">
                    <img alt="❤️"><span>10</span>
                    <a class="thank">感谢回复者</a>
                  </div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_3">
              <table><tbody><tr>
                <td><span class="no">3</span></td>
                <td>
                  <strong><a class="dark" href="/member/carol">carol</a></strong>
                  <div class="reply_content">carol point</div>
                  <div class="thank_area">
                    <img alt="❤️"><span>5</span>
                    <a class="thank">感谢回复者</a>
                  </div>
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_4">
              <table><tbody><tr>
                <td><span class="no">4</span></td>
                <td>
                  <strong><a class="dark" href="/member/dave">dave</a></strong>
                  <div class="reply_content">
                    @<a href="/member/alice">alice</a> #1 and
                    @<a href="/member/bob">bob</a> #2 and
                    @<a href="/member/carol">carol</a> #3
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
  `
}

describe('discussion embedder', () => {
  let dom: JSDOM
  let runtime: Runtime

  beforeEach(() => {
    dom = createDom(multiMentionThreadHtml())
    runtime = createRuntime(dom)
  })

  test('uses one primary embedded comment and modal references for extra mentions', async () => {
    embedDiscussions(runtime)

    expect(dom.window.document.querySelectorAll('#r_3')).toHaveLength(1)
    expect(dom.window.document.querySelector('#r_1 > #r_3')).not.toBeNull()
    expect(dom.window.document.querySelector('#r_2 > #r_3')).toBeNull()

    const referenceButton =
      dom.window.document.querySelector<HTMLButtonElement>('#r_2 .gm-reference-hint')
    expect(referenceButton?.textContent).toContain('#3')

    referenceButton!.click()

    const dialog = dom.window.document.querySelector('.gm-reference-dialog')
    expect(dialog?.textContent).toContain('引用回复 #3')
    expect(dialog?.textContent).toContain('this is the same reply')
    expect(dialog?.querySelectorAll('#r_3')).toHaveLength(0)

    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))

    expect(dom.window.document.querySelector('.gm-reference-dialog')).toBeNull()
    expect(dom.window.document.querySelectorAll('#r_3')).toHaveLength(1)
  })

  test('displays both replying and referenced floors in the modal dialog', async () => {
    dom = createDom(multiMentionThreadHtml())
    runtime = createRuntime(dom)

    embedDiscussions(runtime)

    const referenceButton =
      dom.window.document.querySelector<HTMLButtonElement>('#r_2 .gm-reference-hint')
    expect(referenceButton).not.toBeNull()

    referenceButton!.click()

    const dialog = dom.window.document.querySelector('.gm-reference-dialog')
    expect(dialog).not.toBeNull()

    expect(dialog?.querySelector('.gm-reference-dialog-header')?.textContent).toContain(
      '引用回复 #3',
    )

    const cards = dialog?.querySelectorAll('.gm-dialog-card')
    expect(cards).toHaveLength(2)

    const contextCard = cards?.[0]
    expect(contextCard?.querySelector('.gm-dialog-badge')?.textContent).toBe('原回复')
    expect(contextCard?.textContent).toContain('second point')

    const replyCard = cards?.[1]
    expect(replyCard?.querySelector('.gm-dialog-badge')?.textContent).toBe('引用回复')
    expect(replyCard?.textContent).toContain('this is the same reply')

    const connector = dialog?.querySelector('.gm-dialog-connector')
    expect(connector).not.toBeNull()

    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dom.window.document.querySelector('.gm-reference-dialog')).toBeNull()
  })

  test('parses repeated real-world author mentions with distinct explicit floors', async () => {
    dom = createDom(repeatedAuthorMentionThreadHtml())
    runtime = createRuntime(dom)

    embedDiscussions(runtime)

    expect(dom.window.document.querySelectorAll('#r_37')).toHaveLength(1)
    expect(dom.window.document.querySelector('#r_9 > #r_37')).not.toBeNull()
    expect(dom.window.document.querySelector('#r_10 > #r_37')).toBeNull()
    expect(dom.window.document.querySelector('#r_10 .gm-reference-hint')?.textContent).toContain(
      '#37',
    )
  })

  test('places reference hints on the referenced comment before its children', async () => {
    dom = createDom(nestedReferenceThreadHtml())
    runtime = createRuntime(dom)

    embedDiscussions(runtime)

    const hint = dom.window.document.querySelector<HTMLButtonElement>(
      '#r_2 > .gm-reference-hints .gm-reference-hint',
    )
    expect(dom.window.document.querySelector('#r_1 > #r_2')).not.toBeNull()
    expect(dom.window.document.querySelector('#r_1 > #r_3')).not.toBeNull()
    expect(
      dom.window.document.querySelector('#r_1 > .gm-reference-hints .gm-reference-hint'),
    ).toBeNull()
    expect(hint?.textContent).toContain('#3')
    expect(hint?.textContent).toContain('#2')
  })

  test('keeps reference hints on the referenced nested comment', async () => {
    dom = createDom(deepNestedReferenceThreadHtml())
    runtime = createRuntime(dom)

    embedDiscussions(runtime)

    expect(dom.window.document.querySelector('#r_2 > #r_19')).not.toBeNull()
    expect(dom.window.document.querySelector('#r_18 > #r_37')).not.toBeNull()
    expect(
      dom.window.document.querySelector('#r_2 > .gm-reference-hints .gm-reference-hint'),
    ).toBeNull()
    const hint = dom.window.document.querySelector<HTMLButtonElement>(
      '#r_19 > .gm-reference-hints .gm-reference-hint',
    )
    expect(hint?.textContent).toContain('#37')
    expect(hint?.textContent).toContain('#19')
  })

  test('embeds under the most-hearted comment when multiple floors are mentioned', async () => {
    dom = createDom(heartsPriorityThreadHtml())
    runtime = createRuntime(dom)

    embedDiscussions(runtime)

    expect(dom.window.document.querySelectorAll('#r_4')).toHaveLength(1)
    expect(dom.window.document.querySelector('#r_2 > #r_4')).not.toBeNull()
    expect(dom.window.document.querySelector('#r_1 > #r_4')).toBeNull()
    expect(dom.window.document.querySelector('#r_3 > #r_4')).toBeNull()

    const hintOnAlice = dom.window.document.querySelector('#r_1 .gm-reference-hint')
    expect(hintOnAlice?.textContent).toContain('#4')
    expect(hintOnAlice?.textContent).toContain('#1')

    const hintOnCarol = dom.window.document.querySelector('#r_3 .gm-reference-hint')
    expect(hintOnCarol?.textContent).toContain('#4')
    expect(hintOnCarol?.textContent).toContain('#3')
  })
})

describe('discussion embedder helpers', () => {
  test('getCommentNumber extracts number from comment', () => {
    const dom = createDom(`<div class="cell" id="r_1"><span class="no">42</span></div>`)
    const comment = dom.window.document.querySelector('.cell')!

    expect(getCommentNumber(comment)).toBe('42')
  })

  test('getCommentAuthorName extracts author from comment', () => {
    const dom = createDom(
      `<div class="cell" id="r_1"><table><tbody><tr><td><strong><a class="dark" href="/member/testuser">testuser</a></strong></td></tr></tbody></table></div>`,
    )
    const comment = dom.window.document.querySelector('.cell')!

    expect(getCommentAuthorName(comment)).toBe('testuser')
  })

  test('getLastCommentByAuthorBeforeNumber returns last comment before number', () => {
    const dom = createDom(`
      <div id="r_1"><span class="no">1</span></div>
      <div id="r_2"><span class="no">2</span></div>
      <div id="r_3"><span class="no">3</span></div>
    `)
    const comments = Array.from(dom.window.document.querySelectorAll('#r_1, #r_2, #r_3'))

    const result = getLastCommentByAuthorBeforeNumber(comments, 3)
    expect(result?.id).toBe('r_2')
  })

  test('getTextUntilNextMemberMention extracts text until next mention', () => {
    const dom = createDom(`
      <a class="mention" href="/member/alice">@alice</a>some text<a class="mention" href="/member/bob">@bob</a>
    `)
    const mention = dom.window.document.querySelector('.mention')!

    expect(getTextUntilNextMemberMention(mention)).toBe('some text')
  })

  test('getCommentHearts sums heart counts from emoji spans', () => {
    const dom = createDom(`
      <div class="cell" id="r_1">
        <img alt="❤️"><span>3</span>
        <img alt="❤️"><span>7</span>
      </div>
    `)
    const comment = dom.window.document.querySelector('.cell')!
    expect(getCommentHearts(comment)).toBe(10)
  })

  test('getCommentHearts returns 0 when no hearts present', () => {
    const dom = createDom(`<div class="cell" id="r_1">no hearts</div>`)
    const comment = dom.window.document.querySelector('.cell')!
    expect(getCommentHearts(comment)).toBe(0)
  })
})
