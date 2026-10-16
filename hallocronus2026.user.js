// ==UserScript==
// @name         HALLOWEEN2026
// @version      2.7
// @updateURL    https://github.com/Ropuch1/sdfgh/raw/refs/heads/main/herosi_test_rzabboard.user.js
// @downloadURL  https://github.com/Ropuch1/sdfgh/raw/refs/heads/main/herosi_test_rzabboard.user.js
// @match        https://cronus.margonem.com/*
// @grant        GM_xmlhttpRequest
// @connect      rzabboard.cytr.us
// ==/UserScript==

(function() {
    const URLS = { api: "https://rzabboard.cytr.us/herosi/save_cronus.php", conf: "https://rzabboard.cytr.us/herosi/data_cronus/config_cronus.json", data: "https://rzabboard.cytr.us/herosi/data_cronus/heroes_cronus.json", panel: "https://rzabboard.cytr.us/herosi/v2.php" };

    document.head.insertAdjacentHTML('beforeend', `<style>.rzab-btn-tooltip{position:relative!important}.rzab-btn-tooltip::after{content:attr(data-tooltip);position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:10px;background:rgba(15,23,42,.95);border-left:3px solid #10b981;color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-family:Tahoma,sans-serif;white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .15s ease-in-out,visibility .15s;z-index:2147483647;box-shadow:0 2px 5px rgba(0,0,0,.5)}.rzab-btn-tooltip:hover::after{opacity:1;visibility:visible}</style>`);

    let heroMaps = {}, configData = {}, heroesData = {}, reportedNpcs = new Set(), lastMap = "", lastPingTime = 0, trackedHero = null;
    let hoveredNpc = null;

    const $ = (id) => document.getElementById(id);
    const lsGet = (k, def) => localStorage.getItem(k) || def;
    const lsSet = (k, v) => localStorage.setItem(k, v);
    const timeAgo = (ts, now) => ts === 0 ? "Nigdy" : (now - ts < 60 ? `${now - ts}s temu` : `${Math.floor((now - ts)/60)}m temu`);
    const fmtTime = (s) => s<=0 ? "00:00:00" : `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor((s%3600)/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
    const fmtAbs = (ts) => ts<=0 ? "--" : new Date(ts*1000).toLocaleString('pl-PL', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(',','');

    function notify(text, color = "#10b981") {
        let t = document.createElement("div");
        t.innerHTML = text;
        t.style.cssText = `position:fixed;bottom:20px;right:20px;background:rgba(15,23,42,0.95);color:${color};padding:12px 20px;border-radius:8px;border-left:4px solid ${color};box-shadow:0 4px 10px rgba(0,0,0,0.5);z-index:999999;font-weight:bold;font-family:Tahoma,sans-serif;transition:opacity 0.5s;pointer-events:none;`;
        document.body.appendChild(t);
        setTimeout(() => t.style.opacity = "0", 3500);
        setTimeout(() => t.remove(), 4000);
    }

    function req(url, method, onload, data = null) {
        GM_xmlhttpRequest({ method, url, data, headers: data ? {"Content-Type": "application/x-www-form-urlencoded"} : undefined, onload });
    }

    // --- TOOLTIP ---
    let tEl = document.createElement('div');
    tEl.id = 'rzab-custom-tooltip';
    tEl.style.cssText = `position:fixed;display:none;z-index:2147483647;pointer-events:none;`;
    tEl.className = 'tip-wrapper normal-tip';
    document.body.appendChild(tEl);

    function renderTooltipContent(npc) {
        let conf = configData[npc];
        if(!conf) return;

        let d = heroesData[npc] || {};
        let info = { last_kill: d.last_kill || 0, checked_maps: d.checked_maps || {} };

        let now = Math.floor(Date.now() / 1000), wS = info.last_kill>0 ? info.last_kill+conf.min : 0, wE = info.last_kill>0 ? info.last_kill+conf.max : 0;
        let hMaps = lsGet('rzab_timer_hide_maps')==='true', hCov = lsGet('rzab_timer_hide_covered')==='true';

        tEl.style.cssText = `position:fixed;display:block;z-index:2147483647;pointer-events:none;min-width:${hMaps?'200px':'300px'};width:${hMaps?'max-content':'320px'};`;

        let html = `<div class="content" style="width:100%;box-sizing:border-box;text-align:center;"><span class="elite_timer_tip_name" style="margin-bottom:8px;display:block;font-size:14px;">${npc} ${conf.level?`(${conf.level}lvl)`:''}</span><span class="elite_timer_tip_date" style="margin-top:5px;display:block;">Respawn Time</span><span class="elite_timer_tip_date text-orange">Min: ${fmtAbs(wS)}</span><span class="elite_timer_tip_date">Max: ${fmtAbs(wE)}</span>`;
        if(!hMaps) {
            html += `<br>`;
            if(conf.maps?.length) {
                html += `<span class="elite_timer_tip_date" style="margin-top:5px;display:block;color:#b4b4b4;">Lokalizacje respu${hCov?' (Wolne/Luki)':' (Obstawienie)'}:</span>`;
                let rCount = 0;
                conf.maps.forEach(m => {
                    if(!m.startsWith('//')) {
                        let mClean = m.replace(/^[-*•\s]+/, '').trim(), cTs = info.checked_maps[m]?.ts || 0, by = info.checked_maps[m]?.by || '', diff = cTs===0?999999:now-cTs;
                        let isCov = diff<=(conf.colorGreen||60), dCol = isCov?"#10b981":(diff<=(conf.colorOrange||300)?"#f59e0b":"#ef4444");
                        if (hCov && isCov) return;
                        rCount++;
                        html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;margin-top:3px;width:100%;"><div style="display:flex;align-items:center;min-width:0;flex:1;"><span style="color:${dCol};font-size:14px;line-height:10px;margin-right:5px;flex-shrink:0;">•</span><span class="elite_timer_tip_map" style="display:inline-block;padding:0;background:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:left!important;" title="${mClean}">${mClean}</span></div><div style="color:#888;text-align:right;white-space:nowrap;flex-shrink:0;">${timeAgo(cTs,now)} ${by?`<span style="color:#aaa;">(${by})</span>`:''}</div></div>`;
                    }
                });
                if(rCount===0 && hCov) html += `<span class="elite_timer_tip_map" style="text-align:center!important;display:block;color:#10b981;margin-top:5px;">Wszystkie respy obstawione.</span>`;
            } else html += `<span class="elite_timer_tip_map" style="text-align:left!important;display:block;">Brak przypisanych map.</span>`;
        }
        tEl.innerHTML = html + `</div>`;
    }

    document.addEventListener('mouseover', e => {
        let row = e.target.closest('.rzab-timer-row');
        if(!row) return;
        let npc = row.dataset.npc;
        if (hoveredNpc !== npc) {
            hoveredNpc = npc;
            renderTooltipContent(hoveredNpc);
        }
    });

    document.addEventListener('mousemove', e => {
        if(hoveredNpc && tEl.style.display === 'block') {
            let x = e.clientX + 15, y = e.clientY + 15;
            tEl.style.left = (x + tEl.offsetWidth > window.innerWidth ? e.clientX - tEl.offsetWidth - 10 : x) + 'px';
            tEl.style.top = (y + tEl.offsetHeight > window.innerHeight ? e.clientY - tEl.offsetHeight - 10 : y) + 'px';
        }
    });

    document.addEventListener('mouseout', e => {
        let row = e.target.closest('.rzab-timer-row');
        if(row) {
            let related = e.relatedTarget;
            if(!row.contains(related)) {
                hoveredNpc = null;
                tEl.style.display = 'none';
            }
        }
    });

    // --- DRAG HELPER ---
    function makeDraggable(el, handle, kL, kT, onDblClick = null, onSingleClick = null) {
        let isDrag = false, sX, sY, iL, iT, clkTimer = null;
        handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            isDrag = false; sX = e.clientX; sY = e.clientY; iL = el.getBoundingClientRect().left; iT = el.getBoundingClientRect().top;
            handle.style.cursor = "grabbing";
            let onMove = me => { let dx=me.clientX-sX, dy=me.clientY-sY; if(Math.abs(dx)>3||Math.abs(dy)>3) isDrag=true; if(isDrag){el.style.left=(iL+dx)+'px';el.style.top=(iT+dy)+'px';} };
            let onUp = ue => {
                document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); handle.style.cursor = "grab";
                if (isDrag) { lsSet(kL, el.style.left); lsSet(kT, el.style.top); }
                else if (ue.detail===1 && onSingleClick) clkTimer = setTimeout(onSingleClick, 250);
                else if (ue.detail===2 && onDblClick) { clearTimeout(clkTimer); onDblClick(); }
            };
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        });
    }

    // --- UI CREATION ---
    function createUI() {
        if (!$('rzabboard-native-widget')) {
            let w = document.createElement('div');
            w.id = 'rzabboard-native-widget'; w.className = "widget-button green widget-in-interface-bar"; w.title = "LPM: Panel | PPM: Timer | 2xLPM: Reset";
            w.style.cssText = `width:44px!important;height:44px!important;display:flex!important;align-items:center!important;justify-content:center!important;background-image:linear-gradient(#396b29,#12210d)!important;box-shadow:inset 0 0 1px 1px #cecece,inset 0 0 0 3px #0c0d0d!important;border:1px solid #0c0d0d!important;border-radius:4px!important;cursor:grab!important;z-index:2147483646!important;position:fixed!important;left:${lsGet('rzab_widget_left','150px')}!important;top:${lsGet('rzab_widget_top','15px')}!important;user-select:none;`;
            w.innerHTML = `<div class="icon" style="display:flex;align-items:center;justify-content:center;font-size:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.9));pointer-events:none;">🐸</div>`;
            document.body.appendChild(w);
            w.addEventListener('contextmenu', e => { e.preventDefault(); let t = $('rzabboard-event-timer'); if(t) { let h = t.style.display==='none'; t.style.display = h?'block':'none'; lsSet('rzab_timer_visible', h); notify(`Timer ${h?'pokazany':'ukryty'}.`); }});
            makeDraggable(w, w, 'rzab_widget_left', 'rzab_widget_top', () => { lsSet('rzab_timer_left','200px'); lsSet('rzab_timer_top','80px'); let t=$('rzabboard-event-timer'); if(t){t.style.left='200px';t.style.top='80px';} notify("🐸 Zresetowano Timer!"); }, () => window.open(URLS.panel, "_blank"));
        }

        if (!$('rzabboard-event-timer')) {
            let t = document.createElement('div');
            t.id = 'rzabboard-event-timer'; t.className = 'c-window border-window transparent elite-timer'; t.setAttribute('data-opacity-lvl', '3');
            t.style.cssText = `touch-action:none;position:absolute;z-index:2147483645;display:${lsGet('rzab_timer_visible','true')!=='false'?'block':'none'};left:${lsGet('rzab_timer_left','200px')};top:${lsGet('rzab_timer_top','80px')};width:${lsGet('rzab_timer_width','340px')};min-width:250px;max-width:600px;resize:horizontal;overflow:visible!important;height:auto;`;
            t.innerHTML = `<div class="header-label-positioner" style="cursor:grab;"><div class="draggable-window-element pointer-draggable-handle"></div><div class="header-label"><div class="left-decor"></div><div class="right-decor"></div><div class="text" name="Timer">Event Timer</div></div></div><div class="content" style="padding-bottom:5px;"><div class="inner-content"><div class="window-list elite-timer-wnd"><div class="list npc-list" id="rzabboard-timer-content"></div></div></div></div><div class="c-window__bottom-bar"><div class="interface-element-bottom-bar-background-stretch"></div></div><div class="close-button-corner-decor" style="z-index:2147483647;"><button type="button" class="close-button" id="rzab-timer-close" title="Zamknij"><div class="ie-icon ie-icon-close"></div></button></div><div class="border-image"></div><div class="transparent-window-buttons-menu" style="left:8px;right:auto;width:auto;pointer-events:auto;z-index:2147483647;display:flex;align-items:center;gap:6px;top:4px;position:absolute;"><div class="manage-configuration-button settings-button rzab-btn-tooltip" data-tooltip="Schowaj obstawione" id="rzab-settings-toggle" style="position:relative!important;right:auto!important;top:auto!important;margin:0!important;cursor:pointer;display:block!important;"></div><div class="manage-hamburger-button rzab-btn-tooltip" data-tooltip="Zwiń respy" id="rzab-maps-toggle" style="position:relative!important;right:auto!important;top:auto!important;margin:0!important;cursor:pointer;display:block!important;"><div class="ie-icon ie-icon-menu" style="position:relative!important;right:auto!important;top:auto!important;margin:0!important;"></div></div></div>`;
            document.body.appendChild(t);
            new ResizeObserver(e => lsSet('rzab_timer_width', e[0].target.style.width)).observe(t);

            $('rzab-timer-close').onclick = (e) => { e.stopPropagation(); t.style.display='none'; lsSet('rzab_timer_visible', 'false'); };

            const setupBtn = (id, key, msgOn, msgOff) => {
                let b = $(id), state = lsGet(key)==='true';
                if(state) b.style.filter = "sepia(1) hue-rotate(90deg) saturate(3)";
                b.onclick = (e) => { e.stopPropagation(); state=!state; lsSet(key, state); b.style.filter = state?"sepia(1) hue-rotate(90deg) saturate(3)":"none"; notify(state?msgOn:msgOff, state?"#10b981":"#f59e0b"); };
                b.onmousedown = e => e.stopPropagation();
            };
            setupBtn('rzab-settings-toggle', 'rzab_timer_hide_covered', "⚙️ Ukrywanie obstawionych WŁĄCZONE", "⚙️ Ukrywanie obstawionych WYŁĄCZONE");
            setupBtn('rzab-maps-toggle', 'rzab_timer_hide_maps', "📜 Krótki Tooltip WŁĄCZONY", "📜 Pełny Tooltip WŁĄCZONY");
            $('rzab-timer-close').onmousedown = e => e.stopPropagation();
            makeDraggable(t, t.querySelector('.header-label-positioner'), 'rzab_timer_left', 'rzab_timer_top');
        }
    }

    // --- LOGIC ---
    window.rzabUpdateTimerUI = function() {
        if (!$('rzabboard-timer-content')) return;
        let now = Math.floor(Date.now()/1000), html = '', arr = [];
        for (const [npc, conf] of Object.entries(configData)) {
            if(conf.isEvent) {
                let d = heroesData[npc] || {};
                arr.push({npc, conf, info: {last_kill: d.last_kill || 0, checked_maps: d.checked_maps || {}}});
            }
        }

        arr.sort((a,b) => {
            let gS = (c,i) => { if(i.last_kill===0) return {g:3,v:0}; let ws=i.last_kill+c.min, we=i.last_kill+c.max; return now>we ? {g:1,v:now-we} : (now>=ws&&now<=we ? {g:2,v:we-now} : {g:3,v:ws-now}); };
            let sA=gS(a.conf,a.info), sB=gS(b.conf,b.info); return sA.g!==sB.g ? sA.g-sB.g : (sA.g===1 ? sB.v-sA.v : sA.v-sB.v);
        }).forEach(i => {
            let lk=i.info.last_kill, wS=lk+i.conf.min, wE=lk+i.conf.max, tMaps=0, cMaps=0, col="#ccc", st="", mst="";
            if(i.conf.maps) i.conf.maps.forEach(m => { if(!m.startsWith('//')){ tMaps++; if((i.info.checked_maps[m]?.ts?now-i.info.checked_maps[m].ts:999999)<=(i.conf.colorOrange||300)) cMaps++; }});
            if(lk===0) { st="Brak danych"; col="#64748b"; }
            else if(now<wS) { st=fmtTime(wS-now); col="#94a3b8"; }
            else {
                st=(now<=wE?"":"-")+fmtTime(Math.abs(wE-now));
                col=now<=wE?"#f59e0b":"#ef4444";
                if(tMaps>0) mst=`<span style="color:${cMaps===tMaps?"#10b981":(cMaps>0?"#fbbf24":"#ef4444")};font-size:11px;margin-left:5px;white-space:nowrap;">[${cMaps}/${tMaps}]</span>`;
            }
            html += `
                <div class="row tw-list-item do-action-cursor short rzab-timer-row" data-npc="${i.npc}" style="display:grid;grid-template-columns:minmax(0, 1fr) auto;align-items:center;padding:0 8px;">
                    <div style="display:flex;align-items:center;min-width:0;overflow:hidden;pointer-events:none;">
                        <div class="name-val" style="color:${col};text-shadow:1px 1px 0 #000;font-size:13px;text-align:left!important;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">[E] ${i.npc}</div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:flex-end;white-space:nowrap;margin-left:8px;pointer-events:none;">
                        <span style="color:${col};font-weight:bold;text-shadow:1px 1px 0 #000;font-size:13px;">${st}</span>
                        ${mst}
                    </div>
                </div>
            `;
        });
        $('rzabboard-timer-content').innerHTML = html || `<div style="text-align:center;padding:15px;font-size:12px;color:#777;">Brak herosów do wyświetlenia</div>`;
    };

    function fetchData() {
        req(URLS.conf+"?_t="+Date.now(), "GET", res => {
            if(res.status===200) try {
                configData = JSON.parse(res.responseText);
                let newMap = {};
                for(let h in configData) {
                    (configData[h].maps || []).forEach(m => {
                        if(!m.startsWith('//')) {
                            let cleanM = m.replace(/^[-*•\s]+/, '').trim();
                            if(!newMap[cleanM]) newMap[cleanM] = [];
                            if(!newMap[cleanM].includes(h)) newMap[cleanM].push(h);
                        }
                    });
                }
                heroMaps = newMap;
            } catch(e){}
        });
        req(URLS.data+"?_t="+Date.now(), "GET", res => { if(res.status===200) try { heroesData=JSON.parse(res.responseText); } catch(e){} });
    }

    fetchData(); setInterval(fetchData, 5000); setTimeout(createUI, 1500);
    setInterval(() => {
        let t = $('rzabboard-event-timer'); if(!t || !document.body.contains(t)) createUI(); window.rzabUpdateTimerUI();
    }, 1000);

    // --- CORE LOGIC (WITH LEVEL LIMITS) ---
    setInterval(() => {
        let cmap="", cnick="", currentLvl = 0, npcs=null, now=Date.now();

        // Pobieranie mapy, nicku i poziomu z zależności od interfejsu (nowy vs stary)
        if(typeof Engine!=='undefined' && Engine.map && Engine.hero) {
            cmap=Engine.map.d.name;
            cnick=Engine.hero.d.nick;
            currentLvl = Engine.hero.d.lvl;
            npcs=Engine.npcs?.check();
        } else if(typeof map!=='undefined' && map.name && typeof hero!=='undefined') {
            cmap=map.name;
            cnick=hero.nick;
            currentLvl = hero.lvl;
            npcs=typeof g!=='undefined'?g.npc:null;
        }

        if(!cmap || !cnick || !currentLvl) return;

        let rawExpectedList = heroMaps[cmap] || [];
        let expectedList = [];

        // Filtrowanie z użyciem mechaniki serwera Cronus[cite: 1, 2, 3]
        if (rawExpectedList.length > 0) {
            rawExpectedList.forEach(expHero => {
                const conf = configData[expHero];
                if (conf && conf.level) {
                    const bLvl = parseInt(conf.level);
                    const pLvl = parseInt(currentLvl);
                    let canInteract = false;

                    if (conf.isEvent) {
                         canInteract = pLvl >= Math.floor(bLvl / 2);
                    } else {
                         let minLvl = bLvl <= 100 ? Math.floor(bLvl / 2) : bLvl - 50;
                         canInteract = pLvl >= minLvl && pLvl <= (bLvl + 13);
                    }

                    if (canInteract) {
                        expectedList.push(expHero);
                    }
                }
            });
        }

        if(cmap!==lastMap || now-lastPingTime>5000) {
            lastMap = cmap; lastPingTime = now;
            if (expectedList.length > 0) {
                expectedList.forEach(expHero => {
                    req(URLS.api, "POST", null, new URLSearchParams({action:'camp', npc:expHero, map:cmap, nick:cnick}).toString());
                });
            } else {
                req(URLS.api, "POST", null, new URLSearchParams({action:'online', npc:'', map:cmap, nick:cnick}).toString());
            }
        }

        if(expectedList.length > 0 && npcs) {
            let stillHere = false;
            for(let id in npcs) {
                let npc = npcs[id], nick = npc.d?.nick || npc.nick || "", type = npc.d?.wt ?? npc.wt ?? 0;

                if(expectedList.includes(nick) && type > 79) {
                    if(!reportedNpcs.has(id)) {
                        reportedNpcs.add(id);
                        req(URLS.api, "POST", null, new URLSearchParams({action:'found', npc:nick, map:cmap, nick:cnick}).toString());
                    }
                    if(!trackedHero) trackedHero = {id: id, name: nick, mapName: cmap};
                    if(trackedHero.id === id) stillHere = true;
                }
            }

            if(trackedHero) {
                if(cmap !== trackedHero.mapName) {
                    trackedHero = null;
                } else if(!stillHere) {
                    let killedName = trackedHero.name;
                    let killedId = trackedHero.id;
                    trackedHero = null;
                    reportedNpcs.delete(killedId);
                    req(URLS.api, "POST", r => {
                        if(r.status===200) {
                            notify(`⚔️ Zapisano ubicie: ${killedName}!`);
                            fetchData();
                        }
                    }, new URLSearchParams({action:'auto_kill', npc:killedName, map:cmap, nick:cnick}).toString());
                }
            }
        } else if(trackedHero) {
            trackedHero = null;
        }
    }, 500);
})();
