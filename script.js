"use strict";
// ==========================================================
// INTERFACE E LOOP PRINCIPAL
// ==========================================================

const $ = id => document.getElementById(id);
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

const game = {
    race: null, bg: null, config: null, trackIndex: 0,
    speed: 1, paused: false, acc: 0, last: 0, raf: 0, renderCount: 0,
    season: null, mode: "season", cards: [], lb: new Map(), lbSig: "", resultsShown: false, resultsTimer: 0
};
const SAVE_KEY = "pixelF1Season3";
const STEP_MS = 1000 / 60;
const FACE_DEFAULTS = [
    { s: 1, hair: "preto", st: "short", b: "stubble" },
    { s: 3, hair: "preto", st: "curly", b: "none" }
];
const faceSel = [Object.assign({}, FACE_DEFAULTS[0]), Object.assign({}, FACE_DEFAULTS[1])];

// ==========================================================
// TELA DE CRIAÇÃO
// ==========================================================
function fillSelect(sel, items, selected) {
    sel.innerHTML = "";
    items.forEach(([value, label]) => {
        const o = document.createElement("option");
        o.value = value; o.textContent = label;
        if (String(value) === String(selected)) o.selected = true;
        sel.appendChild(o);
    });
}

function faceFromSel(k) {
    const f = faceSel[k];
    return { s: +f.s, h: HAIR_COLORS[f.hair], st: f.st, b: f.b };
}

function buildFaceConfig(k) {
    const box = $("face-config-" + (k + 1));
    box.innerHTML = "";
    const defs = [
        ["s", SKIN_LABELS.map((l, i) => [i, "PELE: " + l])],
        ["hair", Object.keys(HAIR_COLORS).map(n => [n, "COR: " + n.toUpperCase()])],
        ["st", HAIR_STYLES.map(n => [n, "CABELO: " + HAIR_STYLE_LABELS[n]])],
        ["b", BEARD_STYLES.map(n => [n, BEARD_LABELS[n]])]
    ];
    defs.forEach(([key, items]) => {
        const sel = document.createElement("select");
        fillSelect(sel, items, faceSel[k][key]);
        sel.addEventListener("change", () => { faceSel[k][key] = sel.value; updatePreview(); });
        box.appendChild(sel);
    });
}

function realTeam() {
    const v = $("team-select").value;
    return v === "custom" ? null : TEAMS_2026.find(t => t.name === v);
}

function updateTeamInfo() {
    const t = realTeam(), box = $("team-info");
    if (t) {
        const e = ENGINES[t.engine];
        box.textContent = "MOTOR " + e.name.toUpperCase() + " · RITMO #" + teamRank(t.pace) + " DE 12 · " + e.label.replace(/^.*\((.*)\)$/, "$1").toUpperCase() + " · PILOTOS: " + t.drivers.map(d => d.name).join(" E ");
    } else {
        const e = ENGINES[$("engine-select").value];
        box.textContent = "EQUIPE NOVA (12ª) · MOTOR " + e.name.toUpperCase() + " · RITMO #" + (teamRank(CUSTOM_CHASSIS + e.pace) + 0) + " ENTRE AS 11 REAIS (CHASSI DE FUNDO DE GRID)";
    }
}

function applyTeamChoice() {
    const t = realTeam();
    const ids = ["team-name", "primary-color", "secondary-color", "engine-select", "driver1-name", "driver2-name"];
    ids.forEach(id => { $(id).disabled = !!t; });
    document.querySelectorAll(".face-config select").forEach(x => { x.disabled = !!t; });
    if (t) {
        $("team-name").value = t.name; $("primary-color").value = t.color; $("secondary-color").value = t.secondary;
        $("engine-select").value = t.engine;
        $("driver1-name").value = t.drivers[0].name; $("driver2-name").value = t.drivers[1].name;
    } else {
        const sv = game.customSaved || {};
        $("team-name").value = sv["team-name"] || "BRAZIL RACING";
        $("primary-color").value = sv["primary-color"] || "#00e676";
        $("secondary-color").value = sv["secondary-color"] || "#ffea00";
        $("engine-select").value = sv["engine-select"] || "ferrari";
        $("driver1-name").value = sv["driver1-name"] || "A. SENNA JR";
        $("driver2-name").value = sv["driver2-name"] || "T. MOURA";
    }
    updateTeamInfo(); updatePreview();
}

function updatePreview() {
    const pc = $("preview-canvas").getContext("2d");
    pc.imageSmoothingEnabled = false;
    pc.clearRect(0, 0, 144, 64);
    const primary = $("primary-color").value, secondary = $("secondary-color").value;
    pc.drawImage(carSprite(primary, secondary), 0, 0, 144, 64);
    const t = realTeam();
    [0, 1].forEach(k => {
        const c = $("preview-face-" + (k + 1)).getContext("2d");
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, 24, 24);
        c.drawImage(faceCanvas(t ? t.drivers[k].f : faceFromSel(k), { color: primary, secondary }), 0, 0);
    });
}

const SETUP_IDS = ["team-name", "primary-color", "secondary-color", "engine-select", "gp-select", "laps-select", "driver1-name", "driver2-name", "mode-select", "weather-select"];

function loadSeasonSave() {
    try {
        const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
        if (sv && sv.version === 3 && !sv.done) return sv;
    } catch (e) { /* sem armazenamento */ }
    return null;
}
function saveSeason() {
    try {
        if (game.season && !game.season.done) localStorage.setItem(SAVE_KEY, JSON.stringify(game.season));
        else localStorage.removeItem(SAVE_KEY);
    } catch (e) { /* ignora */ }
}
function refreshContinue() {
    const sv = loadSeasonSave();
    $("continue-btn").classList.toggle("hidden", !sv);
    $("continue-info").textContent = sv ? "TEMPORADA SALVA: " + (sv.cfg.realTeam || sv.cfg.teamName).toUpperCase() + " · ETAPA " + (sv.round + 1) + "/" + sv.order.length : "";
}

