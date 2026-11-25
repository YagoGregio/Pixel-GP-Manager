"use strict";
// ==========================================================
// ARTE: sprites dos carros, rostos dos pilotos e desenho das pistas
// ==========================================================

// ---------- utilidades de cor
function hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map(x => x + x).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}
// amt < 0 escurece, amt > 0 clareia
function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
    return rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
}
function mixColor(a, b, k) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function newCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function px(c, color, x, y, w, h) { c.fillStyle = color; c.fillRect(x, y, w, h); }

// ==========================================================
// CARRO (sprite 36x16 visto de cima, voltado para a direita)
// ==========================================================
const _carCache = {};
function carSprite(primary, secondary) {
    const key = primary + "|" + secondary;
    if (_carCache[key]) return _carCache[key];
    const cv = newCanvas(36, 16), c = cv.getContext("2d");
    const dark = shade(primary, -0.38), mid = shade(primary, -0.18), light = shade(primary, 0.35);
    const carbon = "#14151b", carbon2 = "#23252e";

    // pneus traseiros e dianteiros (com banda de rodagem e brilho)
    [[5, 0, 9, 4], [5, 12, 9, 4], [22, 1, 7, 3], [22, 12, 7, 3]].forEach(([x, y, w, h]) => {
        px(c, "#0a0a0c", x, y, w, h);
        px(c, "#26272d", x + 1, y + 1, w - 2, 1);
        for (let i = x + 1; i < x + w - 1; i += 2) px(c, "#17181c", i, y + h - 1, 1, 1);
    });
    // braços da suspensão
    px(c, carbon2, 9, 4, 1, 2); px(c, carbon2, 9, 10, 1, 2);
    px(c, carbon2, 24, 4, 1, 2); px(c, carbon2, 24, 10, 1, 2);

    // asa traseira: plano principal + endplates na cor secundária
    px(c, carbon, 0, 3, 3, 10);
    px(c, "#3a3d48", 1, 3, 1, 10);
    px(c, secondary, 0, 2, 4, 1); px(c, secondary, 0, 13, 4, 1);
    px(c, "#ff3b30", 0, 7, 1, 2);                 // luz traseira

    // assoalho, sidepods e carenagem do motor
    px(c, carbon, 3, 6, 4, 4);
    px(c, mid, 7, 5, 14, 6);
    px(c, primary, 9, 4, 11, 8);
    px(c, light, 9, 4, 11, 1);                    // brilho na borda superior
    px(c, dark, 9, 11, 11, 1);                    // sombra na borda inferior
    px(c, dark, 20, 5, 1, 6);
    px(c, primary, 4, 6, 6, 4);
    px(c, light, 4, 6, 6, 1);
    px(c, dark, 4, 9, 6, 1);
    // entrada de ar e listra da pintura (livery)
    px(c, secondary, 5, 7, 16, 2);
    px(c, "#ffffff", 5, 7, 16, 1);
    px(c, secondary, 5, 8, 16, 1);
    px(c, carbon, 20, 4, 1, 1); px(c, carbon, 20, 11, 1, 1);

    // bico
    px(c, primary, 21, 6, 6, 4);
    px(c, light, 21, 6, 6, 1);
    px(c, dark, 21, 9, 6, 1);
    px(c, primary, 27, 7, 4, 2);
    px(c, secondary, 29, 7, 2, 2);
    px(c, carbon, 31, 7, 1, 2);

    // asa dianteira
    px(c, carbon, 31, 2, 3, 12);
    px(c, "#3a3d48", 32, 2, 1, 12);
    px(c, secondary, 31, 1, 5, 1); px(c, secondary, 31, 14, 5, 1);
    px(c, carbon, 30, 4, 1, 1); px(c, carbon, 30, 11, 1, 1);

    // cockpit, capacete, halo
    px(c, carbon, 12, 5, 6, 6);
    px(c, secondary, 13, 6, 3, 4);
    px(c, "#ffffff", 13, 6, 3, 1);
    px(c, "#0c0d12", 15, 7, 1, 2);                // viseira
    px(c, "#a9aeb8", 12, 5, 1, 6);                // halo (arco traseiro)
    px(c, "#a9aeb8", 17, 6, 1, 4);                // halo (arco dianteiro)
    px(c, "#a9aeb8", 13, 5, 4, 1); px(c, "#a9aeb8", 13, 10, 4, 1);

    _carCache[key] = cv;
    return cv;
}

