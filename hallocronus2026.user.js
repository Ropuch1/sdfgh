// ==UserScript==
// @name         HALLOWEEN2026
// @version      2.1
// @updateURL    https://github.com/Ropuch1/sdfgh/raw/refs/heads/main/herosi_test_rzabboard.user.js
// @downloadURL  https://github.com/Ropuch1/sdfgh/raw/refs/heads/main/herosi_test_rzabboard.user.js
// @match        https://*.margonem.com/*
// @grant        GM_xmlhttpRequest
// @connect      rzabboard.cytr.us
// ==/UserScript==

(function() {
    const API_URL = "https://rzabboard.cytr.us/herosi/save_cronus.php";
    const CONFIG_URL = "https://rzabboard.cytr.us/herosi/data_cronus/config_cronus.json";
    const HEROES_URL = "https://rzabboard.cytr.us/herosi/data_cronus/heroes_cronus.json";
    const PANEL_URL = "https://rzabboard.cytr.us/herosi/v2.php";

    // Wstrzyknięcie błyskawicznych, niemigotających tooltipów CSS
    const tooltipStyles = document.createElement('style');
    tooltipStyles.innerHTML = `
        .rzab-btn-tooltip {
            position: relative !important;
        }
        .rzab-btn-tooltip::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            margin-left: 10px;
            background: rgba(15, 23, 42, 0.95);
            border-left: 3px solid #10b981;
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-family: Tahoma, sans-serif;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            pointer-events: none; /* Kluczowe: zapobiega migotaniu przy najechaniu z kursorem na sam dymek */
            transition: opacity 0.15s ease-in-out, visibility 0.15s;
            z-index: 2147483647;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        .rzab-btn-tooltip:hover::after {
            opacity: 1;
            visibility: visible;
        }
    `;
    document.head.appendChild(tooltipStyles);

    let heroMaps = {};
    let configData = {};
    let heroesData = {};
    const reportedNpcs = new Set();
    let lastMap = "";
    let lastPingTime = 0;
    let trackedHero = null;

    function showCornerNotification(text, color = "#10b981") {
        let toast = document.createElement("div");
        toast.innerHTML = text;
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: rgba(15, 23, 42, 0.95); color: ${color};
            padding: 12px 20px; border-radius: 8px; border-left: 4px solid ${color};
            box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 999999;
            font-weight: bold; font-family: Tahoma, sans-serif;
            transition: opacity 0.5s; pointer-events: none;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = "0"; }, 3500);
        setTimeout(() => { toast.remove(); }, 4000);
    }

    function formatTimeLeft(sec) {
        if (sec <= 0) return "00:00:00";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function formatAbsolute(ts) {
        if(ts <= 0) return "--";
        let d = new Date(ts * 1000);
        let DD = String(d.getDate()).padStart(2, '0');
        let MM = String(d.getMonth() + 1).padStart(2, '0');
        let YYYY = d.getFullYear();
        let hh = String(d.getHours()).padStart(2, '0');
        let mm = String(d.getMinutes()).padStart(2, '0');
        let ss = String(d.getSeconds()).padStart(2, '0');
        return `${DD}.${MM}.${YYYY} ${hh}:${mm}:${ss}`;
    }

    function timeAgoText(ts, now) {
        if(ts === 0) return "Nigdy";
        let diff = now - ts;
        if(diff < 60) return `${diff}s temu`;
        let m = Math.floor(diff / 60);
        return `${m}m temu`;
    }

    // ================= TOOLTIP SYSTEM =================
    let tooltipEl = document.createElement('div');
    tooltipEl.id = 'rzab-custom-tooltip';
    tooltipEl.className = 'tip-wrapper normal-tip';
    tooltipEl.style.cssText = `
        position: fixed; display: none; z-index: 2147483647;
        pointer-events: none;
    `;
    document.body.appendChild(tooltipEl);

    document.addEventListener('mouseover', e => {
        let row = e.target.closest('.rzab-timer-row');
        if(row) {
            let npc = row.getAttribute('data-npc');
            let conf = configData[npc];
            let info = heroesData[npc] || { last_kill: 0, checked_maps: {} };
            if(!conf) return;

            let now = Math.floor(Date.now() / 1000);
            let wStart = info.last_kill > 0 ? info.last_kill + conf.min : 0;
            let wEnd = info.last_kill > 0 ? info.last_kill + conf.max : 0;

            let hideMaps = localStorage.getItem('rzab_timer_hide_maps') === 'true';
            let hideCovered = localStorage.getItem('rzab_timer_hide_covered') === 'true';

            let widthStyle = hideMaps ? 'min-width: 200px; width: max-content;' : 'min-width: 300px; width: 320px;';
            tooltipEl.style.cssText = `position: fixed; display: block; z-index: 2147483647; pointer-events: none; ${widthStyle}`;

            let html = `<div class="content" style="width: 100%; box-sizing: border-box; text-align: center;">`;
            html += `<span class="elite_timer_tip_name" style="margin-bottom: 8px; display: block; font-size: 14px;">${npc} ${conf.level ? `(${conf.level}lvl)` : ''}</span>`;

            html += `<span class="elite_timer_tip_date" style="margin-top: 5px; display: block;">Respawn Time</span>`;
            html += `<span class="elite_timer_tip_date text-orange">Min: ${formatAbsolute(wStart)}</span>`;
            html += `<span class="elite_timer_tip_date">Max: ${formatAbsolute(wEnd)}</span>`;

            if(!hideMaps) {
                html += `<br>`;
                if(conf.maps && conf.maps.length > 0) {
                    html += `<span class="elite_timer_tip_date" style="margin-top: 5px; display: block; color: #b4b4b4;">Lokalizacje respu${hideCovered ? ' (Wolne/Luki)' : ' (Obstawienie)'}:</span>`;

                    let renderedMapsCount = 0;

                    conf.maps.forEach(m => {
                        if(!m.startsWith('//')) {
                            let mapNameClean = m.replace(/^[-*•\s]+/, '').trim();
                            let checkTs = info.checked_maps[m] ? info.checked_maps[m].ts : 0;
                            let by = info.checked_maps[m] ? info.checked_maps[m].by : '';
                            let diff = checkTs === 0 ? 999999 : (now - checkTs);

                            let dotColor = "#ef4444";
                            let isCovered = false;

                            if(diff <= (conf.colorGreen || 60)) {
                                dotColor = "#10b981";
                                isCovered = true;
                            } else if(diff <= (conf.colorOrange || 300)) {
                                dotColor = "#f59e0b";
                            }

                            // Ukrywamy ZIELONE mapy w dymku, jeśli zębatka jest włączona
                            if (hideCovered && isCovered) return;

                            renderedMapsCount++;
                            let ago = timeAgoText(checkTs, now);
                            let byTxt = by ? `<span style="color:#aaa;">(${by})</span>` : '';

                            html += `
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:11px; margin-top:3px; width:100%;">
                                <div style="display:flex; align-items:center; min-width:0; flex:1;">
                                    <span style="color:${dotColor}; font-size:14px; line-height:10px; margin-right:5px; flex-shrink:0;">•</span>
                                    <span class="elite_timer_tip_map" style="display:inline-block; padding:0; background:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:left !important;" title="${mapNameClean}">${mapNameClean}</span>
                                </div>
                                <div style="color:#888; text-align:right; white-space:nowrap; flex-shrink:0;">${ago} ${byTxt}</div>
                            </div>`;
                        }
                    });

                    if (renderedMapsCount === 0 && hideCovered) {
                        html += `<span class="elite_timer_tip_map" style="text-align:center !important; display:block; color:#10b981; margin-top:5px;">Wszystkie respy obstawione.</span>`;
                    }

                } else {
                    html += `<span class="elite_timer_tip_map" style="text-align:left !important; display:block;">Brak przypisanych map.</span>`;
                }
            }

            html += `</div>`;
            tooltipEl.innerHTML = html;
        }
    });

    document.addEventListener('mousemove', e => {
        if(tooltipEl.style.display === 'block') {
            let x = e.clientX + 15;
            let y = e.clientY + 15;
            if(x + tooltipEl.offsetWidth > window.innerWidth) x = e.clientX - tooltipEl.offsetWidth - 10;
            if(y + tooltipEl.offsetHeight > window.innerHeight) y = e.clientY - tooltipEl.offsetHeight - 10;
            tooltipEl.style.left = x + 'px';
            tooltipEl.style.top = y + 'px';
        }
    });

    document.addEventListener('mouseout', e => {
        if(e.target.closest('.rzab-timer-row')) {
            tooltipEl.style.display = 'none';
        }
    });

    // ================= WIDGET PANELU (ŻABKA) =================
    function createPanelWidget() {
        if (document.getElementById('rzabboard-native-widget')) return;

        let widget = document.createElement('div');
        widget.id = 'rzabboard-native-widget';
        widget.className = "widget-button green widget-in-interface-bar";

        let savedLeft = localStorage.getItem('rzab_widget_left') || '150px';
        let savedTop = localStorage.getItem('rzab_widget_top') || '15px';

        widget.style.cssText = `
            width: 44px !important; height: 44px !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            background-image: linear-gradient(#396b29, #12210d) !important;
            box-shadow: inset 0 0 1px 1px #cecece, inset 0 0 0 3px #0c0d0d !important;
            border: 1px solid #0c0d0d !important; border-radius: 4px !important;
            cursor: grab !important; z-index: 2147483646 !important;
            position: fixed !important; left: ${savedLeft} !important; top: ${savedTop} !important;
            user-select: none;
        `;
        widget.title = "LPM: Otwórz Panel | PPM: Pokaż/Ukryj Timer | 2xLPM: Reset Timera";

        widget.innerHTML = `<div class="icon" style="display: flex; align-items: center; justify-content: center; font-size: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.9)); pointer-events: none;">🐸</div>`;
        document.body.appendChild(widget);

        widget.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            let timer = document.getElementById('rzabboard-event-timer');
            if(timer) {
                let isHidden = timer.style.display === 'none';
                timer.style.display = isHidden ? 'block' : 'none';
                localStorage.setItem('rzab_timer_visible', isHidden ? 'true' : 'false');
                showCornerNotification(`Timer Eventowy został ${isHidden ? 'pokazany' : 'ukryty'}.`);
            }
        });

        widget.addEventListener('dblclick', (e) => {
            e.stopPropagation(); e.preventDefault();
            localStorage.setItem('rzab_timer_left', '200px');
            localStorage.setItem('rzab_timer_top', '80px');
            let timer = document.getElementById('rzabboard-event-timer');
            if (timer) {
                timer.style.left = '200px';
                timer.style.top = '80px';
            }
            showCornerNotification("🐸 Zresetowano pozycję Timera na domyślną!");
        });

        let isDragging = false, startX, startY, initialLeft, initialTop;
        let singleClickTimer = null;

        widget.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = false; startX = e.clientX; startY = e.clientY;
            let rect = widget.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;
            widget.style.cursor = "grabbing";

            function onMouseMove(moveEvent) {
                let dx = moveEvent.clientX - startX; let dy = moveEvent.clientY - startY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true;
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
                    localStorage.setItem('rzab_widget_left', widget.style.left);
                    localStorage.setItem('rzab_widget_top', widget.style.top);
                } else {
                    if (upEvent.detail === 1) {
                        singleClickTimer = setTimeout(() => {
                            window.open(PANEL_URL, "_blank");
                        }, 250);
                    } else if (upEvent.detail === 2) {
                        clearTimeout(singleClickTimer);
                    }
                }
            }
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    // ================= EVENT TIMER WIDGET =================
    function createEventTimer() {
        if (document.getElementById('rzabboard-event-timer')) return;

        let savedLeft = localStorage.getItem('rzab_timer_left') || '200px';
        let savedTop = localStorage.getItem('rzab_timer_top') || '80px';
        let savedWidth = localStorage.getItem('rzab_timer_width') || '340px';
        let isVisible = localStorage.getItem('rzab_timer_visible') !== 'false';

        let timerEl = document.createElement('div');
        timerEl.id = 'rzabboard-event-timer';
        timerEl.className = 'c-window border-window transparent elite-timer';
        timerEl.setAttribute('data-opacity-lvl', '3');
        timerEl.style.cssText = `
            touch-action: none; position: absolute; z-index: 2147483645;
            display: ${isVisible ? 'block' : 'none'};
            left: ${savedLeft}; top: ${savedTop}; width: ${savedWidth}; min-width: 250px; max-width: 600px;
            resize: horizontal; overflow: hidden; height: auto;
            /* Zapewnia, że dymki CSS będą widoczne i nie przycięte przez kontener */
            overflow: visible !important;
        `;

        // Zmodyfikowany blok z przyciskami (dodane rzab-btn-tooltip oraz atrybuty data-tooltip)
        timerEl.innerHTML = `
            <div class="header-label-positioner" style="cursor: grab;">
                <div class="draggable-window-element pointer-draggable-handle"></div>
                <div class="header-label">
                    <div class="left-decor"></div>
                    <div class="right-decor"></div>
                    <div class="text" name="Timer">Event Timer</div>
                </div>
            </div>

            <div class="content" style="padding-bottom: 5px;">
                <div class="inner-content">
                    <div class="window-list elite-timer-wnd">
                        <div class="list npc-list" id="rzabboard-timer-content">
                            <!-- Zawartość generowana dynamicznie -->
                        </div>
                    </div>
                </div>
            </div>
            <div class="c-window__bottom-bar"><div class="interface-element-bottom-bar-background-stretch"></div></div>

            <div class="close-button-corner-decor" style="z-index: 2147483647;">
                <button type="button" class="close-button" id="rzab-timer-close" title="Zamknij (Otwórz ponownie klikając PPM na żabę)"><div class="ie-icon ie-icon-close"></div></button>
            </div>
            <div class="border-image"></div>

            <!-- Przyciski wycentrowane z lewej strony okna -->
            <div class="transparent-window-buttons-menu" style="left: 8px; right: auto; width: auto; pointer-events: auto; z-index: 2147483647; display: flex; align-items: center; gap: 6px; top: 4px; position: absolute;">
                <div class="manage-configuration-button settings-button rzab-btn-tooltip" data-tooltip="Schowaj obstawione" id="rzab-settings-toggle" style="position: relative !important; right: auto !important; top: auto !important; margin: 0 !important; cursor: pointer; display: block !important;"></div>
                <div class="manage-hamburger-button rzab-btn-tooltip" data-tooltip="Zwiń respy" id="rzab-maps-toggle" style="position: relative !important; right: auto !important; top: auto !important; margin: 0 !important; cursor: pointer; display: block !important;">
                    <div class="ie-icon ie-icon-menu" style="position: relative !important; right: auto !important; top: auto !important; margin: 0 !important;"></div>
                </div>
            </div>
        `;

        document.body.appendChild(timerEl);

        let resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                localStorage.setItem('rzab_timer_width', entry.target.style.width);
            }
        });
        resizeObserver.observe(timerEl);

        document.getElementById('rzab-timer-close').addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            timerEl.style.display = 'none';
            localStorage.setItem('rzab_timer_visible', 'false');
        });

        // Ukryj Obstawione Mapy (Zębatka)
        let settingsBtn = document.getElementById('rzab-settings-toggle');
        let hideCovered = localStorage.getItem('rzab_timer_hide_covered') === 'true';
        if(hideCovered && settingsBtn) settingsBtn.style.filter = "sepia(1) hue-rotate(90deg) saturate(3)";

        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            let state = localStorage.getItem('rzab_timer_hide_covered') === 'true';
            localStorage.setItem('rzab_timer_hide_covered', !state);
            settingsBtn.style.filter = !state ? "sepia(1) hue-rotate(90deg) saturate(3)" : "none";
            showCornerNotification(!state ? "⚙️ Ukrywanie obstawionych map w Tooltipie WŁĄCZONE" : "⚙️ Ukrywanie obstawionych map w Tooltipie WYŁĄCZONE", !state ? "#10b981" : "#f59e0b");
        });

        // Krótki Tooltip (Hamburger)
        let mapsBtn = document.getElementById('rzab-maps-toggle');
        let hideMaps = localStorage.getItem('rzab_timer_hide_maps') === 'true';
        if(hideMaps && mapsBtn) mapsBtn.style.filter = "sepia(1) hue-rotate(90deg) saturate(3)";

        mapsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            let state = localStorage.getItem('rzab_timer_hide_maps') === 'true';
            localStorage.setItem('rzab_timer_hide_maps', !state);
            mapsBtn.style.filter = !state ? "sepia(1) hue-rotate(90deg) saturate(3)" : "none";
            showCornerNotification(!state ? "📜 Krótki Tooltip WŁĄCZONY" : "📜 Pełny Tooltip WŁĄCZONY", !state ? "#10b981" : "#f59e0b");
        });

        timerEl.querySelectorAll('#rzab-settings-toggle, #rzab-maps-toggle, #rzab-timer-close').forEach(btn => {
            btn.addEventListener('mousedown', e => e.stopPropagation());
        });

        let header = timerEl.querySelector('.header-label-positioner');
        let isDragging = false, sX, sY, iL, iT;
        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = false; sX = e.clientX; sY = e.clientY;
            let rect = timerEl.getBoundingClientRect();
            iL = rect.left; iT = rect.top;
            header.style.cursor = "grabbing";

            function onMove(mE) {
                let dx = mE.clientX - sX; let dy = mE.clientY - sY;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDragging = true;
                if (isDragging) {
                    timerEl.style.left = (iL + dx) + 'px';
                    timerEl.style.top = (iT + dy) + 'px';
                }
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                header.style.cursor = "grab";
                if (isDragging) {
                    localStorage.setItem('rzab_timer_left', timerEl.style.left);
                    localStorage.setItem('rzab_timer_top', timerEl.style.top);
                }
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // Aktualizacja wierszy w Timerze (BOSSY NIGDY NIE ZNIKAJĄ)
    window.rzabUpdateTimerUI = function() {
        const content = document.getElementById('rzabboard-timer-content');
        if (!content) return;

        const now = Math.floor(Date.now() / 1000);
        let html = '';
        let hasEvents = false;

        let sortedHeroes = [];
        for (const [npc, conf] of Object.entries(configData)) {
            if (conf.isEvent) {
                sortedHeroes.push({ npc, conf, info: heroesData[npc] || { last_kill: 0, checked_maps: {} } });
            }
        }

        sortedHeroes.sort((a, b) => {
            function getScore(c, i) {
                if(i.last_kill === 0) return { g: 3, v: 0 };
                let wS = i.last_kill + c.min; let wE = i.last_kill + c.max;
                if (now > wE) return { g: 1, v: now - wE };
                if (now >= wS && now <= wE) return { g: 2, v: wE - now };
                return { g: 3, v: wS - now };
            }
            let sA = getScore(a.conf, a.info);
            let sB = getScore(b.conf, b.info);
            if (sA.g !== sB.g) return sA.g - sB.g;
            if (sA.g === 1) return sB.v - sA.v;
            return sA.v - sB.v;
        });

        sortedHeroes.forEach(item => {
            const npc = item.npc; const conf = item.conf; const info = item.info;
            const lk = info.last_kill; const wStart = lk + conf.min; const wEnd = lk + conf.max;

            let timeStr = ""; let color = "#ccc"; let status = ""; let mapsStatus = "";

            let totalMaps = 0; let checkedMaps = 0;

            if (conf.maps && conf.maps.length > 0) {
                conf.maps.forEach(m => {
                    if (!m.startsWith('//')) {
                        totalMaps++;
                        let checkTs = (info.checked_maps && info.checked_maps[m]) ? info.checked_maps[m].ts : 0;
                        let diff = checkTs === 0 ? 999999 : (now - checkTs);

                        if (diff <= (conf.colorOrange || 300)) {
                            checkedMaps++;
                        }
                    }
                });
            }

            hasEvents = true;

            if (lk === 0) {
                status = "Brak danych"; color = "#64748b";
            } else if (now < wStart) {
                timeStr = formatTimeLeft(wStart - now);
                status = timeStr; color = "#94a3b8";
            } else if (now <= wEnd) {
                timeStr = formatTimeLeft(wEnd - now);
                status = timeStr; color = "#f59e0b";
                if (totalMaps > 0) {
                    let mColor = checkedMaps === totalMaps ? "#10b981" : (checkedMaps > 0 ? "#fbbf24" : "#ef4444");
                    mapsStatus = `<span style="color:${mColor}; font-size:11px; margin-left:5px;">[${checkedMaps}/${totalMaps}]</span>`;
                }
            } else {
                let overTime = now - wEnd;
                timeStr = "-" + formatTimeLeft(overTime);
                status = timeStr;
                color = "#ef4444";
                if (totalMaps > 0) {
                    let mColor = checkedMaps === totalMaps ? "#10b981" : (checkedMaps > 0 ? "#fbbf24" : "#ef4444");
                    mapsStatus = `<span style="color:${mColor}; font-size:11px; margin-left:5px;">[${checkedMaps}/${totalMaps}]</span>`;
                }
            }

            html += `
                <div class="row tw-list-item do-action-cursor short rzab-timer-row" data-npc="${npc}">
                    <div class="col" style="flex: 1.5; justify-content: flex-start; display: flex; align-items: center; padding-left: 5px;">
                        <div class="name cell" style="text-align: left !important; width: 100%;">
                            <div class="name-val" style="color: ${color}; text-shadow: 1px 1px 0 #000; font-size: 13px; text-align: left !important; width: 100%; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">[E] ${npc}</div>
                        </div>
                    </div>
                    <div class="col">
                        <div class="time cell">
                            <div class="time-val" style="color: ${color}; font-weight: bold; text-shadow: 1px 1px 0 #000; font-size: 13px;">${status} ${mapsStatus}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        if (!hasEvents) {
            html = `<div style="text-align:center; padding:15px; font-size:12px; color:#777;">Brak herosów do wyświetlenia</div>`;
        }
        content.innerHTML = html;
    };

    setInterval(() => {
        let timer = document.getElementById('rzabboard-event-timer');
        if (!timer || !document.body.contains(timer)) createEventTimer();
        window.rzabUpdateTimerUI();
    }, 1000);

    // ================= GŁÓWNA LOGIKA SIECIOWA =================
    function fetchConfigAndData() {
        GM_xmlhttpRequest({
            method: "GET",
            url: CONFIG_URL + "?_t=" + Date.now(),
            onload: function(res) {
                if (res.status === 200) {
                    try {
                        configData = JSON.parse(res.responseText);
                        let newHeroMaps = {};
                        for (let heroName in configData) {
                            configData[heroName].maps.forEach(m => {
                                if(!m.startsWith('//')) newHeroMaps[m] = heroName;
                            });
                        }
                        heroMaps = newHeroMaps;
                    } catch(e) {}
                }
            }
        });

        GM_xmlhttpRequest({
            method: "GET",
            url: HEROES_URL + "?_t=" + Date.now(),
            onload: function(res) {
                if (res.status === 200) {
                    try { heroesData = JSON.parse(res.responseText); } catch(e) {}
                }
            }
        });
    }

    fetchConfigAndData();
    setInterval(fetchConfigAndData, 5000);
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
                    fetchConfigAndData();
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