function initSetup() {
    fillSelect($("engine-select"), Object.entries(ENGINES).map(([k, e]) => [k, e.label]), "ferrari");
    fillSelect($("gp-select"), TRACKS.map((t, i) => [i, String(i + 1).padStart(2, "0") + " · " + t.name + " — " + t.gp]), 0);
    fillSelect($("team-select"), [["custom", "★ CRIAR EQUIPE PRÓPRIA (12ª)"]].concat(TEAMS_2026.map(t => [t.name, t.name.toUpperCase() + " (" + ENGINES[t.engine].name.toUpperCase() + ")"])), "custom");
    // restaura última configuração
    try {
        const saved = JSON.parse(localStorage.getItem("pixelF1Setup3") || "null");
        if (saved) {
            game.customSaved = saved.custom || null;
            SETUP_IDS.forEach(id => { if (saved[id] != null && $(id)) $(id).value = saved[id]; });
            if (saved.team) $("team-select").value = saved.team;
            if (saved.faces) saved.faces.forEach((f, k) => { if (f) Object.assign(faceSel[k], f); });
        }
    } catch (e) { /* sem armazenamento: tudo bem */ }
    if ($("team-select").value === "") $("team-select").value = "custom";
    buildFaceConfig(0); buildFaceConfig(1);
    ["primary-color", "secondary-color"].forEach(id => $(id).addEventListener("input", () => { updatePreview(); }));
    $("engine-select").addEventListener("change", updateTeamInfo);
    $("team-select").addEventListener("change", () => {
        if (!realTeam() && game.customSaved === undefined) game.customSaved = null;
        applyTeamChoice();
    });
    const syncMode = () => $("gp-group").classList.toggle("hidden", $("mode-select").value === "season");
    $("mode-select").addEventListener("change", syncMode); syncMode();
    // se havia equipe real salva, os campos precisam refletir a equipe
    if (realTeam()) { const keep = game.customSaved; applyTeamChoice(); game.customSaved = keep; } else { updateTeamInfo(); updatePreview(); }
    refreshContinue();

    $("start-game-btn").addEventListener("click", () => {
        readConfig();
        const order = TRACKS.map((t, i) => i);
        if ($("mode-select").value === "single") {
            game.season = newSeason(game.config, [+$("gp-select").value]);
            game.single = true;
        } else {
            game.season = newSeason(game.config, order);
            game.single = false;
            saveSeason();
        }
        startNextRound();
    });
    $("continue-btn").addEventListener("click", () => {
        const sv = loadSeasonSave(); if (!sv) return;
        game.season = sv; game.config = sv.cfg; game.single = false;
        startNextRound();
    });
}

function readConfig() {
    const t = realTeam();
    const cfg = {
        realTeam: t ? t.name : null,
        teamName: t ? t.name : ($("team-name").value.trim() || "CUSTOM F1"),
        color: $("primary-color").value, secondary: $("secondary-color").value,
        engine: $("engine-select").value, laps: +$("laps-select").value, weather: $("weather-select").value,
        drivers: t ? t.drivers.map(d => ({ name: d.name, face: d.f })) : [
            { name: $("driver1-name").value.trim() || "PILOTO 1", face: faceFromSel(0) },
            { name: $("driver2-name").value.trim() || "PILOTO 2", face: faceFromSel(1) }
        ]
    };
    game.config = cfg;
    try {
        const saved = {};
        SETUP_IDS.forEach(id => saved[id] = $(id).value);
        saved.team = $("team-select").value;
        saved.faces = faceSel;
        if (!t) game.customSaved = saved;
        saved.custom = game.customSaved || null;
        localStorage.setItem("pixelF1Setup3", JSON.stringify(saved));
    } catch (e) { /* ignora */ }
}

// ==========================================================
// INÍCIO DA CORRIDA
// ==========================================================
// ==========================================================
// CLASSIFICAÇÃO (Q1/Q2/Q3) ANTES DE CADA CORRIDA
// ==========================================================
function showScreen(id) {
    ["setup-screen", "quali-screen", "race-screen"].forEach(n => $(n).classList.toggle("active", n === id));
}

function startNextRound() {
    const se = game.season, idx = se.order[se.round], def = TRACKS[idx], cfg = game.config;
    clearTimeout(game.resultsTimer); cancelAnimationFrame(game.raf);
    $("results-modal").classList.add("hidden");
    game.wxKind = cfg.weather === "random" || !cfg.weather ? pickWeather(def, Math.random) : cfg.weather;
    const prev = createRace({
        trackDef: def, laps: cfg.laps, weather: game.wxKind, banned: seasonBanned(se),
        player: { teamName: cfg.teamName, color: cfg.color, secondary: cfg.secondary, engine: cfg.engine, drivers: cfg.drivers, realTeam: cfg.realTeam }
    });
    const q = qualiInit(prev, game.wxKind);
    q.trackIdx = idx; q.players = prev.playerCars;
    q.players.forEach(c => { q.choices[carKey(c)] = { tyre: idealWetTyre(q.wet) || "SOFT", risk: "normal" }; });
    game.q = q;
    renderQuali();
    showScreen("quali-screen");
}