// ==========================================================
// ROSTOS (retratos em pixel art, 24x24)
// ==========================================================
const _faceCache = {};
function faceCanvas(f, team) {
    const key = JSON.stringify(f) + "|" + team.color + "|" + team.secondary;
    if (_faceCache[key]) return _faceCache[key];
    const cv = newCanvas(24, 24), c = cv.getContext("2d");
    const skin = f.skinHex || SKIN_TONES[f.s] || SKIN_TONES[1];
    const skinD = shade(skin, -0.2), skinL = shade(skin, 0.1), hair = f.h, hairL = shade(hair, 0.22), hairD = shade(hair, -0.3);

    // fundo com a cor da equipe
    px(c, shade(team.color, -0.6), 0, 0, 24, 24);
    px(c, shade(team.color, -0.45), 0, 12, 24, 12);
    for (let i = 0; i < 24; i += 4) px(c, shade(team.color, -0.5), i, 0, 2, 24);
    // macacão e ombros
    px(c, team.color, 2, 19, 20, 5);
    px(c, shade(team.color, -0.3), 2, 22, 20, 2);
    px(c, team.secondary, 2, 21, 20, 1);
    px(c, "#ffffff", 8, 19, 8, 1);
    px(c, team.secondary, 10, 20, 4, 1);
    // pescoço
    px(c, skinD, 10, 16, 4, 4);
    // orelhas
    px(c, skinD, 5, 9, 1, 3); px(c, skinD, 18, 9, 1, 3);
    // cabeça
    px(c, skin, 8, 4, 8, 1); px(c, skin, 7, 5, 10, 1); px(c, skin, 6, 6, 12, 9);
    px(c, skin, 7, 15, 10, 1); px(c, skin, 8, 16, 8, 1); px(c, skin, 9, 17, 6, 1);
    px(c, skinD, 16, 8, 2, 7); px(c, skinD, 15, 15, 2, 1); px(c, skinD, 14, 16, 2, 1);
    px(c, skinL, 8, 12, 2, 1);

    // cabelo (atrás do rosto: laterais compridas)
    if (f.st === "long") { px(c, hair, 4, 6, 3, 12); px(c, hair, 17, 6, 3, 12); px(c, hairD, 4, 14, 3, 4); px(c, hairD, 17, 14, 3, 4); }

    // olhos e sobrancelhas
    px(c, "#ffffff", 8, 10, 3, 1); px(c, "#ffffff", 13, 10, 3, 1);
    px(c, "#1b1b24", 9, 10, 1, 1); px(c, "#1b1b24", 14, 10, 1, 1);
    px(c, shade(skin, -0.35), 8, 11, 3, 1); px(c, shade(skin, -0.35), 13, 11, 3, 1);
    const brow = f.st === "bald" || f.st === "buzz" ? shade(hair, 0) : hair;
    px(c, brow, 8, 8, 3, 1); px(c, brow, 13, 8, 3, 1);
    // nariz
    px(c, skinD, 11, 12, 2, 1); px(c, skinD, 11, 13, 1, 1);

    // barba
    if (f.b === "stubble") {
        c.globalAlpha = 0.38; px(c, hair, 7, 12, 10, 4); px(c, hair, 8, 16, 8, 1); px(c, hair, 9, 17, 6, 1); c.globalAlpha = 1;
    } else if (f.b === "beard") {
        px(c, hair, 6, 12, 12, 3); px(c, hair, 7, 15, 10, 2); px(c, hair, 8, 17, 8, 1); px(c, hairD, 9, 13, 6, 1);
    } else if (f.b === "goatee") {
        px(c, hair, 9, 13, 6, 1); px(c, hair, 10, 15, 4, 3);
    }
    // boca
    px(c, f.b === "beard" || f.b === "goatee" ? "#c47a6a" : "#9c4f4f", 10, 14, 4, 1);

    // cabelo (por cima)
    switch (f.st) {
        case "short":
            px(c, hair, 8, 2, 8, 1); px(c, hair, 6, 3, 12, 3); px(c, hair, 5, 5, 2, 4); px(c, hair, 17, 5, 2, 4);
            px(c, hairL, 9, 3, 4, 1); px(c, hairD, 15, 4, 3, 1); break;
        case "slick":
            px(c, hair, 8, 1, 9, 1); px(c, hair, 6, 2, 12, 4); px(c, hair, 5, 5, 2, 3); px(c, hair, 17, 5, 2, 3);
            px(c, hairL, 8, 2, 8, 1); px(c, hairL, 7, 3, 3, 1); px(c, hairD, 6, 5, 12, 1); break;
        case "curly":
            px(c, hair, 6, 2, 12, 4); px(c, hair, 5, 3, 14, 5); px(c, hair, 5, 8, 1, 2); px(c, hair, 18, 8, 1, 2);
            [[7, 1], [10, 1], [13, 1], [16, 1], [4, 4], [19, 4]].forEach(([x, y]) => px(c, hair, x, y, 2, 1));
            px(c, hairL, 8, 3, 2, 1); px(c, hairL, 13, 2, 2, 1); px(c, hairD, 7, 6, 3, 1); px(c, hairD, 14, 6, 3, 1); break;
        case "messy":
            px(c, hair, 7, 3, 10, 3); px(c, hair, 5, 5, 2, 4); px(c, hair, 17, 5, 2, 4); px(c, hair, 7, 6, 4, 1);
            [[8, 2], [10, 1], [12, 2], [14, 1], [16, 2], [6, 4], [18, 4]].forEach(([x, y]) => px(c, hair, x, y, 1, 2));
            px(c, hairL, 9, 3, 3, 1); break;
        case "long":
            px(c, hair, 8, 2, 8, 1); px(c, hair, 6, 3, 12, 3); px(c, hair, 5, 5, 2, 5); px(c, hair, 17, 5, 2, 5); px(c, hairL, 9, 3, 4, 1); break;
        case "buzz": {
            const sc = mixColor(skin, hair, 0.55);
            px(c, sc, 7, 4, 10, 2); px(c, sc, 6, 5, 1, 3); px(c, sc, 17, 5, 1, 3); break;
        }
        case "receding":
            px(c, hair, 7, 3, 10, 2); px(c, hair, 6, 4, 2, 4); px(c, hair, 16, 4, 2, 4); px(c, hair, 5, 6, 1, 3); px(c, hair, 18, 6, 1, 3);
            px(c, mixColor(skin, hair, 0.35), 8, 5, 8, 1); break;
        case "bald":
            px(c, skinL, 9, 4, 4, 1); px(c, mixColor(skin, hair, 0.35), 6, 8, 1, 2); px(c, mixColor(skin, hair, 0.35), 17, 8, 1, 2); break;
    }
    _faceCache[key] = cv;
    return cv;
}
function faceURL(f, team) { const cv = faceCanvas(f, team); if (!cv._url) cv._url = cv.toDataURL(); return cv._url; }

