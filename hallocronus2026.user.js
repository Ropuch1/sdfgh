// ==UserScript==
// @name         HALLOWEEN2026
// @version      2.0
// @updateURL    https://github.com/Ropuch1/sdfgh/raw/refs/heads/main/herosi_test_rzabboard.user.js
// @downloadURL  https://github.com/Ropuch1/sdfgh/raw/refs/heads/main/herosi_test_rzabboard.user.js
// @match        https://cronus.margonem.com/*
// @grant        GM_xmlhttpRequest
// @connect      rzabboard.cytr.us
// ==/UserScript==

(function() {
    const API_URL = "https://rzabboard.cytr.us/herosi/save_cronus.php";
    const CONFIG_URL = "https://rzabboard.cytr.us/herosi/data_cronus/config_cronus.json";
    const PANEL_URL = "https://rzabboard.cytr.us/herosi/v2.php";

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
            box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 999999;
            font-weight: bold; font-family: Tahoma, sans-serif;
            transition: opacity 0.5s; pointer-events: none;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = "0"; }, 3500);
        setTimeout(() => { toast.remove(); }, 4000);
    }

    // Stabilny widget oparty w 100% na localStorage (odporny na błędy GM_)
    function createPanelWidget() {
        if (document.getElementById('rzabboard-native-widget')) return;

        let widget = document.createElement('div');
        widget.id = 'rzabboard-native-widget';
        widget.className = "widget-button green widget-in-interface-bar";

        // Pobieramy pozycję z localStorage lub ustawiamy bezpieczną domyślną na górze
        let savedLeft = localStorage.getItem('rzab_widget_left');
        let savedTop = localStorage.getItem('rzab_widget_top');

        // Jeśli zapisały się niepoprawne lub puste wartości, resetujemy do widocznego miejsca
        if (!savedLeft || !savedTop || parseInt(savedLeft) > window.innerWidth || parseInt(savedTop) > window.innerHeight) {
            savedLeft = '150px';
            savedTop = '15px';
            localStorage.setItem('rzab_widget_left', savedLeft);
            localStorage.setItem('rzab_widget_top', savedTop);
        }

        widget.style.cssText = `
            width: 44px !important;
            height: 44px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background-image: linear-gradient(#396b29, #12210d) !important;
            box-shadow: inset 0 0 1px 1px #cecece, inset 0 0 0 3px #0c0d0d !important;
            border: 1px solid #0c0d0d !important;
            border-radius: 4px !important;
            cursor: grab !important;
            z-index: 2147483647 !important;
            position: fixed !important;
            left: ${savedLeft} !important;
            top: ${savedTop} !important;
            opacity: 1 !important;
            visibility: visible !important;
            user-select: none;
        `;
        widget.title = "Otwórz Panel Herosów (Rzabboard) - Przeciągnij, aby poruszyć";

        widget.innerHTML = `
            <div class="icon" style="display: flex; align-items: center; justify-content: center; font-size: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.9)); pointer-events: none;">🐸</div>
        `;

        document.body.appendChild(widget);

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        widget.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;

            let rect = widget.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            widget.style.cursor = "grabbing";

            function onMouseMove(moveEvent) {
                let dx = moveEvent.clientX - startX;
                let dy = moveEvent.clientY - startY;

                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    isDragging = true;
                }

                if (isDragging) {
                    widget.style.left = (initialLeft + dx) + 'px';
                    widget.style.top = (initialTop + dy) + 'px';
                }
            }

            function onMouseUp(upEvent) {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                widget.style.cursor = "grab";

                if (isDragging) {
                    // Zapisujemy pozycję w localStorage przeglądarki
                    localStorage.setItem('rzab_widget_left', widget.style.left);
                    localStorage.setItem('rzab_widget_top', widget.style.top);
                    showCornerNotification("🐸 Zapisano nową pozycję żabki!");
                } else {
                    upEvent.stopPropagation();
                    window.open(PANEL_URL, "_blank");
                }
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    // Strażnik pilnujący widoczności żabki
    setInterval(() => {
        let widget = document.getElementById('rzabboard-native-widget');
        if (!widget || !document.body.contains(widget)) {
            createPanelWidget();
        }
    }, 1000);

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
    setTimeout(createPanelWidget, 1500);

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
