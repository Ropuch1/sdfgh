// ==UserScript==
// @name         Grzyby Nerthus
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Wysyłanie sprawdzonych map do panelu Nerthus2
// @author       Ty
// @match        https://nerthus.margonem.pl/*
// @connect      rzabboard.cytr.us
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';
    console.log('[Radar] Skrypt uruchomiony pomyślnie!');

    const ENDPOINT_URL = 'https://rzabboard.cytr.us/nerthus2/check_map.php';
    let lastCheckedMap = '';

    setInterval(() => {
        let currentMap = '';
        let currentNick = '';

        if (typeof Engine !== 'undefined' && Engine.map && Engine.map.d && Engine.hero && Engine.hero.d) {
            currentMap = Engine.map.d.name;
            currentNick = Engine.hero.d.nick;
        } else if (typeof map !== 'undefined' && map.name && typeof hero !== 'undefined' && hero.nick) {
            currentMap = map.name;
            currentNick = hero.nick;
        }

        if (currentMap && currentNick && currentMap !== lastCheckedMap) {
            console.log('[Radar] Wykryto nową mapę:', currentMap, 'Wysyłam dla:', currentNick);
            lastCheckedMap = currentMap;

            fetch(ENDPOINT_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: 'map=' + encodeURIComponent(currentMap) + '&nick=' + encodeURIComponent(currentNick)
            })
            .then(r => r.text())
            .then(res => console.log('[Radar] Serwer odpowiedział:', res))
            .catch(e => console.log('[Radar] Błąd wysyłki:', e));
        }
    }, 2000);
})();