// ==========================================================
// TEMAS DE PISTA
// ==========================================================
const THEMES = {
    grass:  { ground: "#3f8f3a", g1: "#4aa145", g2: "#357d31", stripe: "rgba(255,255,255,.035)", runoff: ["#cdb98a", "#bfa977", "#d8c797"], asphalt: ["#3a3e46", "#444851", "#32363d"], pit: "#454a55", water: "#2f78c4", trees: 70, tree: ["#1d5527", "#2a7433", "#3d9442"], kind: "tree" },
    forest: { ground: "#2d6a33", g1: "#36793a", g2: "#255c2b", stripe: "rgba(255,255,255,.025)", runoff: ["#c5b283", "#b6a272", "#d1c08f"], asphalt: ["#3a3e46", "#444851", "#32363d"], pit: "#454a55", water: "#2f78c4", trees: 200, tree: ["#14391d", "#1d5226", "#2a7231"], kind: "tree" },
    dunes:  { ground: "#d6c088", g1: "#e2cd98", g2: "#c9b076", stripe: null, runoff: ["#efe1b4", "#e6d6a4", "#f5e9c4"], asphalt: ["#3d414a", "#474b54", "#353941"], pit: "#4b505b", water: "#2b6fb8", trees: 34, tree: ["#4c6b3a", "#5e8147", "#779c58"], kind: "shrub" },
    city:   { ground: "#797d87", g1: "#848893", g2: "#6e727c", stripe: null, runoff: ["#5a5f6b", "#51565f", "#646975"], asphalt: ["#30333a", "#3a3d45", "#2a2d33"], pit: "#3b3f48", water: "#2c82cc", trees: 0, buildings: 70, bcolors: ["#d8c7a0", "#c9a98a", "#e8e0d0", "#b8b2a8", "#d9a37c", "#c2cbd6"], kind: "building", wall: "#d8d8de" },
    night:  { ground: "#0b0e1c", g1: "#11152b", g2: "#070914", stripe: null, runoff: ["#161b34", "#1c2240", "#12162b"], asphalt: ["#262a36", "#2e3240", "#1f222c"], pit: "#2d3140", water: "#10244d", trees: 0, buildings: 58, bcolors: ["#1a1f3a", "#241a3d", "#12263a"], kind: "neon", wall: "#3b4166", neon: "#ff3df0", kerbA: "#ff3df0", kerbB: "#27f0ff" },
    desert: { ground: "#e0ca90", g1: "#ead7a1", g2: "#d2b97c", stripe: null, runoff: ["#f2e6bf", "#eadcae", "#f8eecc"], asphalt: ["#3d414a", "#474b54", "#353941"], pit: "#4b505b", water: "#1fa3c9", trees: 30, tree: ["#2f6b3a", "#3f8a48", "#58a85a"], kind: "palm" }
};

