// ==UserScript==
// @name         v2ex time saver
// @namespace    https://github.com/HuangJian/v2ex-time-saver
// @version      0.4
// @description  Save my time when browsing v2ex.com!
// @author       ustc.hj@gmail.com
// @match        https://www.v2ex.com/t/*
// @icon         https://www.v2ex.com/static/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

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

    /**
     * 高亮排序：根据「感谢数」倒序重排评论区。
     * 如果有楼中楼，合计该讨论中所有楼层的「感谢数」后再排序
     */
    function reorderCommentsByHearts() {
        const heartsFlagKey = 'data-hearts';
        const comments = Array.from(document.querySelectorAll('#Main > .box:nth-child(n+3) > .cell[id]'));
        comments.forEach(comment => {
            const hearts = Array.from(comment.querySelectorAll('[alt="❤️"]'))
                .map(it => parseInt(it.nextSibling.textContent))
                .reduce((prev, curr) => prev + curr, 0);
            comment.setAttribute(heartsFlagKey, hearts);
        });

        const countsElement = document.querySelector('#Main > .box:nth-child(n+3) > .cell');
        const heartedComments = comments
            .filter(it => it.getAttribute(heartsFlagKey) !== '0')
            .reverse() // 同样感谢数，保持评论次序
            .sort((a, b) => parseInt(a.getAttribute(heartsFlagKey)) - parseInt(b.getAttribute(heartsFlagKey)))
            .forEach(it => countsElement.insertAdjacentElement('afterend', it));
    }

    /**
     * 高亮显示楼主。
     * 借鉴自 https://greasyfork.org/zh-CN/scripts/397787-v2ex-pro/code
     */
    function highlightAuthor() {
        const authorName = document.querySelector('.header .avatar').getAttribute('alt');
        document.querySelectorAll(`a[href="/member/${authorName}"].dark`).forEach(el => {
            el.innerHTML += " <font color=green>[楼主]</font>";
        });
    }

    /**
     * 优化讨论帖页面的布局和交互。
     */
    function enhanceThreadPage() {
        highlightAuthor();
        embedDiscussions();
        addCollapseExpandButtons();
        reorderCommentsByHearts();
    }

    /**
     * 根据评论编号获取评论的 DOM 节点。
     * @param {number} num 评论编号
     * @returns 评论的 DOM 节点
     */
    function getCommentByNumber(num) {
        return Array.from(document.querySelectorAll('.no'))
            .filter(it => it.innerText.includes(num))[0]
            .closest('.cell[id]');
    }

    /**
     * 获取最左临指点编号的由指定评价者发表的评论的 DOM 节点。
     * @param {string} authorName 评价者 ID
     * @param {number} num 要比较的评论编号
     * @returns 评论的 DOM 节点
     */
    function getLastCommentByAuthorBeforeNumber(authorName, num) {
        return Array.from(document.querySelectorAll(`a[href="/member/${authorName}"].dark`))
            .map(it => it.closest('.cell[id]'))
            .filter(it => {
                const commentNumber = parseInt(it.querySelector('.no').innerText);
                return commentNumber < num; 
            }).reverse().reduce((prev, curr) => prev || curr, null);
    }

    /** 
     * 将 html 字符串转为 DOM 节点：https://stackoverflow.com/a/35385518/474231 。
     * @param {String} HTML representing a single element
     * @return {Element}
     */
    function htmlToElement(html) {
        var template = document.createElement('template');
        template.innerHTML =  html.trim(); // Never return a text node of whitespace as the result
        return template.content.firstChild;
    }

    /**
     * 折叠/展开楼中楼。
     * @param {ClickEvent} evt 按键点击事件
     */
    function toggleDiscussionVisibility(evt) {
        const clickedButton = evt.target.closest('button');
        const comment = clickedButton.closest('.cell[id]');
        comment.classList.toggle('discussions-collapsed');
    }

    /**
     * 给楼中楼添加「折叠/展开」按键。
     */
    function addCollapseExpandButtons() {
        Array.from(document.querySelectorAll('.cell[id] > table + .cell[id]'))
            .forEach(embedded => {
                const discussionCount = embedded.parentElement.querySelectorAll('.cell[id]').length;
                [collapseIconSvg, expandIconSvg].forEach(iconStr => {
                    const btn = htmlToElement(iconStr);
                    btn.onclick = toggleDiscussionVisibility;
                    // 折叠按键显示被折叠的楼层数
                    const span = btn.querySelector('span');
                    if (span) {
                        span.innerHTML += `（${discussionCount}）`;
                    }
                    embedded.insertAdjacentElement('beforebegin', btn);
                });
            });
    }
    /**
     * 根据 @mention 盖楼中楼。
     */
    function embedDiscussions() {
        const numberParttern = /\#(\d+)/;
        const mentions = Array.from(document.querySelectorAll('.reply_content a')).reverse();
        mentions.forEach(mention => {
            const mentionedPeopleName = mention.innerText;

            const currentComment = mention.closest('.cell[id]');
            const currentCommentNumber = parseInt(currentComment.querySelector('.no').innerText);

            const mentionLines = mention.parentElement.innerText.split('\n')
                .filter(line => line.includes(`@${mentionedPeopleName}`));
            mentionLines.forEach(line => {
                let mentiondedComment;
                if (numberParttern.test(line)) {
                    const mentionedCommentNumber = parseInt(numberParttern.exec(line)[1]);
                    mentiondedComment = getCommentByNumber(mentionedCommentNumber);
                }
                // 评论里的「#12345」可能不正确，或者没有标明楼层，找到所@的人最近的评论
                if (!mentiondedComment) {
                    mentiondedComment = getLastCommentByAuthorBeforeNumber(mentionedPeopleName, currentCommentNumber);
                }

                const embeddedFlagKey = 'data-is-embedded';
                let commentToEmbed = currentComment;
                // 如果同时mention多个楼层，复制后分别嵌入
                if (currentComment.getAttribute(embeddedFlagKey) === 'true') {
                    commentToEmbed = currentComment.cloneNode(true);
                }
                mentiondedComment.querySelector('table').insertAdjacentElement('afterend', commentToEmbed);
                currentComment.setAttribute(embeddedFlagKey, 'true');
            });
        });
    }

    let domParser;
    let commentsOfPages;

    /**
     * 从 HTML 页面源代码中获取所有评论的 DOM 节点。
     * @param {string} htmlString HTML页码源代码
     * @returns 该页所有评论的 DOM 节点
     */
    function getCommentElementsFromHtmlString(htmlString) {
        if (!domParser) {
            domParser = new DOMParser();
        }
        const dom = domParser.parseFromString(htmlString, 'text/html');
        return dom.querySelectorAll('#Main > .box > .cell[id]');
    }

    /**
     * 当所有评论页面下载完成后，在当前页显示所有评论。
     */
    function tryDisplayAllComments() {
        const isAllPagesLoaded = commentsOfPages.reduce((prev, curr) => prev && curr.length > 0, true);
        if (!isAllPagesLoaded) {
            return;
        }

        const fragment = document.createDocumentFragment();
        commentsOfPages.forEach(pageComments => {
            pageComments.forEach(it => fragment.appendChild(it));
        });

        const commentBox = document.querySelector('#Main > .box:nth-child(n+3)');
        const countsElement = commentBox.querySelector('.cell');
        commentBox.prepend(fragment);
        commentBox.prepend(countsElement);

        reorderCommentsByHearts();
    }

    /**
     * 加载分页评论。
     * @param {int} page 页码，从 1 开始
     */
    function loadCommentsByPage(page) {
        const url = `${location.origin}${location.pathname}?p=${page}`;
        GM_xmlhttpRequest({
            url: url,
            method: "GET",
            timeout: 30000,
            onload: function (response) {
                commentsOfPages[page - 1] = getCommentElementsFromHtmlString(response.responseText);
                tryDisplayAllComments();
            }
        });
    }

    // 多页自动加载：如果评论超过一页，则自动下载其它页的内容，并在当前页显示
    const pages = Array.from(document.querySelectorAll('.page_normal'))
        .map(it => parseInt(it.innerText))
        .filter(it => it <= 10) // 最多加载前十页，避免产生性能问题
        .filter((x, i, a) => a.indexOf(x) == i); // unique
    commentsOfPages = pages.map(it => []);
    pages.forEach(it => loadCommentsByPage(it));

    // 如果评论不超过一页，直接调整本页布局交互
    if (!pages.length) {
        enhanceThreadPage();
    }

    GM_addStyle ( `
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
    ` );
})();