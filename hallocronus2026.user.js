// ==UserScript==
// @name         HALLOWEEN2026
// @version      4.0
// @description  Loader pobierający najnowszą wersję skryptu
// @match        https://cronus.margonem.com/*
// @grant        GM_xmlhttpRequest
// @connect      rzabboard.cytr.us
// @connect      gist.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    // Usunięto hash commita, dodano buster cache'u (Date.now()), aby zawsze pobierało najnowszą edycję
    const url = "https://gist.githubusercontent.com/Ropuch1/087c23a875ef6636b5c220518550cf75/raw/halloween2026.js?t=" + Date.now();

    GM_xmlhttpRequest({
        method: "GET",
        url: url,
        onload: function(response) {
            if (response.status === 200) {
                try {
                    eval(response.responseText);
                } catch (e) {
                    console.error("Błąd podczas uruchamiania głównego skryptu HALLOWEEN2026:", e);
                }
            } else {
                console.error("HALLOWEEN2026: Nie udało się pobrać aktualizacji (Błąd: " + response.status + ")");
            }
        }
    });
})();