function noiseTile(colors, density = 0.35, size = 32, seed = 1) {
    const rng = mulberry32(seed), cv = newCanvas(size, size), c = cv.getContext("2d");
    px(c, colors[0], 0, 0, size, size);
    for (let i = 0; i < size * size * density; i++) px(c, colors[1 + Math.floor(rng() * (colors.length - 1))], Math.floor(rng() * size), Math.floor(rng() * size), 1 + (rng() < 0.2 ? 1 : 0), 1);
    return cv;
}

function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

// ==========================================================
// PISTA (desenhada uma vez numa imagem de fundo)
// ==========================================================
function renderTrackBackground(track, playerTeamColor) {
    const W = CANVAS_W, H = CANVAS_H, T = track, def = T.def;
    const th = THEMES[def.theme] || THEMES.grass;
    const rng = mulberry32(hashStr(def.id));
    const cv = newCanvas(W, H), c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;

    const trackPath = () => { c.beginPath(); c.moveTo(T.X[0], T.Y[0]); for (let i = 1; i < T.N; i++) c.lineTo(T.X[i], T.Y[i]); c.closePath(); };
    const loopPoly = []; for (let i = 0; i < T.N; i += 2) loopPoly.push([T.X[i], T.Y[i]]);
    const waterPolys = (def.water || []).map(poly => poly.map(p => T.tf(p[0], p[1])));
    const sx = [], sy = []; for (let i = 0; i < T.N; i += 3) { sx.push(T.X[i]); sy.push(T.Y[i]); }
    const dTrack = (x, y) => { let m = 1e9; for (let i = 0; i < sx.length; i++) { const d = (sx[i] - x) ** 2 + (sy[i] - y) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
    const inWater = (x, y) => waterPolys.some(p => pointInPoly(x, y, p)) || (def.lake && pointInPoly(x, y, loopPoly));

    // ----- chão com textura
    c.fillStyle = c.createPattern(noiseTile([th.ground, th.g1, th.g2], 0.5, 48, hashStr(def.id)), "repeat");
    c.fillRect(0, 0, W, H);
    if (th.stripe) for (let x = -40; x < W + 40; x += 32) { px(c, th.stripe, x, 0, 16, H); }
    // manchas maiores de relevo
    c.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) { c.fillStyle = rng() < 0.5 ? "#000" : "#fff"; const w = 20 + rng() * 60, h = 10 + rng() * 30; c.fillRect(rng() * W, rng() * H, w, h); }
    c.globalAlpha = 1;

    // ----- água (mar, marina, lago)
    const paintWater = (clipFn) => {
        c.save(); clipFn(); c.clip();
        px(c, th.water, 0, 0, W, H);
        c.fillStyle = shade(th.water, 0.18);
        for (let i = 0; i < 420; i++) c.fillRect(Math.floor(rng() * W), Math.floor(rng() * H), 4 + Math.floor(rng() * 6), 1);
        c.fillStyle = shade(th.water, -0.2);
        for (let i = 0; i < 260; i++) c.fillRect(Math.floor(rng() * W), Math.floor(rng() * H), 3 + Math.floor(rng() * 5), 1);
        c.restore();
    };
    waterPolys.forEach(poly => paintWater(() => { c.beginPath(); poly.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }));
    if (def.lake) paintWater(trackPath);

    // ----- decoração (fora da pista)
    const items = [];
    const want = th.trees || th.buildings || 0;
    const count = (th.buildings || th.trees);
    let tries = 0;
    while (items.length < count && tries < count * 40) {
        tries++;
        const x = 6 + rng() * (W - 12), y = 6 + rng() * (H - 12);
        const minD = th.kind === "building" || th.kind === "neon" ? 52 : 46;
        if (inWater(x, y)) continue;
        if (dTrack(x, y) < minD) continue;
        if (items.some(it => Math.abs(it.x - x) < 16 && Math.abs(it.y - y) < 14)) continue;
        items.push({ x, y, r: rng(), r2: rng(), r3: rng() });
    }
    items.sort((a, b) => a.y - b.y);

    // ----- zona de escape (cascalho / concreto)
    const runTex = c.createPattern(noiseTile(th.runoff, 0.4, 32, 7), "repeat");
    c.lineJoin = "round"; c.lineCap = "round";
    if (th.kind === "building" || th.kind === "neon") {
        trackPath(); c.lineWidth = 50; c.strokeStyle = th.wall; c.stroke();     // muro
        trackPath(); c.lineWidth = 46; c.strokeStyle = th.runoff[0]; c.stroke();
        if (th.neon) { trackPath(); c.lineWidth = 50; c.strokeStyle = th.neon; c.globalAlpha = 0.5; c.setLineDash([2, 6]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
    } else {
        trackPath(); c.lineWidth = 62; c.strokeStyle = runTex; c.stroke();
        trackPath(); c.lineWidth = 62; c.strokeStyle = "rgba(0,0,0,.10)"; c.setLineDash([1, 5]); c.stroke(); c.setLineDash([]);
    }
    // ----- faixa branca de borda + asfalto texturizado
    trackPath(); c.lineWidth = 37; c.strokeStyle = "#e9e9ec"; c.stroke();
    trackPath(); c.lineWidth = 34; c.strokeStyle = c.createPattern(noiseTile(th.asphalt, 0.45, 32, 11), "repeat"); c.stroke();
    // linha de corrida (borracha) e tracejado central
    trackPath(); c.lineWidth = 11; c.strokeStyle = "rgba(0,0,0,.14)"; c.stroke();
    trackPath(); c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.22)"; c.setLineDash([6, 12]); c.stroke(); c.setLineDash([]);

    // ----- zebras nas curvas (lado de dentro)
    const ka = th.kerbA || "#e10600", kb = th.kerbB || "#ffffff";
    for (let i = 0; i < T.N; i++) {
        const cv0 = T.CURV[i];
        if (Math.abs(cv0) < 0.0105) continue;
        const side = Math.sign(cv0);
        const lat = side * (TRACK_HALF + 2);
        const x = T.X[i] - T.TY[i] * lat, y = T.Y[i] + T.TX[i] * lat;
        c.fillStyle = Math.floor(T.cum[i] / 5) % 2 ? ka : kb;
        c.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }

    // ----- grid, linha de largada e pórtico
    const P0 = T.at(0), L = T.length;
    c.save(); c.translate(P0.x, P0.y); c.rotate(P0.angle);
    c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
        const row = Math.floor(i / 2), odd = i % 2;
        const dx = -(18 + row * SIM.GRID_ROW_PX + (odd ? 18 : 0)) - 3, dy = odd ? 7 : -7;
        const q = T.at(-(18 + row * SIM.GRID_ROW_PX + (odd ? 18 : 0)) / L, dy);
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        c.translate(q.x, q.y); c.rotate(q.angle);
        c.strokeRect(-6, -4, 12, 8); c.restore();
    }
    for (let r = 0; r < 8; r++) for (let k = 0; k < 2; k++) px(c, (r + k) % 2 ? "#ffffff" : "#101014", -4 + k * 4, -17 + r * 4.25, 4, 4.25);
    px(c, "#15161c", -2, -24, 3, 48);       // pórtico atravessando a pista
    for (let k = 0; k < 5; k++) px(c, "#3b1010", -2, -16 + k * 7, 3, 3);
    px(c, "#2b2e3a", -4, -26, 7, 3); px(c, "#2b2e3a", -4, 23, 7, 3);
    c.restore();

    // ----- pit lane, boxes das equipes e prédio
    const pit = T.pit, side = pit.side;
    const polyAt = (f0, f1, lat0) => { const pts = []; for (let k = 0; k <= 40; k++) { const f = f0 + (f1 - f0) * k / 40; const p = T.at(-pit.half + f * pit.span, pit.lateral(f) + (lat0 || 0) * side * smooth(f / 0.24) * (1 - smooth((f - 0.76) / 0.24))); pts.push(p); } return pts; };
    const stroke = (pts, w, col) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.lineWidth = w; c.strokeStyle = col; c.lineCap = "butt"; c.stroke(); };
    const lane = polyAt(0, 1, 0);
    stroke(lane, 14, "rgba(255,255,255,.75)");
    stroke(lane, 11, th.pit);
    // prédio dos boxes
    const bld = []; for (let k = 0; k <= 30; k++) { const f = 0.26 + 0.48 * k / 30; bld.push(T.at(-pit.half + f * pit.span, side * (PIT_OFFSET + 14))); }
    stroke(bld, 12, "#1b1e27"); stroke(bld, 10, "#262a36");
    const slots = []; TEAMS_2026.forEach(t => slots.push(t.color)); slots.splice(5, 0, playerTeamColor || "#00e676");
    slots.forEach((col, k) => {
        const f = 0.27 + 0.46 * (k + 0.5) / slots.length;
        const q = T.at(-pit.half + f * pit.span, side * (PIT_OFFSET + 7));
        c.save(); c.translate(q.x, q.y); c.rotate(q.angle); px(c, col, -2, -3, 4, 6); px(c, "#0d0e12", -2, -3, 4, 1); c.restore();
    });

    // ----- arquibancadas na reta principal (lado oposto aos boxes)
    for (let k = 0; k < 18; k++) {
        const p = -0.06 + 0.13 * k / 18;
        const q = T.at(p, -side * 40);
        c.save(); c.translate(q.x, q.y); c.rotate(q.angle);
        px(c, "#2b2e38", -4, -7, 8, 14);
        for (let j = 0; j < 10; j++) px(c, ["#e10600", "#fff", "#ffd400", "#29b6f6", "#ff8000", "#6bd16b"][Math.floor(rng() * 6)], -3 + rng() * 5, -6 + (j * 1.3), 2, 2);
        px(c, "#5a5f70", -4, -7, 8, 1);
        c.restore();
    }
    // faixa de patrocínio
    const spons = []; for (let k = 0; k <= 20; k++) spons.push(T.at(-0.06 + 0.13 * k / 20, -side * 31));
    stroke(spons, 3, def.theme === "night" ? "#ff3df0" : "#f5f5f5");

    // ----- itens de decoração
    items.forEach(it => {
        if (th.kind === "tree") drawTree(c, it, th.tree, def.theme === "forest");
        else if (th.kind === "shrub") drawShrub(c, it, th.tree);
        else if (th.kind === "palm") drawPalm(c, it, th.tree);
        else if (th.kind === "building") drawBuilding(c, it, th, false);
        else if (th.kind === "neon") drawBuilding(c, it, th, true);
    });

    drawZones(c, T);
    return cv;
}