const Q_TYRES = ["SOFT", "MEDIUM", "INTER", "WET"];
function renderQuali() {
    const q = game.q, se = game.season, def = TRACKS[q.trackIdx];
    $("q-title").textContent = (game.single ? "" : "ETAPA " + (se.round + 1) + "/" + se.order.length + " · ") + "CLASSIFICAÇÃO · " + def.name;
    const wetTxt = q.wet > 0.6 ? "PISTA ENCHARCADA" : q.wet > 0.1 ? "PISTA MOLHADA" : "PISTA SECA";
    const cur = q.done ? null : QUALI.SESSIONS[q.session];
    $("q-sub").textContent = wetTxt + " · " + (q.done ? "CLASSIFICAÇÃO ENCERRADA" : cur.name + ": " + q.field.length + " CARROS, " + (q.session === 0 ? Math.max(10, q.total - 6) : cur.cut) + " AVANÇAM" + (q.session === 2 ? " (DISPUTA DA POLE)" : "")) + " · PREVISÃO DA CORRIDA: " + WX_KINDS[game.wxKind].label;

    // escolhas dos pilotos do jogador
    const box = $("q-controls"); box.innerHTML = "";
    q.players.forEach(c => {
        const key = carKey(c), ch = q.choices[key];
        const eliminated = !q.done && !q.field.some(f => f.key === key);
        const div = el("div", "q-car");
        const img = document.createElement("img"); img.src = faceURL(c.face, c); img.alt = "";
        const name = el("div", "", ""); name.appendChild(img); name.appendChild(document.createTextNode(c.name + (eliminated ? " · ELIMINADO" : "")));
        div.appendChild(name);
        const row = el("div", "row");
        const st = document.createElement("select");
        Q_TYRES.forEach(t => { const o = document.createElement("option"); o.value = t; o.textContent = "PNEU: " + TYRES[t].label; if (ch.tyre === t) o.selected = true; st.appendChild(o); });
        st.addEventListener("change", () => { ch.tyre = st.value; });
        const sr = document.createElement("select");
        Object.entries(QUALI.RISK).forEach(([k, r]) => { const o = document.createElement("option"); o.value = k; o.textContent = "RISCO: " + r.label; if (ch.risk === k) o.selected = true; sr.appendChild(o); });
        sr.addEventListener("change", () => { ch.risk = sr.value; });
        st.disabled = sr.disabled = eliminated || q.done;
        row.appendChild(st); row.appendChild(sr); div.appendChild(row);
        box.appendChild(div);
    });

    // tabela
    const t = $("q-table"); t.innerHTML = "";
    const head = el("tr"); ["POS", "", "PILOTO", "EQUIPE", "TEMPO", "DIF.", "PNEU", "RESULTADO"].forEach(h => head.appendChild(el("th", "", h))); t.appendChild(head);
    const mine = new Set(q.players.map(carKey));
    const addRow = (pos, key, car, time, gap, tyre, status, cut) => {
        const tr = el("tr", (mine.has(key) ? "player-team " : "") + (cut ? "cut" : ""));
        tr.appendChild(el("td", "", String(pos)));
        const tdi = el("td"); const img = document.createElement("img"); img.src = faceURL(car.face, car); img.alt = ""; tdi.appendChild(img); tr.appendChild(tdi);
        tr.appendChild(el("td", "", car.name));
        const tdt = el("td"); const dot = el("span", "dot"); dot.style.background = car.color; tdt.appendChild(dot); tdt.appendChild(document.createTextNode(car.team)); tr.appendChild(tdt);
        tr.appendChild(el("td", "", time));
        tr.appendChild(el("td", "", gap));
        tr.appendChild(el("td", "", tyre));
        tr.appendChild(el("td", "", status));
        t.appendChild(tr);
    };
    if (!q.results.length) {
        q.field.forEach((f, i) => addRow(i + 1, f.key, f.car, "--", "", "", "AGUARDANDO", false));
    } else if (q.done) {
        const lastTime = {}; q.results.forEach(r => r.rows.forEach(x => { lastTime[x.key] = x; }));
        const byKey = {}; q.results.forEach(r => r.rows.forEach(x => { byKey[x.key] = x.car; }));
        q.grid.forEach((k, i) => {
            const x = lastTime[k];
            addRow(i + 1, k, byKey[k], formatQuali(x.time), x.gap == null ? "" : (x.gap === 0 ? "" : "+" + x.gap.toFixed(3)), TYRES[x.tyre].code, i === 0 ? "POLE" : (i < 10 ? "Q3" : i < 10 + (q.results[1].rows.length - 10) ? "Q2" : "Q1"), false);
        });
    } else {
        const last = q.results[q.results.length - 1];
        last.rows.forEach(x => addRow(x.pos, x.key, x.car, formatQuali(x.time), x.gap == null ? "" : (x.gap === 0 ? "" : "+" + x.gap.toFixed(3)), TYRES[x.tyre].code, x.out ? "ELIMINADO" : "AVANÇA", x.out));
    }
    $("q-run").textContent = q.done ? "" : "RODAR " + QUALI.SESSIONS[q.session].name;
    $("q-run").classList.toggle("hidden", q.done);
    $("q-skip").classList.toggle("hidden", q.done);
    $("q-go").classList.toggle("hidden", !q.done);
}

function initQuali() {
    $("q-run").addEventListener("click", () => { qualiRunSession(game.q, Math.random); renderQuali(); });
    $("q-skip").addEventListener("click", () => { qualiAuto(game.q, Math.random); renderQuali(); });
    $("q-go").addEventListener("click", () => startRace(game.q.trackIdx, game.q.grid));
    $("q-menu").addEventListener("click", backToMenu);
}

function startRace(trackIndex, qualiOrder) {
    cancelAnimationFrame(game.raf);
    clearTimeout(game.resultsTimer);
    game.trackIndex = trackIndex;
    const def = TRACKS[trackIndex], cfg = game.config;
    const race = createRace({
        trackDef: def, laps: cfg.laps, weather: game.wxKind || cfg.weather || "random", qualiOrder, banned: seasonBanned(game.season),
        player: { teamName: cfg.teamName, color: cfg.color, secondary: cfg.secondary, engine: cfg.engine, drivers: cfg.drivers, realTeam: cfg.realTeam }
    });
    game.race = race;
    game.bg = renderTrackBackground(race.track, cfg.color);
    game.ctx = $("track-canvas").getContext("2d");
    game.resultsShown = false; game.paused = false; game.acc = 0; game.renderCount = 0;

    $("gp-name").textContent = game.single ? def.name : "ETAPA " + (game.season.round + 1) + "/" + game.season.order.length + " · " + def.name;
    $("fastest-lap").textContent = "VR: --";
    $("lap-counter").textContent = "0/" + race.laps;
    $("radio-log").innerHTML = "";
    $("results-modal").classList.add("hidden");
    $("race-banner").classList.add("hidden");
    showScreen("race-screen");
    updateSpeedButtons();

    buildLeaderboard(race);
    game.cards = [0, 1].map(k => buildCard(k, race.playerCars[k]));

    logRadio("Bem-vindo a " + def.name + " (" + def.gp + ")! " + race.laps + " voltas. Pneus: regra dos 2 compostos vale.", "info");
    logRadio("CLIMA: " + weatherLabel(race.weather) + ". " + forecastText(race) + ". Antes da largada você pode trocar o pneu do grid pelos botões de pneu.", "info");
    logRadio("Grid: " + race.playerCars.map(c => c.name + " P" + c.startPos).join(" | ") + ".", "info");
    race.penalties.filter(p => p.kind === "grid").forEach(p => logRadio("COMISSÁRIOS: " + p.driver + " (" + p.team + ") perde " + p.places + " posições no grid. " + p.reason + ".", race.cars[p.carId].isPlayer ? "warn" : "info"));
    race.playerCars.filter(c => c.sub).forEach(c => logRadio("SUSPENSÃO: o titular cumpre uma corrida de suspensão (12 pontos na licença). " + c.name + " assume o carro.", "warn"));
    race.playerCars.forEach(c => logRadio("Pedido de box automático: " + c.name + " chama sozinho quando o pneu cai.", "info"));

    game.last = performance.now();
    game.raf = requestAnimationFrame(frame);
}

// ==========================================================
// LEADERBOARD
// ==========================================================
function buildLeaderboard(race) {
    const ul = $("leaderboard-list");
    ul.innerHTML = ""; game.lb = new Map(); game.lbSig = "";
    race.cars.forEach(c => {
        const li = el("li", "lb-item" + (c.isPlayer ? " player-team" : ""));
        const pos = el("span", "lb-pos", "");
        const img = document.createElement("img");
        img.className = "lb-face"; img.alt = ""; img.src = faceURL(c.face, c);
        const nm = el("div", "lb-name", c.name);
        const sub = el("small", "", c.team);
        nm.appendChild(sub);
        const gap = el("span", "lb-gap", "");
        const tyre = el("span", "mini-tyre", "");
        [pos, img, nm, gap, tyre].forEach(x => li.appendChild(x));
        ul.appendChild(li);
        game.lb.set(c.id, { li, pos, gap, tyre, sub, flags: "" });
    });
}

