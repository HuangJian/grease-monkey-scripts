// ==UserScript==
// @name         Ga-RSS filter
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      0.2
// @description  Filter the valueless links on https://zhaoolee.com/garss/#/.
// @author       ustc.hj@gmail.com
// @match        https://zhaoolee.com/garss/*
// @grant        GM_addStyle
// ==/UserScript==

(async function() {
    'use strict';

    const valuelessSites = [
        '36kr.com', // no details
        'solidot.org', // no details
        'huxiu.com', // video only
        'chanpin100.com', // 挖坟
    ];

    const niceSites = [
        'geekpark.net', 
        'ifanr.com',
        '199it.com', 
        'dgtle.com',
        'sspai.com',
    ];

    function filterLinks() {
        document.querySelectorAll('div > a').forEach(a => {
            const href = a.getAttribute('href') || ''
            if (valuelessSites.some(it => href.includes(it))) {
                a.classList.add('gm-valueless')
            } else if (niceSites.some(it => href.includes(it))) {
                a.classList.add('gm-nice')
            }

            if (href.includes('m.cnbeta.com/view')) {
                a.setAttribute('href', href.replace('m.cnbeta.com/view/', 'www.cnbeta.com/articles/tech/'))
            }
        })
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
            text-decoration: line-through!important;
        }
        .gm-nice {
            color: orangered!important;
        }
    `)
})();