// zonas de modo reta (asa ativa): faixa verde na pista + setas; marca de perigo onde termina uma zona de risco alto
function drawZones(c, T) {
    (T.def.zones || []).forEach(z => {
        const len = ((z.b - z.a) % 1 + 1) % 1, steps = Math.max(6, Math.round(len * 160));
        c.save();
        c.globalAlpha = 0.22; c.strokeStyle = "#00e676"; c.lineWidth = 9; c.lineCap = "butt";
        c.beginPath();
        for (let k = 0; k <= steps; k++) { const q = T.at(z.a + len * k / steps, 0); if (k) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }
        c.stroke();
        c.globalAlpha = 1;
        const n = Math.max(2, Math.round(len * 38));
        for (let k = 0; k < n; k++) {
            const q = T.at(z.a + len * (k + 0.5) / n, 0);
            c.save(); c.translate(q.x, q.y); c.rotate(q.angle);
            c.fillStyle = "#b9f6ca"; c.fillRect(-1, -1, 2, 2); c.fillRect(-2, -3, 2, 1); c.fillRect(-2, 2, 2, 1); c.fillRect(-3, -4, 1, 1); c.fillRect(-3, 3, 1, 1);
            c.restore();
        }
        // início (verde) e fim da zona (amarelo/vermelho conforme o risco)
        [[z.a, "#00e676"], [z.b, z.sev >= 0.8 ? "#ff3d3d" : "#ffea00"]].forEach(([p, col], idx) => {
            const q = T.at(p, 0);
            c.save(); c.translate(q.x, q.y); c.rotate(q.angle);
            c.fillStyle = col; c.fillRect(-1, -TRACK_HALF - 4, 3, 5); c.fillRect(-1, TRACK_HALF - 1, 3, 5);
            c.restore();
        });
    });
}