function penFlags(c) {
    const f = [];
    if (c.dsq) f.push("DSQ");
    if (c.dt) f.push("DRIVE-THRU");
    if (c.penPending > 0) f.push("+" + c.penPending + "s");
    if (c.damage > 0) f.push("DANO");
    if (c.spin > 0) f.push("RODOU");
    if (c.wing === "stuck") f.push("ASA!");
    return f.join(" ");
}

function updateLeaderboard(race) {
    const sig = race.cars.map(c => c.id).join(",");
    if (sig !== game.lbSig) {
        const ul = $("leaderboard-list");
        race.cars.forEach(c => ul.appendChild(game.lb.get(c.id).li));
        game.lbSig = sig;
    }
    race.cars.forEach((c, i) => {
        const r = game.lb.get(c.id);
        r.pos.textContent = (i + 1);
        let gap;
        if (race.phase === "countdown") gap = "";
        else if (c.dnf) gap = "DNF";
        else if (c.inPit) gap = "BOX";
        else if (c.finished) gap = "FIM";
        else gap = i === 0 ? "LÍDER" : gapToLeader(race, c);
        r.gap.textContent = gap;
        const t = TYRES[c.tyre];
        r.tyre.textContent = t.code; r.tyre.className = "mini-tyre " + t.cls;
        r.li.classList.toggle("is-out", c.dnf || c.dsq);
        const fl = penFlags(c);
        if (fl !== r.flags) { r.flags = fl; r.sub.textContent = c.team + (fl ? " · " + fl : ""); }
    });
}

// ==========================================================
// PAINEL DOS PILOTOS
// ==========================================================
const KEYMAP = [
    { pace: ["q", "w", "e"], pit: ["a", "s", "d", "f", "g"], accept: "x", boost: "z" },
    { pace: ["i", "o", "p"], pit: ["j", "k", "l", ";", "'"], accept: "m", boost: "n" }
];
const PACE_KEYS = ["conserve", "normal", "push"];
const PIT_KEYS = ["SOFT", "MEDIUM", "HARD", "INTER", "WET"];
const PACE_LABEL = { conserve: "POUPAR", normal: "NORMAL", push: "ATAQUE" };
const REASON_TEXT = {
    degrade: "Os pneus estão perdendo rendimento!",
    positions: "Estou perdendo posições, o pneu não segura mais!",
    critical: "O pneu acabou, preciso entrar AGORA!",
    rule: "Falta usar o segundo composto.",
    wet: "A pista está molhada demais para este pneu!",
    dry: "A pista está secando, este pneu está sendo destruído!",
    safetycar: "Safety car na pista! Parada barata, vamos aproveitar?"
};

function buildCard(k, car) {
    const root = $("card-d" + (k + 1));
    root.innerHTML = ""; root.classList.remove("asking");
    const ui = { car, root };

    const head = el("div", "driver-header");
    ui.face = document.createElement("img"); ui.face.className = "driver-face"; ui.face.alt = ""; ui.face.src = faceURL(car.face, car);
    const title = el("div", "driver-title", car.name); title.appendChild(el("small", "", car.team));
    ui.pos = el("span", "pos-badge", "P" + car.pos);
    ui.tyre = el("span", "tyre-badge soft", "S");
    [ui.face, title, ui.pos, ui.tyre].forEach(x => head.appendChild(x));
    root.appendChild(head);

    function bar(label, cls) {
        const row = el("div", "bar-row");
        const bg = el("div", "progress-bg"), fill = el("div", "progress-fill " + cls);
        bg.appendChild(fill);
        const txt = el("span", "", "100%");
        row.appendChild(el("span", "", label)); row.appendChild(bg); row.appendChild(txt);
        root.appendChild(row);
        return { bg, fill, txt };
    }
    ui.wear = bar("PNEU:", "green");
    const mark = el("div", "wear-mark"); mark.style.left = SIM.PIT_CALL_WEAR + "%"; mark.title = "Ponto em que o piloto pede box";
    ui.wear.bg.appendChild(mark);
    ui.ers = bar("ERS:", "blue");

    const paceRow = el("div", "controls-row"); paceRow.appendChild(el("label", "", "RITMO:"));
    ui.paceBtns = PACE_KEYS.map((m, i) => {
        const b = el("button", "pace-btn", PACE_LABEL[m] + " [" + KEYMAP[k].pace[i].toUpperCase() + "]");
        b.addEventListener("click", () => doPace(k, m));
        paceRow.appendChild(b); return b;
    });
    root.appendChild(paceRow);

    const pitRow = el("div", "controls-row"); pitRow.appendChild(el("label", "", "BOX:"));
    ui.pitBtns = PIT_KEYS.map((t, i) => {
        const b = el("button", "pit-btn " + TYRES[t].cls, TYRES[t].code + " [" + KEYMAP[k].pit[i].toUpperCase() + "]");
        b.title = "Trocar para pneu " + TYRES[t].label;
        b.addEventListener("click", () => doPit(k, t));
        pitRow.appendChild(b); return b;
    });
    ui.pitStatus = el("span", "pit-status", "");
    pitRow.appendChild(ui.pitStatus);
    root.appendChild(pitRow);

    const autoRow = el("div", "controls-row"); autoRow.appendChild(el("label", "", "AUTO:"));
    ui.autoBtn = el("button", "mini-btn on", "PILOTO CHAMA O BOX: SIM");
    ui.autoBtn.addEventListener("click", () => {
        car.autoBox = !car.autoBox;
        logRadio(car.name + ": " + (car.autoBox ? "Auto-box ligado: eu aviso e entro sozinho." : "Auto-box desligado: eu peço e você decide."), "info");
    });
    autoRow.appendChild(ui.autoBtn);
    root.appendChild(autoRow);

    const enRow = el("div", "controls-row"); enRow.appendChild(el("label", "", "ENERGIA:"));
    ui.boostBtn = el("button", "mini-btn boost", "BOOST [" + KEYMAP[k].boost.toUpperCase() + "]");
    ui.boostBtn.addEventListener("click", () => doBoost(k));
    ui.energy = el("span", "energy-status", "");
    enRow.appendChild(ui.boostBtn); enRow.appendChild(ui.energy);
    root.appendChild(enRow);
    const wingRow = el("div", "controls-row"); wingRow.appendChild(el("label", "", "ASA:"));
    ui.wing = el("span", "wing-status", "FECHADA"); wingRow.appendChild(ui.wing);
    root.appendChild(wingRow);
    ui.pen = el("div", "pen-info ok", "");
    root.appendChild(ui.pen);

    ui.ask = el("div", "pit-ask hidden");
    ui.askText = el("div", "", "");
    const actions = el("div", "ask-actions");
    ui.askYes = el("button", "yes", ""); ui.askYes.addEventListener("click", () => doAccept(k));
    ui.askNo = el("button", "no", "IGNORAR"); ui.askNo.addEventListener("click", () => { declineAsk(game.race, car); logRadio(car.name + ": Entendido, vou tentar segurar.", "info"); });
    actions.appendChild(ui.askYes); actions.appendChild(ui.askNo);
    ui.ask.appendChild(ui.askText); ui.ask.appendChild(actions);
    root.appendChild(ui.ask);
    ui.lastPos = car.pos; ui.lastPosMsg = 0;
    return ui;
}

