// ==UserScript==
// @name         HEROSI WERSJA TESTOWA
// @match        *://*.margonem.pl/*
// @match        *://*.margonem.com/*
// @grant        GM_xmlhttpRequest
// @connect      rzabboard.cytr.us
// ==/UserScript==

(function() {
    const API_URL = "https://rzabboard.cytr.us/herosi/save.php";
    const CONFIG_URL = "https://rzabboard.cytr.us/herosi/data/config.json";

    let heroMaps = {};
    const reportedNpcs = new Set();
    let lastMap = "";
    let lastPingTime = 0;
    let trackedHero = null;

    function showCornerNotification(text, color = "#10b981") {
        let toast = document.createElement("div");
        toast.innerHTML = text;
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: rgba(15, 23, 42, 0.9); color: ${color};
            padding: 12px 20px; border-radius: 8px; border-left: 4px solid ${color};
            box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 9999;
            font-weight: bold; font-family: Tahoma, sans-serif;
            transition: opacity 0.5s; pointer-events: none;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = "0"; }, 3500);
        setTimeout(() => { toast.remove(); }, 4000);
    }

    function fetchConfig() {
        GM_xmlhttpRequest({
            method: "GET",
            url: CONFIG_URL + "?_t=" + Date.now(),
            onload: function(res) {
                if (res.status === 200) {
                    try {
                        const config = JSON.parse(res.responseText);
                        let newHeroMaps = {};
                        for (let heroName in config) {
                            config[heroName].maps.forEach(m => {
                                newHeroMaps[m] = heroName;
                            });
                        }
                        heroMaps = newHeroMaps;
                        console.log("[Herosi] Pomyślnie zaktualizowano listę map z serwera.");
                    } catch(e) { console.error("[Herosi] Błąd parsowania configu:", e); }
                }
            }
        });
    }

    fetchConfig();
    setInterval(fetchConfig, 300000);

    function sendHeroData(action, npcName, mapName, heroName) {
        const formData = new URLSearchParams();
        formData.append('action', action);
        formData.append('npc', npcName);
        formData.append('map', mapName);
        formData.append('nick', heroName);

        GM_xmlhttpRequest({
            method: "POST",
            url: API_URL,
            data: formData.toString(),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            onload: function(res) {
                if(action === 'auto_kill' && res.status === 200) {
                    showCornerNotification(`⚔️ Zapisano ubicie: ${npcName}!`);
                }
            }
        });
    }

    setInterval(() => {
        let currentMap = "";
        let currentNick = "";
        let npcs = null;

        if (typeof Engine !== 'undefined' && Engine.map && Engine.hero) {
            currentMap = Engine.map.d.name;
            currentNick = Engine.hero.d.nick;
            if (Engine.npcs) npcs = Engine.npcs.check();
        } else if (typeof map !== 'undefined' && map.name && typeof hero !== 'undefined') {
            currentMap = map.name;
            currentNick = hero.nick;
            if (typeof g !== 'undefined' && g.npc) npcs = g.npc;
        }

        if (!currentMap || !currentNick) return;

        const now = Date.now();
        const expectedHero = heroMaps[currentMap];

        if (currentMap !== lastMap || now - lastPingTime > 5000) {
            lastMap = currentMap;
            lastPingTime = now;
            sendHeroData(expectedHero ? 'camp' : 'online', expectedHero || '', currentMap, currentNick);
        }

        if (expectedHero && npcs) {
            let isTrackedHeroStillHere = false;

            for (const id in npcs) {
                const npc = npcs[id];
                const nick = npc.d && npc.d.nick ? npc.d.nick : (npc.nick || "");
                const type = npc.d && npc.d.wt !== undefined ? npc.d.wt : (npc.wt || 0);

                // Zgodnie z kodem gry: Heros to wt > 79, Kolos/Tytan to wt > 99
                if (nick === expectedHero && type > 79) {

                    if (!reportedNpcs.has(id)) {
                        reportedNpcs.add(id);
                        sendHeroData('found', expectedHero, currentMap, currentNick);
                        console.log(`[Herosi] ZNALEZIONO: ${expectedHero}! Wysłano powiadomienie.`);
                    }

                    if (!trackedHero) {
                        trackedHero = { id: id, name: expectedHero, mapName: currentMap };
                        console.log(`[Herosi] Śledzę: ${expectedHero} (ID: ${id})`);
                    }

                    if (trackedHero && trackedHero.id === id) {
                        isTrackedHeroStillHere = true;
                    }
                }
            }

            if (trackedHero) {
                if (currentMap !== trackedHero.mapName) {
                    trackedHero = null;
                } else if (!isTrackedHeroStillHere) {
                    console.log(`[Herosi] ZNIKNĄŁ: ${trackedHero.name}! Wysyłam reset...`);
                    sendHeroData('auto_kill', trackedHero.name, currentMap, currentNick);
                    reportedNpcs.delete(trackedHero.id);
                    trackedHero = null;
                }
            }
        } else if (trackedHero) {
            trackedHero = null;
        }

    }, 500);
})();
