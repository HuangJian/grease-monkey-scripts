// ==UserScript==
// @name         Ga-RSS filter
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      0.3
// @description  Filter the valueless links on https://zhaoolee.com/garss/#/.
// @author       ustc.hj@gmail.com
// @match        https://zhaoolee.com/garss/*
// @grant        GM_addStyle
// ==/UserScript==

(async function() {
    'use strict'

    const valuelessSites = Object.entries({
        '36kr.com': '36kr', // no details
        'solidot.org': 'solidot', // no details
        'huxiu.com': 'huxiu', // video only
        'chanpin100.com': 'chanpin100', // 挖坟
    })

    const niceSites = Object.entries({
        'geekpark.net': 'geekpark',
        'ifanr.com': 'ifanr',
        '199it.com': '199it',
        'dgtle.com': 'dgtle',
        'sspai.com': 'sspai',
        'mittrchina.com': 'MIT 科技评论',
    })

    function filterLinks() {
        document.querySelectorAll('div > a').forEach(a => {
            const href = a.getAttribute('href') || ''

            handleLink(valuelessSites, 'gm-valueless', a, href) ||
                handleLink(niceSites, 'gm-nice', a, href)

            if (href.includes('m.cnbeta.com/view')) {
                a.setAttribute('href',
                    href.replace('m.cnbeta.com/view/', 'www.cnbeta.com/articles/tech/'))
            }
        })
    }

    function handleLink(conditions, classToAdd, alink, href) {
        for (const [key, value] of conditions) {
            if (href.includes(key)) {
                alink.classList.add(classToAdd)
                // 🌈 ‣ 储能，下一条可以躺赢的万亿级赛道 | 第46篇
                alink.innerHTML = alink.innerHTML.replace('‣', `【${value}】`)
                return true
            }
        }
        return false
    }

    setTimeout(() => {
        filterLinks()

        const header = document.querySelector('#main > h2[id="主要功能"]').nextSibling.nextSibling.nextSibling
        Array.from(document.querySelectorAll('a.gm-nice')).reverse().forEach(a => {
            header.insertAdjacentElement('afterend', a.parentElement)
        })
    }, 5000)

    GM_addStyle ( `
        .gm-valueless {
            opacity: 0.3
        }
        .gm-nice {
            color: orangered!important
        }
    `)
})()