function doPace(k, mode) {
    const car = game.race && game.race.playerCars[k]; if (!car) return;
    setPace(car, mode);
    logRadio(car.name + ": modo " + PACE_LABEL[mode] + ".", "info");
}
function doPit(k, tyre) {
    const race = game.race, car = race && race.playerCars[k]; if (!car) return;
    const was = car.pitRequested === tyre;
    if (race.phase === "countdown") {
        if (requestPit(race, car, tyre)) logRadio("Pneu de largada de " + car.name + ": " + TYRES[tyre].label + ".", "good");
        return;
    }
    if (requestPit(race, car, tyre)) {
        logRadio(was ? "Box cancelado para " + car.name + "." : "Box confirmado para " + car.name + ": pneu " + TYRES[tyre].label + " na próxima passagem.", was ? "info" : "good");
    }
}
function doBoost(k) {
    const race = game.race, car = race && race.playerCars[k]; if (!car) return;
    if (activateBoost(race, car)) logRadio("BOOST! " + car.name + " usa a energia (30% da bateria).", "good");
    else if (car.ers < OM.BOOST_COST) logRadio(car.name + ": bateria baixa para o boost.", "warn");
}
function doAccept(k) {
    const race = game.race, car = race && race.playerCars[k]; if (!car || !car.pitAsk) return;
    const t = car.pitAsk.tyre;
    acceptAsk(race, car);
    logRadio("Box confirmado para " + car.name + ": pneu " + TYRES[t].label + ".", "good");
}

function updateCards(race) {
    game.cards.forEach(ui => {
        const car = ui.car, t = TYRES[car.tyre];
        ui.pos.textContent = car.dnf ? "DNF" : "P" + car.pos;
        ui.tyre.textContent = t.code; ui.tyre.className = "tyre-badge " + t.cls;
        const w = Math.round(car.tyreWear);
        ui.wear.fill.style.width = w + "%";
        ui.wear.fill.className = "progress-fill " + (w > 50 ? "green" : w > SIM.PIT_CRITICAL_WEAR ? "yellow" : "red");
        ui.wear.txt.textContent = w + "%";
        const e = Math.round(car.ers);
        ui.ers.fill.style.width = e + "%"; ui.ers.txt.textContent = e + "%";
        ui.paceBtns.forEach((b, i) => b.classList.toggle("active", car.pace === PACE_KEYS[i]));
        ui.pitBtns.forEach((b, i) => b.classList.toggle("active", car.pitRequested === PIT_KEYS[i]));
        ui.pitStatus.textContent = car.inPit ? "NO BOX..." : car.pitRequested ? "BOX " + TYRES[car.pitRequested].code + " ▶" : "";
        ui.autoBtn.textContent = "PILOTO CHAMA O BOX: " + (car.autoBox ? "SIM" : "NÃO");
        ui.autoBtn.classList.toggle("on", car.autoBox);
        const bs = car.boost > 0 ? "BOOST ATIVO" : car.boostCool > 0 ? "RECARREGANDO" : car.ers < OM.BOOST_COST ? "ENERGIA BAIXA" : "PRONTO";
        ui.energy.textContent = bs + " · " + (car.om ? "OVERTAKE MODE ARMADO" : "OVERTAKE: --");
        ui.boostBtn.disabled = car.dnf || car.finished || !!race.sc || car.boost > 0 || car.boostCool > 0 || car.ers < OM.BOOST_COST;
        const wingTxt = car.dnf ? "-" : car.wing === "stuck" ? "⚠ ABERTA! FECHE JÁ (POUPAR)" : car.wing === "open" ? "ABERTA (MODO RETA)" : "FECHADA (CURVA)";
        ui.wing.textContent = wingTxt; ui.wing.className = "wing-status " + (car.wing === "stuck" ? "bad" : car.wing === "open" ? "open" : "");
        const pi = [];
        if (car.dt) pi.push("DRIVE-THROUGH: entre nos boxes até a volta " + car.dt.deadline);
        if (car.penPending > 0) pi.push("+" + car.penPending + "s: cumpridos no próximo pit stop");
        if (car.damage > 0) pi.push("asa danificada (" + Math.round(car.damage * 100) + "% de perda)");
        const lic = (game.season.lic[car.name + "|" + car.team] || 0) + car.licGained;
        pi.push("LICENÇA " + lic + "/" + STEW.BAN_POINTS);
        ui.pen.textContent = pi.join(" · ");
        ui.pen.classList.toggle("ok", !car.dt && !(car.penPending > 0) && !(car.damage > 0));
        const ask = car.pitAsk;
        ui.ask.classList.toggle("hidden", !ask);
        ui.root.classList.toggle("asking", !!ask);
        if (ask) {
            ui.askText.textContent = "📻 " + REASON_TEXT[ask.reason] + " Sugiro pneu " + TYRES[ask.tyre].label + ".";
            ui.askYes.textContent = "ACEITAR " + TYRES[ask.tyre].code + " [" + KEYMAP[car.playerIndex].accept.toUpperCase() + "]";
        }
        // avisos de posição
        if (race.phase === "racing" && car.pos !== ui.lastPos && race.frame - ui.lastPosMsg > 360 && !car.inPit) {
            const up = car.pos < ui.lastPos;
            logRadio(car.name + ": " + (up ? "Ganhei posição! P" : "Perdi posição... P") + car.pos + ".", up ? "good" : "warn");
            ui.lastPosMsg = race.frame;
        }
        ui.lastPos = car.pos;
    });
}

