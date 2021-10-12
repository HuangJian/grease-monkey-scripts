// ==UserScript==
// @name         A-Dark-Room Robot
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      0.1
// @description  The auto click robot of the A-Dark-Room game!
// @author       ustc.hj@gmail.com
// @match        http://adarkroom.doublespeakgames.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

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

    function clickButtons(btnSelectors, addtionalAction) {
        btnSelectors.map(it => document.querySelector(it))
            .filter(it => !!it)
            .forEach(it => {
                it.click()
                if (addtionalAction) {
                    addtionalAction()
                }
            })
    }

    function work() {
        clickButtons(['gatherButton', 'trapsButton'].map(it => `#${it}:not(.disabled)`))

        ;['build_hut', 'build_trap']
            .map(it => document.querySelector(`#${it}:not(.disabled)`))
            .filter(it => !!it)
            .forEach(btn => {
                const woodNeeded = parseInt(btn.querySelector('.tooltip .row_val').innerText)
                const woodAvailable = parseInt(document.querySelector('#row_wood .row_val').innerText)
                if (woodAvailable >= woodNeeded) {
                    btn.click()
                }
            })
    }

    function handleTradingEvent(desc) {
        if (desc.includes('游牧部落慢吞吞地出现在视野中')) {
            // document.querySelector('#buyScales.button').click() // 鳞片
            // document.querySelector('#buyTeeth.button').click() // 牙齿
            // document.querySelector('#buyBait.button').click() // 诱饵
            document.querySelector('#buyCompass.button').click() // 罗盘
            document.querySelector('#goodbye.button').click()
        }
    }

    function handleBegFursEvent(desc) {
        if (desc.includes('祈求能施舍给他一些多余的毛皮，好让他不在夜里受冻')) {
            const buttons = document.querySelectorAll('#event #exitButtons > .button')
            ;[1, 0, 2].forEach(idx => buttons[idx].click()) // 100 furs -> 50 furs -> deny
        }
    }

    function notify(text) {
        document.querySelector('#notifications')
            .insertAdjacentHTML('beforebegin', `<div class="notification>${text}</div>`)
    }

    function isOutside() {
        return document.querySelector('#outerSlider').style['left'] === '-700px';
    }

    function handleHomeTownEvent(desc) {
        if (isOutside()) return

        const actions = [
            'track', // 咆哮的野兽倒下了.
            'investigate', // 战斗短暂而血腥，但兽群溃退了 | 嘈杂声透墙传来
            'evasion', 'precision', 'force', // 一名年迈的流浪者抵达了
            'mourn', // 火灾已经开始. 一些村民死掉了.
            'wood500', // 一名流浪者推着货车来到村子，声称如果让他带着木头离开，他会带回更多木头
            'fur500', // 一名流浪者推着货车来到村子，声称如果让她带着毛皮离开，她会带回更多毛皮
        ];
        clickButtons(actions.map(it => `#${it}.button`), () => notify(desc))

        ;[
            ['agree', ['他面带和煦的微笑，请求留宿一晚']], // 宗师授艺
            ['nothing', ['他面带和煦的微笑，请求留宿一晚']], // todo: 学完了怎么办？
            ['heal', ['可怕的瘟疫迅速地村子里传播开来']],
            ['bye', ['男子感激涕零']],
            ['end', ['村外不远处躺着一只巨兽，它的皮毛上染满了鲜血', '一群咆哮的野兽冲出丛林', '数分钟后足印消失了', '瘟疫得到了控制',
                     '装备精良的人冲出树林，向人群射击']],
            ['leave', ['流浪者带着满载木头的货车离开了', '流浪者带着满载毛皮的货车离开了', '有些木头不见了']],
        ].forEach(arr => {
            if (arr[1].some(it => desc.includes(it))) {
                notify(desc)
                document.querySelector(`#${arr[0]}.button`).click();
            }
        })
    }

    function handleEvents() {
        const desc = document.querySelector('#event #description')?.innerText
        if (desc) {
            handleHomeTownEvent(desc)
            handleTradingEvent(desc)
            handleBegFursEvent(desc)
        }
    }

    function updateStoreIncrements() {
        Array.from(document.querySelectorAll('#stores .storeRow'))
            .forEach(store => {
                let incrementNumber = 0;

                const increment = store.querySelector('.tooltip .total.row_val')
                if (increment) {
                    incrementNumber = parseFloat(increment.innerText.trim())
                }

                const klass = incrementNumber > 0 ? 'increasing' :
                    (incrementNumber < 0 ? 'decreasing' : '');

                let appendElement = store.querySelector('.inc')
                if (!appendElement) {
                    appendElement = htmlToElement(`<span class="inc"><span>`)
                    store.querySelector('.row_key').insertAdjacentElement('afterend', appendElement)
                }

                const flag = incrementNumber > 0 ? '+' : ''
                appendElement.innerText = `(${flag}${incrementNumber})`
                appendElement.setAttribute('class', `inc ${klass}`)
            })
    }

    function fixStoresContainerPosition() {
        const selectedButtonText = document.querySelector('.headerButton.selected')?.innerText || ''
        const isMoveToTop = ['森林', '村落', '喧嚣小镇', '漫漫尘途'].some(it => selectedButtonText.includes(it))
        if (isMoveToTop) {
            document.querySelector('#storesContainer')?.classList.add('top-0')
        } else {
            document.querySelector('#storesContainer')?.classList.remove('top-0')
        }
    }

    function getHealthPoint(selector) {
        const health = /(\d+)\/(\d+)/.exec(document.querySelector(selector)?.innerText)
        if (!health) return null

        return {
            max: parseInt(health[2]),
            current: parseInt(health[1]),
        }
    }

    function autoHeal() {
        const myHp = getHealthPoint('#healthCounter')
        const meats = parseInt(/(\d+)$/.exec(document.querySelector('#supply_cured-meat').innerText)[1]);

        if (myHp.current < 10) {
            clickButtons(['#meds', '#eat'])
        }
        if (myHp.current < myHp.max - 12 && meats > 5) {
            clickButtons(['#eat'])
        }
    }

    let isBolasUsed = false
    function autoAttack() {
        clickButtons(['bayonet', 'steel-sword', 'iron-sword', 'bone-spear'].map(it => `#attack_${it}`))
        
        const enemyHp = getHealthPoint(('#enemy .hp'))
        if (!enemyHp) return

        const myHp = getHealthPoint('#wanderer .hp')
        if (enemyHp.current - myHp.current > 20 && myHp.current < 20 && !isBolasUsed) {
            clickButtons(['#attack_bolas'])
            isBolasUsed = true
        }

        if (enemyHp.max >= 40 && enemyHp.current >= 10) {
            const bullets = parseInt(/(\d+)$/.exec(document.querySelector('#supply_bullets')?.innerText)[1]); 
            if (bullets >= 8) {
                clickButtons(['#attack_rifle'])
            }
        }
        if (myHp.current <= 10) {
            clickButtons(['#attack_rifle'])
        }
    }

    let autoFightTimer = null
    function autoFight() {
        if (!isOutside()) return

        const btnAttack = document.querySelector('#attackButtons')
        if (!btnAttack && autoFightTimer) {
            clearInterval(autoFightTimer)
            autoFightTimer = null
            return
        } else if (btnAttack && !autoFightTimer) {
            autoFightTimer = setInterval(() => {
                autoHeal()
                autoAttack()
            }, 100)
            isBolasUsed = false
        }
    }

    let focusedBtn = null
    function focusButton(btn) {
        if (focusedBtn) {
            focusedBtn.classList.remove('focused')
        }
        btn.classList.add('focused')
        focusedBtn = btn
    }

    function focusFirstButtonIfNotAny() {
        const buttons = Array.from(document.querySelectorAll('#event .button:not(.disabled)'))
        if (buttons.length === 0) {
            focusedBtn = null
            return
        }

        if (!focusedBtn) {
            focusButton(buttons[0])
        }
    }

    function logFightButtons() {
        // if (!isOutside()) return

        // const html = document.querySelector('#attackButtons')?.innerHTML
        // if (html) {
        //     console.log(html)
        // }

        // const html2 = document.querySelector('#fight')?.innerHTML
        // if (html2) {
        //     console.log(html2)
        // }
    }

    setInterval(() => {
        autoFight()
        work()
        updateStoreIncrements()
        handleEvents()
        focusFirstButtonIfNotAny()
        fixStoresContainerPosition()
        logFightButtons()
    }, 1000)


    GM_addStyle ( `
        #outsidePanel {
            width: 460px;
            margin-right: 240px;
        }
        #village {
            margin-top: 340px;
            left: 0;
        }
        #perks {
            left: 280px!important;
            width: 100px!important;
        }
        .top-0 {
            top: 0!important;
        }
        .storeRow:nth-child(2n) {
            background: #eee;
        }
        .inc {
            vertical-align: middle;
        }
        .inc.increasing {
            color: green;
        }
        .inc.decreasing {
            color: red;
        }
        .focused {
            background: lightcyan;
        }
    ` );
})();