function drawTree(c, it, pal, dense) {
    const r = 5 + Math.floor(it.r * 4), x = Math.round(it.x), y = Math.round(it.y);
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(x - r + 2, y - r + 3, r * 2, r * 2 - 1);
    c.fillStyle = pal[0]; c.fillRect(x - r, y - r + 1, r * 2, r * 2 - 2); c.fillRect(x - r + 1, y - r, r * 2 - 2, r * 2);
    c.fillStyle = pal[1]; c.fillRect(x - r + 1, y - r + 1, r * 2 - 3, r * 2 - 3);
    c.fillStyle = pal[2]; c.fillRect(x - r + 2, y - r + 2, Math.max(2, r - 2), Math.max(2, r - 2));
    c.fillStyle = pal[0]; c.fillRect(x + 1, y + 1, 2, 2);
}
function drawShrub(c, it, pal) {
    const x = Math.round(it.x), y = Math.round(it.y), r = 3 + Math.floor(it.r * 3);
    c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(x - r + 1, y - r + 2, r * 2, r * 2 - 2);
    c.fillStyle = pal[0]; c.fillRect(x - r, y - r, r * 2, r * 2 - 1);
    c.fillStyle = pal[1]; c.fillRect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 3);
    c.fillStyle = pal[2]; c.fillRect(x - r + 2, y - r + 1, 2, 2);
}
function drawPalm(c, it, pal) {
    const x = Math.round(it.x), y = Math.round(it.y);
    c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect(x - 6, y + 1, 14, 5);
    c.fillStyle = pal[0];
    for (let a = 0; a < 6; a++) { const ang = a * Math.PI / 3 + it.r; for (let k = 2; k < 8; k++) c.fillRect(Math.round(x + Math.cos(ang) * k), Math.round(y + Math.sin(ang) * k), 2, 2); }
    c.fillStyle = pal[2]; c.fillRect(x - 1, y - 1, 3, 3);
    c.fillStyle = "#6b4a2c"; c.fillRect(x, y, 1, 1);
}
function drawBuilding(c, it, th, neon) {
    const w = 18 + Math.floor(it.r * 22), h = 14 + Math.floor(it.r2 * 20);
    const x = Math.round(it.x - w / 2), y = Math.round(it.y - h / 2);
    const base = th.bcolors[Math.floor(it.r3 * th.bcolors.length)];
    c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(x + 3, y + 4, w, h);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    c.fillStyle = shade(base, 0.12); c.fillRect(x, y, w, 2);
    c.fillStyle = shade(base, -0.25); c.fillRect(x, y + h - 2, w, 2); c.fillRect(x + w - 2, y, 2, h);
    if (neon) {
        const cols = ["#ffd54a", "#27f0ff", "#ff3df0", "#7dff7a"];
        for (let wy = y + 4; wy < y + h - 4; wy += 4) for (let wx = x + 3; wx < x + w - 4; wx += 4) {
            const v = ((wx * 7 + wy * 13) >> 2) % 5; if (v < 3) { c.fillStyle = cols[v]; c.fillRect(wx, wy, 2, 2); }
        }
        c.globalAlpha = 0.55; c.strokeStyle = cols[Math.floor(it.r3 * 3)]; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); c.globalAlpha = 1;
    } else {
        c.fillStyle = shade(base, -0.45);
        for (let wy = y + 4; wy < y + h - 4; wy += 4) for (let wx = x + 3; wx < x + w - 4; wx += 4) c.fillRect(wx, wy, 2, 2);
        if (it.r2 > 0.6) { c.fillStyle = "#c0562f"; c.fillRect(x + 2, y + 2, w - 4, 3); }
    }
}