// ==========================================================
// RÁDIO, BANNER E EVENTOS
// ==========================================================
function logRadio(msg, cls) {
    const log = $("radio-log");
    const p = el("p", cls || "", "> " + msg);
    log.prepend(p);
    while (log.children.length > 40) log.lastChild.remove();
}
let bannerTimer = 0;
function showBanner(text, ms) {
    const b = $("race-banner");
    b.textContent = text; b.classList.remove("hidden");
    clearTimeout(bannerTimer);
    if (ms) bannerTimer = setTimeout(() => b.classList.add("hidden"), ms);
}

function handleEvents(race) {
    const evs = race.events; race.events = [];
    evs.forEach(ev => {
        const c = ev.car, mine = c && c.isPlayer;
        switch (ev.type) {
            case "lights":
                if (ev.n > 0) showBanner("LUZES: " + ev.n + "/5"); else $("race-banner").classList.add("hidden");
                break;
            case "go":
                showBanner("LARGADA! 🟢", 1500); logRadio("As luzes se apagaram! Boa corrida!", "good"); break;
            case "driverCall": {
                logRadio(c.name + ": " + REASON_TEXT[ev.reason] + " Peço box!", ev.urgent ? "warn" : "info");
                if (ev.auto) logRadio("→ Box confirmado para " + c.name + ": pneu " + TYRES[ev.tyre].label + ".", "good");
                else logRadio("→ " + c.name + " aguarda sua decisão: ACEITAR ou IGNORAR.", "warn");
                break;
            }
            case "wingWarning":
                if (mine) { logRadio("⚠ AVISO: falha na asa ativa de " + c.name + ", ela não fechou (" + ev.zone + ")! Mande POUPAR!", "warn"); showBanner("⚠ ASA ABERTA\n" + c.name.toUpperCase(), 1800); }
                break;
            case "safetyCar":
                showBanner(ev.kind === "SC" ? "🚨 SAFETY CAR\nSEM ULTRAPASSAGENS" : "🟡 VSC\nVELOCIDADE REDUZIDA", 2600);
                logRadio((ev.kind === "SC" ? "SAFETY CAR" : "VIRTUAL SAFETY CAR") + " na pista: " + ev.reason + ". Boa hora para o box?", "warn");
                break;
            case "safetyCarEnd": showBanner("🟢 RELARGADA!", 1800); logRadio((ev.kind === "SC" ? "Safety car" : "VSC") + " termina: corrida liberada!", "good"); break;
            case "overtakeArmed": if (mine) logRadio(c.name + ": OVERTAKE MODE armado (a " + ev.gap.toFixed(1) + "s do carro da frente). Use nas zonas verdes!", "good"); break;
            case "wobble": if (mine) logRadio(c.name + ": quase perdi o carro na freada! Perdi tempo.", "warn"); break;
            case "spin": if (mine) { logRadio(c.name + " RODOU (" + ev.why + ")!", "warn"); showBanner("RODADA!\n" + c.name.toUpperCase(), 1600); } else logRadio(c.name + " (" + c.team + ") rodou.", "info"); break;
            case "slide": if (mine) logRadio(c.name + ": perdi a traseira (" + ev.why + "), segurei!", "warn"); break;
            case "evade": if (mine) logRadio(c.name + " precisou desviar de " + ev.other.name + " e perdeu tempo.", "warn"); break;
            case "crash":
                logRadio("ACIDENTE: " + c.name + " (" + c.team + ") bateu e está fora! (" + ev.why + ")", mine ? "warn" : "info");
                if (mine) showBanner("ACIDENTE!\n" + c.name.toUpperCase() + " ABANDONOU", 2600);
                break;
            case "crashHit": if (mine) logRadio(c.name + " foi atingido por " + ev.other.name + (ev.out ? " e abandonou!" : " e danificou a asa."), "warn"); break;
            case "yellow": logRadio(ev.on ? "BANDEIRA AMARELA: carro parado na pista." : "Bandeira verde: pista liberada.", ev.on ? "warn" : "info"); break;
            case "weather":
                if (race.frame - race.goFrame > 60) logRadio("CLIMA: " + ev.label + " (pista " + Math.round(ev.wet * 100) + "% molhada).", "info");
                break;
            case "pitIn":
                if (mine) logRadio(ev.through ? c.name + " cumpre o drive-through (passa pelos boxes sem parar)." : c.name + " entrou nos boxes (pneu " + TYRES[ev.tyre].label + ").", "info");
                break;
            case "penalty": {
                const e = ev.entry;
                if (!mine && (e.kind === "warning" || e.kind === "note")) break;
                const cls = e.kind === "note" ? "info" : "warn";
                logRadio("COMISSÁRIOS: " + e.driver + " (" + e.team + ") — " + penText(e) + ". " + e.reason + ".", mine ? cls : "info");
                if (mine && (e.kind === "time" || e.kind === "drive" || e.kind === "dsq")) showBanner("PUNIÇÃO\n" + c.name.toUpperCase() + ": " + penText(e), 2400);
                break;
            }
            case "contact": if (ev.car.isPlayer || ev.other.isPlayer) logRadio("CONTATO entre " + ev.car.name + " e " + ev.other.name + "!", "warn"); break;
            case "served": if (mine) logRadio(c.name + " cumpriu " + ev.seconds + "s de punição parado no box.", "info"); break;
            case "dtServed": if (mine) logRadio(c.name + " cumpriu o drive-through.", "good"); break;
            case "wingChange": if (mine) logRadio(c.name + ": asa trocada no pit stop, dano reparado.", "good"); break;
            case "pitOut": if (mine) logRadio(c.name + " saiu dos boxes com pneus " + TYRES[c.tyre].label + "!", "good"); break;
            case "pitCancelled": if (mine) logRadio("Box de " + c.name + " cancelado: era tarde demais (última volta).", "warn"); break;
            case "mistake": if (mine) logRadio(c.name + " errou e perdeu tempo.", "warn"); break;
            case "ersEmpty": if (mine) logRadio(c.name + ": bateria ERS esgotada, voltando ao ritmo normal.", "warn"); break;
            case "dnf": logRadio("ABANDONO: " + c.name + " (" + c.team + ") com problema mecânico.", mine ? "warn" : "info"); if (mine) showBanner("ABANDONO: " + c.name.toUpperCase(), 2200); break;
            case "fastest":
                $("fastest-lap").textContent = "VR: " + formatLap(ev.time) + " " + c.name.split(" ").pop().toUpperCase();
                if (mine) logRadio("Volta mais rápida da prova: " + c.name + " (" + formatLap(ev.time) + ")!", "good");
                break;
            case "flag":
                showBanner("🏁 BANDEIRA QUADRICULADA!\nVITÓRIA DE " + c.name.toUpperCase(), 0);
                logRadio("FIM DE PROVA! Vencedor: " + c.name + " (" + c.team + ").", "good");
                break;
            case "finished": if (mine) logRadio(c.name + " cruzou a linha de chegada em P" + c.pos + ".", "good"); break;
            case "done":
                game.resultsTimer = setTimeout(showResults, 1600);
                break;
        }
    });
}

