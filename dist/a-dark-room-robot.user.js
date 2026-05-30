// ==UserScript==
// @name         A-Dark-Room Robot
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      0.1
// @description  The auto click robot of the A-Dark-Room game!
// @author       ustc.hj@gmail.com
// @match        http://adarkroom.doublespeakgames.com/*
// @grant        GM_addStyle
// @run-at       document-start
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

    function $(selector) {
        return document.querySelector(selector)
    }

    function $all(selector) {
        return Array.from(document.querySelectorAll(selector))
    }

    function clickButtons(btnSelectors, addtionalAction) {
        btnSelectors.map(it => $(it))
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

        ;['build_cart', 'build_trap', 'build_hut']
            .map(it => $(`#${it}:not(.disabled)`))
            .filter(it => !!it)
            .forEach(btn => {
                const woodNeeded = parseInt(btn.querySelector('.tooltip .row_val').innerText)
                const woodAvailable = parseInt($('#row_wood .row_val').innerText)
                if (woodAvailable >= woodNeeded) {
                    btn.click()
                }
            })
    }

    function handleTradingEvent(desc) {
        if (desc.includes('游牧部落慢吞吞地出现在视野中')) {
            // $('#buyScales.button').click() // 鳞片
            // $('#buyTeeth.button').click() // 牙齿
            // $('#buyBait.button').click() // 诱饵
            $('#buyCompass.button').click() // 罗盘
            $('#goodbye.button').click()
        }
    }

    function handleBegFursEvent(desc) {
        if (desc.includes('祈求能施舍给他一些多余的毛皮，好让他不在夜里受冻')) {
            const buttons = $all('#event #exitButtons > .button')
            ;[1, 0, 2].forEach(idx => buttons[idx].click()) // 100 furs -> 50 furs -> deny
        }
    }

    function notify(text) {
        $('#notifications')
            .insertAdjacentHTML('beforebegin', `<div class="notification>${text}</div>`)
    }

    function isOutside() {
        return $('#outerSlider')?.style['left'] === '-700px';
    }

    function handleHomeTownEvent(desc) {
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
            ['backinside', ['黑夜重归静谧', '模糊的身影掠过，消失在视野外']],
            ['bye', ['男子感激涕零', '男子表达了他的谢意']],
            ['end', ['村外不远处躺着一只巨兽，它的皮毛上染满了鲜血', '一群咆哮的野兽冲出丛林', '数分钟后足印消失了', '瘟疫得到了控制',
                     '装备精良的人冲出树林，向人群射击']],
            ['leave', ['流浪者带着满载木头的货车离开了', '流浪者带着满载毛皮的货车离开了', '有些木头不见了', '乞丐感激涕零']],
            ['deny', ['一名流浪者推着货车']],
            ['ignore', ['a strange thrumming']],
        ].forEach(arr => {
            if (arr[1].some(it => desc.includes(it))) {
                notify(desc)
                $(`#${arr[0]}.button`).click();
            }
        })
    }

    function handleEvents() {
        const desc = $('#event #description')?.innerText
        if (desc) {
            handleHomeTownEvent(desc)
            handleTradingEvent(desc)
            handleBegFursEvent(desc)
        }
    }

    function updateStoreIncrements() {
        $all('#stores .storeRow').forEach(store => {
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
        const selectedButtonText = $('.headerButton.selected')?.innerText || ''
        const isMoveToTop = ['森林', '村落', '喧嚣小镇', '漫漫尘途'].some(it => selectedButtonText.includes(it))
        if (isMoveToTop) {
            $('#storesContainer')?.classList.add('top-0')
        } else {
            $('#storesContainer')?.classList.remove('top-0')
        }
    }

    function getHealthPoint(selector) {
        const health = /(\d+)\/(\d+)/.exec($(selector)?.innerText)
        if (!health) return null

        return {
            max: parseInt(health[2]),
            current: parseInt(health[1]),
        }
    }

    function autoHeal() {
        const myHp = getHealthPoint('#healthCounter')
        const meats = parseInt(/(\d+)$/.exec($('#supply_cured-meat').innerText)[1]);

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
            const bullets = parseInt(/(\d+)$/.exec($('#supply_bullets')?.innerText)[1]); 
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

        const btnAttack = $('#attackButtons')
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

    function focusFirstButtonIfNotYet() {
        const btn = $('#event .button:not(.disabled)')
        const focusedBtn = $('#event .button.focused')

        if (!btn) {
            focusedBtn?.classList.remove('focused')
            return
        }

        if (!focusedBtn) {
            btn.classList.add('focused')
        }
    }

    function navigateEventButton(offset) {
        const focusedBtn = $('#event .button.focused')
        if (!focusedBtn) return

        const buttons = $all('#event .button')
        buttons.reduce((done, btn, idx) => {
            if (done) return true

            if (btn === focusedBtn) {
                let targetIndex = idx, targetBtn
                do {
                    targetIndex += offset
                    targetBtn = buttons[targetIndex]

                    if (targetBtn && !targetBtn.classList.contains('disabled')) {
                        focusedBtn.classList.remove('focused')
                        targetBtn.classList.add('focused')
                        return true
                    }
                } while(targetBtn)
            }
            return false
        }, false)
    }

    let focusedOutfit = null
    function focusOutfit(element) {
        if (focusedOutfit) {
            focusedOutfit.classList.remove('focused')
        }
        element.classList.add('focused')
        focusedOutfit = element
    }
    
    function isOutfitEditable(outfit) {
        return ['upBtn', 'dnBtn', 'upManyBtn', 'dnManyBtn']
            .some(btnClass => !!outfit.querySelector(`.${btnClass}:not(.disabled)`))
    }

    function focusOnFirstOutfitIfNotYet() {
        if (!$('#location_path.selected') || isOutside()) {
            if (focusedOutfit) {
                focusedOutfit.classList.remove('focused')
                focusedOutfit = null
            }
            return
        }

        if (!focusedOutfit) { // focus on the first editable item
            Array.from(document.querySelectorAll(`#outfitting .outfitRow`)).forEach(outfit => {
                if (focusedOutfit) return

                if (isOutfitEditable(outfit)) {
                    focusOutfit(outfit)
                }
            })
        }
    }

    function logFightButtons() {
        // if (!isOutside()) return

        // const html = $('#attackButtons')?.innerHTML
        // if (html) {
        //     console.log(html)
        // }

        // const html2 = $('#fight')?.innerHTML
        // if (html2) {
        //     console.log(html2)
        // }
    }

    setInterval(() => {
        autoFight()
        work()
        updateStoreIncrements()
        handleEvents()
        focusOnFirstOutfitIfNotYet()
        focusFirstButtonIfNotYet()
        fixStoresContainerPosition()
        logFightButtons()
    }, 1000)

    function navigateOutfit(navigation) {
        if (!focusedOutfit) return
        let otherOutfit = focusedOutfit
        do {
            otherOutfit = navigation(otherOutfit)
            if (otherOutfit && isOutfitEditable(otherOutfit)) {
                focusOutfit(otherOutfit)
                break
            }
        } while(otherOutfit)
    }

    // '" (L)eave"' => 'L'
    function getButtonHotkey(btnElement) {
        const styles = window.getComputedStyle(btnElement, ':after') || []
        const text = styles['content']?.trim()
        return (/\(([a-zA-Z]+)\)/.exec(text) || [])[1]
    }

    function clickEventButtonWithHotkey(evtKey) {
        $all('#event .button:not(.disabled)').reduce((clicked, btn) => {
            if (clicked) return true

            if (getButtonHotkey(btn)?.toLowerCase() === evtKey.toLowerCase()) {
                btn.click()
                return true
            }
            return false
        }, false)
    }

    function moveOnMap(evt) {
        if (!isOutside()) return

        const mappings = {
            's': {key: 'ArrowLeft', which: 37, keyCode: 37},
            'f': {key: 'ArrowRight', which: 39, keyCode: 39},
            'e': {key: 'ArrowUp', which: 38, keyCode: 38},
            'd': {key: 'ArrowDown', which: 40, keyCode: 40},
        }
        ;['keydown', 'keyup'].forEach(keyEvent => 
            document.body.dispatchEvent(new KeyboardEvent(keyEvent, mappings[evt.key])))
    }

    window.addEventListener(
        'keydown',
        evt => {
            const keyActions = [
                [['e'], [() => navigateOutfit(element => element.previousSibling),
                         () => navigateEventButton(-1),
                         () => moveOnMap(evt)]],
                [['s'], [() => navigateOutfit(element => element.previousSibling),
                         () => navigateEventButton(-1),
                         () => moveOnMap(evt)]],
                [['d'], [() => navigateOutfit(element => element.nextSibling),
                         () => navigateEventButton(1),
                         () => moveOnMap(evt)]],
                [['f'], [() => navigateOutfit(element => element.nextSibling),
                         () => navigateEventButton(1),
                         () => moveOnMap(evt)]],
                [[','], [() => focusedOutfit?.querySelector('.dnBtn').click()]],
                [['.'], [() => focusedOutfit?.querySelector('.upBtn').click()]],
                [['<'], [() => focusedOutfit?.querySelector('.dnManyBtn').click()]],
                [['>'], [() => focusedOutfit?.querySelector('.upManyBtn').click()]],
                [['Enter'], [() => { if (focusedOutfit) { $('#embarkButton').click()}}]],
                [[' '], [() => $('#event .button.focused')?.click()]],
                [['['], [() => ($('.headerButton.selected')?.previousSibling || $('.headerButton:last-child')).click()]],
                [[']'], [() => ($('.headerButton.selected')?.nextSibling || $('.headerButton:first-child')).click()]],
                [['l', 'Enter'], [() => clickEventButtonWithHotkey(evt.key)]],
            ];
            keyActions
                .filter(it => it[0].some(key => key === evt.key))
                .forEach(it => it[1].forEach(action => action()))
            
            if (!evt.key.includes('Arrow')) {
                evt.stopPropagation()
            }
            console.log(evt.key, evt.which)
        },
        true // capturing phase - very important
      )

    // disable the default keyup actions for the below keys
    window.addEventListener(
        'keyup',
        evt => { if ('awsdfe'.includes(evt.key)) {evt.stopPropagation()}},
        true // capturing phase - very important
      )

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
        .button::after {
            position relative;
            color: green;
        }
        #embarkButton::after {
            content: " (Enter)";
            color: red;
        }
        #leaveBtn::after,
        #leave::after {
            content: " (L)eave";
        }
        #enter:not(.disabled)::after,
        #continue:not(.disabled)::after,
        #loot_takeEverything:not(.disabled)::after {
            content: " (Enter)";
        }
    ` );
})();