// ==========================================================
// DESENHO DE CADA QUADRO
// ==========================================================
function drawRaceFrame(ctx, race, bg, tick) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0);

    const cars = race.cars;
    // do último para o primeiro: líderes ficam por cima
    for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        if (c.out) continue;
        if (c.dnf) { drawSmoke(ctx, c); }
        if (c.inPit && c.pitHold) drawCrew(ctx, c, tick);
        const wet = race.weather ? race.weather.wet : 0;
        if (wet > 0.25 && !c.dnf && !c.inPit && c.lastSpeed > 0) {            // borrifo atrás do carro
            ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
            for (let k = 0; k < 4; k++) {
                ctx.fillStyle = "rgba(225,235,245," + (0.28 * wet).toFixed(2) + ")";
                const o = 18 + k * 5 + ((tick + k * 3) % 6), s2 = 3 + k;
                ctx.fillRect(-o, -s2 / 2 + Math.sin(tick / 3 + k) * 2, s2, s2);
            }
            ctx.restore();
        }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle + (c.crash ? c.crash.rot : (c.drawRot || 0)));
        ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.fillRect(-15, -5, 33, 13);
        ctx.scale(0.9, 0.9);
        ctx.drawImage(carSprite(c.color, c.secondary), -18, -8);
        if (c.wing === "stuck" && Math.floor(tick / 6) % 2) { ctx.fillStyle = "#ff3d3d"; ctx.fillRect(-20, -9, 4, 2); ctx.fillRect(-20, 7, 4, 2); }
        ctx.restore();
        if (c.crash && !c.out) {                                                // bandeira amarela no local do acidente
            ctx.fillStyle = "#ffea00"; ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 20, 5, 5);
            ctx.fillStyle = "#000"; ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 15, 1, 8);
        }
    }
    // marcadores dos carros do jogador
    race.playerCars.forEach(c => {
        if (c.out) return;
        const label = c.dnf ? "DNF" : (c.finished ? "P" + c.pos : "P" + c.pos);
        ctx.font = "bold 9px 'Press Start 2P', monospace";
        const w = ctx.measureText(label).width + 6;
        const x = Math.round(c.x - w / 2), y = Math.round(c.y - 26);
        ctx.fillStyle = "rgba(0,0,0,.78)"; ctx.fillRect(x, y, w, 12);
        ctx.fillStyle = c.color; ctx.fillRect(x, y + 12, w, 2);
        ctx.fillStyle = "#ffea00"; ctx.textBaseline = "top"; ctx.fillText(label, x + 3, y + 2);
        ctx.fillStyle = "#ffea00"; ctx.fillRect(Math.round(c.x) - 1, y + 15, 3, 2);
    });
    if (race.sc && race.sc.kind === "SC") {                                  // safety car à frente do líder
        const lead = race.cars.find(c => !c.dnf && !c.out);
        if (lead) {
            const q = race.track.at(lead.progress + 34 / race.track.length, 0);
            ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.angle); ctx.scale(0.9, 0.9);
            ctx.drawImage(carSprite("#ffb300", "#111111"), -18, -8);
            if (Math.floor(tick / 5) % 2) { ctx.fillStyle = "#ff3d3d"; ctx.fillRect(-4, -3, 3, 2); ctx.fillStyle = "#29b6f6"; ctx.fillRect(-4, 1, 3, 2); }
            ctx.restore();
        }
    }
    drawWeather(ctx, race, tick);
    // semáforo de largada
    if (race.phase === "countdown") {
        const bx = CANVAS_W / 2 - 58, by = 10;
        ctx.fillStyle = "rgba(0,0,0,.85)"; ctx.fillRect(bx, by, 116, 28);
        ctx.fillStyle = "#3a3a44"; ctx.fillRect(bx, by, 116, 2);
        for (let k = 0; k < 5; k++) {
            ctx.fillStyle = k < race.lightsOn ? "#ff2a1f" : "#3a1512";
            ctx.fillRect(bx + 8 + k * 21, by + 7, 14, 14);
            if (k < race.lightsOn) { ctx.fillStyle = "#ff8a80"; ctx.fillRect(bx + 10 + k * 21, by + 9, 4, 4); }
        }
    }
}

