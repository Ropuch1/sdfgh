// ==UserScript==
// @name         Grzyby Cronus
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Wysyłanie sprawdzonych map na Cronusie (Bypass CORS)
// @author       Ty
// @match        https://cronus.margonem.com/*
// @connect      srv71.mikr.us
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';
    console.log('[Radar Cronus] Uruchomiono skrypt');

    // Link do sprawdzeń map z użyciem HTTPS i odpowiedniego portu
    const ENDPOINT_URL = 'https://srv71.mikr.us:30112/grzyby/check_map.php';
    let lastCheckedMap = '';

    function sendMapCheck(currentMap, currentNick) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: ENDPOINT_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: 'map=' + encodeURIComponent(currentMap) + '&nick=' + encodeURIComponent(currentNick),
            onload: function(response) {
                console.log('[Radar Cronus] Zapisano mapę:', response.responseText);
            },
            onerror: function(err) {
                console.error('[Radar Cronus] Błąd połączenia:', err);
            }
        });
    }

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
            console.log('[Radar Cronus] Wykryto nową mapę:', currentMap, 'Wysyłam dla:', currentNick);
            lastCheckedMap = currentMap;
            sendMapCheck(currentMap, currentNick);
        }
    }, 2000);
})();
