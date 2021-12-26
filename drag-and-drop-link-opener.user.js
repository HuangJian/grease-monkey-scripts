// ==UserScript==
// @name         link drag&drop handler
// @namespace    https://github.com/HuangJian/grease-monkey-scripts
// @version      0.2
// @description  Drag links to open them in new tab.
// @author       ustc.hj@gmail.com
// @match        *://*/*
// @grant        GM_openInTab
// ==/UserScript==

(async function() {
    'use strict';

    let dragEvent

    function handleDragEvent(evt) {
        dragEvent = evt
    }

    function handleDropEvent(evt) {
        if (!dragEvent) return

        let url = evt.srcElement.getAttribute('href')
        if (!url) return
        if (!/^http*/.test(url)) {
            url = location.origin + url
        }

        // drag to right -> open in a new background tab 
        // drag to left -> open in a new tab and active it
        const isToActiveNewTab = evt.x < dragEvent.x
        GM_openInTab(url, {active: isToActiveNewTab})
        dragEvent = null
    }

    function enableDndHandler() {
        Array.from(document.querySelectorAll('a'))
            .forEach(a => {
                a.setAttribute('draggable', 'true')
                a.addEventListener('dragstart', handleDragEvent)
                a.addEventListener('dragend', handleDropEvent)
            })   
    }

    enableDndHandler()
    // deal with the DOM elements loaded asynchronized
    setTimeout(enableDndHandler, 3000)
})();