// escurece com nuvens/chuva e desenha gotas
function drawWeather(ctx, race, tick) {
    const w = race.weather; if (!w) return;
    const dark = Math.max(w.cloud * 0.12, w.wet * 0.2, w.rain * 0.12);
    if (dark > 0.01) { ctx.fillStyle = "rgba(14,22,40," + dark.toFixed(3) + ")"; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }
    if (w.wet > 0.35) {                                                      // brilho de pista molhada
        ctx.fillStyle = "rgba(170,200,235," + (0.05 * w.wet).toFixed(3) + ")";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    if (w.rain > 0.02) {
        const n = Math.round(30 + 150 * w.rain);
        ctx.fillStyle = "rgba(190,215,255,0.55)";
        for (let i = 0; i < n; i++) {
            const sx = (i * 97.13 + tick * 3.1) % (CANVAS_W + 40) - 20, sy = (i * 53.7 + tick * 11.3 + i * i) % (CANVAS_H + 20);
            ctx.fillRect(Math.round(sx - sy * 0.12), Math.round(sy), 1, 5);
        }
    }
}

function drawSmoke(ctx, c) {
    const t = c.dnfTimer;
    for (let k = 0; k < 6; k++) {
        const age = (t + k * 14) % 80, a = 0.5 * (1 - age / 80);
        ctx.fillStyle = `rgba(210,210,215,${a.toFixed(2)})`;
        const r = 2 + age / 12;
        ctx.fillRect(Math.round(c.x - r + Math.sin(k * 2 + age / 9) * 4), Math.round(c.y - age / 4 - r), Math.round(r * 2), Math.round(r * 2));
    }
}

function drawCrew(ctx, c, tick) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    const spots = [[-11, -11], [-11, 11], [11, -11], [11, 11], [0, -13], [0, 13]];
    spots.forEach(([x, y], i) => {
        ctx.fillStyle = c.color; ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = "#f2d2b8"; ctx.fillRect(x - 1, y - 1, 2, 2);
    });
    if (Math.floor(tick / 4) % 2) { ctx.fillStyle = "#fff6a8"; ctx.fillRect(-12, -13, 2, 2); ctx.fillRect(10, 11, 2, 2); }
    ctx.restore();
}