// ==========================================================
// RESULTADOS E CAMPEONATO
// ==========================================================
function penText(e) {
    let t;
    switch (e.kind) {
        case "time": t = "+" + e.seconds + "s"; break;
        case "drive": t = "DRIVE-THROUGH"; break;
        case "grid": t = "-" + e.places + " POSIÇÕES NO GRID"; break;
        case "fine": t = "MULTA " + fmtEuro(e.euros); break;
        case "warning": t = "AVISO"; break;
        case "note": t = "SEM AÇÃO"; break;
        case "dsq": t = "DESQUALIFICADO"; break;
        default: t = e.kind;
    }
    if (e.points) t += " · " + e.points + " PTS NA LICENÇA";
    return t;
}

function fillTable(table, head, rows) {
    table.innerHTML = "";
    const hr = el("tr"); head.forEach(h => hr.appendChild(el("th", "", h))); table.appendChild(hr);
    rows.forEach(r => table.appendChild(r));
}

function selectTab(name) {
    document.querySelectorAll("#result-tabs .tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    ["race", "stewards", "drivers", "teams"].forEach(n => $("tab-" + n).classList.toggle("hidden", n !== name));
}

function showResults() {
    const race = game.race; if (!race || game.resultsShown) return;
    game.resultsShown = true;
    const se = game.season, cls = classification(race);
    const roundNo = se.round + 1;
    const out = seasonApply(se, race, cls);
    let champs = null;
    if (se.done) champs = seasonFinish(se);
    saveSeason();

    const def = race.def;
    $("results-title").textContent = (game.single ? "" : "ETAPA " + roundNo + "/" + se.order.length + " · ") + def.gp + " — " + def.name;

    // --- corrida
    const rows = cls.map(r => {
        const c = r.car, tr = el("tr", c.isPlayer ? "player-team" : "");
        tr.appendChild(el("td", "", c.dnf || c.dsq ? "-" : String(r.pos)));
        const tdi = el("td"); const img = document.createElement("img"); img.src = faceURL(c.face, c); img.alt = ""; tdi.appendChild(img); tr.appendChild(tdi);
        const tdn = el("td", "", c.name);
        if (race.fastest && race.fastest.car === c) tdn.appendChild(el("span", "tag", "VR " + formatLap(race.fastest.time)));
        if (c.sub) tdn.appendChild(el("span", "tag", "RESERVA"));
        if (c.crash) tdn.appendChild(el("span", "tag ban", "ACIDENTE"));
        tr.appendChild(tdn);
        const tdt = el("td"); const dot = el("span", "dot"); dot.style.background = c.color; tdt.appendChild(dot); tdt.appendChild(document.createTextNode(c.team)); tr.appendChild(tdt);
        const tdg = el("td", "", r.gap);
        if (c.penaltyFrames) tdg.appendChild(el("span", "tag pen", "+20s 2 COMP."));
        if (c.servedSeconds) tdg.appendChild(el("span", "tag pen", "CUMPRIU " + c.servedSeconds + "s"));
        if (c.penPending > 0 && !c.dsq) tdg.appendChild(el("span", "tag pen", "+" + c.penPending + "s"));
        tr.appendChild(tdg);
        tr.appendChild(el("td", "", String(c.pits)));
        tr.appendChild(el("td", "pts", r.points ? "+" + r.points : ""));
        return tr;
    });
    fillTable($("results-table"), ["POS", "", "PILOTO", "EQUIPE", "TEMPO", "PIT", "PTS"], rows);

    // --- comissários
    const pens = race.penalties.slice();
    const totalFine = pens.filter(p => p.kind === "fine").reduce((a, p) => a + p.euros, 0);
    let sum = pens.length + " DECISÕES · " + (race.incidents || []).length + " INCIDENTES · MULTAS TOTAIS: " + fmtEuro(totalFine) + "\nCLIMA: " + WX_KINDS[race.weather.kind].label + (race.weather.anyWet ? " (REGRA DOS 2 COMPOSTOS DISPENSADA)" : "");
    out.newBans.forEach(k => { sum += "\nSUSPENSO NA PRÓXIMA CORRIDA (12 PONTOS NA LICENÇA): " + k.replace("|", " — ").toUpperCase(); });
    $("stewards-summary").textContent = sum;
    const prow = pens.map(e => {
        const car = race.cars.find(c => c.id === e.carId);
        const tr = el("tr", car && car.isPlayer ? "player-team" : "");
        tr.appendChild(el("td", "", e.kind === "grid" ? "GRID" : String(e.lap)));
        tr.appendChild(el("td", "", e.driver));
        tr.appendChild(el("td", "", e.team));
        const tp = el("td", "", penText(e));
        if (e.kind === "time" || e.kind === "drive" || e.kind === "grid" || e.kind === "dsq") tp.className = "warn";
        tr.appendChild(tp);
        tr.appendChild(el("td", "", e.reason));
        return tr;
    });
    (race.incidents || []).forEach(inc => {
        const tr = el("tr", race.playerCars.some(c => c.name === inc.driver) ? "player-team" : "");
        tr.appendChild(el("td", "", String(inc.lap)));
        tr.appendChild(el("td", "", inc.driver));
        tr.appendChild(el("td", "", inc.team));
        tr.appendChild(el("td", "warn", "INCIDENTE"));
        tr.appendChild(el("td", "", inc.text));
        prow.push(tr);
    });
    if (!prow.length) { const tr = el("tr"); tr.appendChild(el("td", "", "–")); tr.appendChild(el("td", "", "CORRIDA LIMPA: NENHUMA DECISÃO DOS COMISSÁRIOS")); prow.push(tr); }
    fillTable($("stewards-table"), ["VOLTA", "PILOTO", "EQUIPE", "DECISÃO", "MOTIVO"], prow);

    // --- pilotos
    const mineD = new Set(race.playerCars.map(c => c.name + "|" + c.team));
    const drows = driverTable(se).map((d, i) => {
        const tr = el("tr", mineD.has(d.key) ? "player-team" : "");
        tr.appendChild(el("td", "", String(i + 1)));
        const tn = el("td", "", d.name); if (d.ban) tn.appendChild(el("span", "tag ban", "SUSPENSO")); tr.appendChild(tn);
        tr.appendChild(el("td", "", d.team));
        tr.appendChild(el("td", "", d.wins + " V · " + d.podiums + " P"));
        tr.appendChild(el("td", "", d.lic + "/" + STEW.BAN_POINTS));
        tr.appendChild(el("td", "pts", String(d.pts)));
        return tr;
    });
    fillTable($("standings-table"), ["#", "PILOTO", "EQUIPE", "VITÓRIAS", "LICENÇA", "PTS"], drows);
    $("lic-hint").textContent = "LICENÇA: A CADA INFRAÇÃO GRAVE O PILOTO GANHA PONTOS. AO CHEGAR A 12, FICA UMA CORRIDA SUSPENSO E UM RESERVA ASSUME.";

    // --- construtores
    const mineT = race.playerCars[0].team;
    const trows = teamTable(se).map((t, i) => {
        const tr = el("tr", t.name === mineT ? "player-team" : "");
        tr.appendChild(el("td", "", String(i + 1)));
        tr.appendChild(el("td", "", t.name));
        tr.appendChild(el("td", "", String(t.wins)));
        tr.appendChild(el("td", "", t.fines ? fmtEuro(t.fines) : "–"));
        tr.appendChild(el("td", "pts", String(t.pts)));
        return tr;
    });
    fillTable($("teams-table"), ["#", "EQUIPE", "VITÓRIAS", "MULTAS", "PTS"], trows);
    let endTxt = "";
    if (champs) {
        endTxt = "🏆 FIM DA TEMPORADA!\nCAMPEÃO DE PILOTOS: " + champs.driver.toUpperCase() + "\nCAMPEÃ DE CONSTRUTORES: " + champs.team.toUpperCase();
        if (se.costCap.length) endTxt += "\nTETO DE GASTOS: " + se.costCap.map(c => c.team.toUpperCase() + " " + fmtEuro(c.euros)).join(" · ");
        else endTxt += "\nTETO DE GASTOS: NENHUMA EQUIPE MULTADA";
    }
    $("season-end").textContent = endTxt;

    const nb = $("next-gp-btn");
    if (se.done || game.single) {
        nb.textContent = game.single ? "NOVO GP ▶" : "NOVA TEMPORADA ▶";
        nb.dataset.mode = "menu";
    } else {
        nb.textContent = "PRÓXIMO: " + TRACKS[se.order[se.round]].name + " ▶";
        nb.dataset.mode = "next";
    }
    selectTab(champs ? "teams" : "race");
    $("results-modal").classList.remove("hidden");
}

function backToMenu() {
    cancelAnimationFrame(game.raf);
    clearTimeout(game.resultsTimer);
    $("results-modal").classList.add("hidden");
    showScreen("setup-screen");
    refreshContinue();
    updatePreview();
}

function initResultsButtons() {
    $("next-gp-btn").addEventListener("click", () => {
        if ($("next-gp-btn").dataset.mode === "next") startNextRound(); else backToMenu();
    });
    $("menu-btn").addEventListener("click", backToMenu);
    $("race-menu-btn").addEventListener("click", () => {
        if (game.race && game.race.phase !== "done" && !confirm("Voltar ao menu? A corrida atual será perdida (a temporada salva continua na etapa atual).")) return;
        backToMenu();
    });
    document.querySelectorAll("#result-tabs .tab").forEach(b => b.addEventListener("click", () => selectTab(b.dataset.tab)));
}

// ==========================================================
// CONTROLES: VELOCIDADE, PAUSA, TECLADO
// ==========================================================
function updateSpeedButtons() {
    document.querySelectorAll(".speed-btn[data-speed]").forEach(b => b.classList.toggle("active", +b.dataset.speed === game.speed));
    $("pause-btn").classList.toggle("paused", game.paused);
    $("pause-btn").textContent = game.paused ? "▶ CONTINUAR" : "⏸ PAUSA";
}
function togglePause() {
    game.paused = !game.paused; updateSpeedButtons();
    if (game.paused) showBanner("PAUSADO"); else if (game.race && game.race.phase !== "done" && !game.race.leaderFinished) $("race-banner").classList.add("hidden");
}
function initControls() {
    document.querySelectorAll(".speed-btn[data-speed]").forEach(b => b.addEventListener("click", () => { game.speed = +b.dataset.speed; updateSpeedButtons(); }));
    $("pause-btn").addEventListener("click", togglePause);
    document.addEventListener("keydown", e => {
        if (!$("race-screen").classList.contains("active") || !game.race) return;
        if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === " ") { e.preventDefault(); togglePause(); return; }
        const sp = { "1": 1, "2": 2, "3": 4, "4": 8 }[key];
        if (sp) { game.speed = sp; updateSpeedButtons(); return; }
        KEYMAP.forEach((m, k) => {
            const pi = m.pace.indexOf(key); if (pi >= 0) doPace(k, PACE_KEYS[pi]);
            const bi = m.pit.indexOf(key); if (bi >= 0) doPit(k, PIT_KEYS[bi]);
            if (key === m.accept) doAccept(k);
            if (key === m.boost) doBoost(k);
        });
    });
}

// ==========================================================
// LOOP (passo fixo de 60 Hz, independente do monitor)
// ==========================================================
function frame(now) {
    game.raf = requestAnimationFrame(frame);
    const race = game.race; if (!race) return;
    const dt = Math.min(now - game.last, 250); game.last = now;
    if (!game.paused) {
        game.acc += dt;
        let guard = 0;
        while (game.acc >= STEP_MS && guard < 6) {
            for (let s = 0; s < game.speed; s++) stepRace(race);
            game.acc -= STEP_MS; guard++;
        }
        if (guard === 6) game.acc = 0;
    }
    handleEvents(race);
    game.renderCount++;
    drawRaceFrame(game.ctx, race, game.bg, game.renderCount);
    if (game.renderCount % 5 === 0) {
        const lead = race.cars[0];
        $("lap-counter").textContent = race.phase === "countdown" ? "LARGADA" : Math.min(race.laps, Math.max(1, lead.finished ? race.laps : lead.lap)) + "/" + race.laps;
        updateLeaderboard(race);
        $("weather-status").textContent = weatherLabel(race.weather);
        $("track-wet").textContent = "PISTA: " + Math.round(race.weather.wet * 100) + "%";
        $("forecast").textContent = forecastText(race);
        $("sc-flag").textContent = race.sc ? (race.sc.kind === "SC" ? "🚨 SAFETY CAR" : "🟡 VSC") : race.yellow ? "🟨 AMARELA" : "";
    }
    updateCards(race);
}

// ==========================================================
window.addEventListener("DOMContentLoaded", () => {
    initSetup(); initControls(); initResultsButtons(); initQuali();
});
