"use strict";
// ==========================================================
// CLIMA E CONDIÇÕES DE PISTA (sem DOM)
// rain  = intensidade da chuva agora (0-1)
// wet   = quanto a pista está molhada (0 = seca, 1 = encharcada)
// ==========================================================

const WX_KINDS = {
    dry:    { label: "SECO" },
    light:  { label: "CHUVA FRACA" },
    heavy:  { label: "CHUVA FORTE" },
    starts: { label: "COMEÇA A CHOVER" },
    stops:  { label: "CHUVA QUE PARA" },
    shower: { label: "PANCADA" }
};

// segmentos de chuva em voltas: { a, b, i } (início, fim, intensidade)
function weatherSchedule(kind, laps, rng) {
    const L = laps;
    switch (kind) {
        case "light": return [{ a: -1, b: L + 1, i: 0.35 + rng() * 0.15 }];
        case "heavy": return [{ a: -1, b: L + 1, i: 0.8 + rng() * 0.2 }];
        case "starts": { const a = Math.max(2, Math.round(L * (0.3 + rng() * 0.25))); return [{ a, b: L + 1, i: 0.5 + rng() * 0.4 }]; }
        case "stops": { const b = Math.max(3, Math.round(L * (0.4 + rng() * 0.25))); return [{ a: -1, b, i: 0.55 + rng() * 0.3 }]; }
        case "shower": { const a = Math.max(2, Math.round(L * (0.25 + rng() * 0.3))); return [{ a, b: a + Math.max(2, Math.round(L * 0.25)), i: 0.8 + rng() * 0.2 }]; }
        default: return [];
    }
}

// sorteia o clima conforme a chance de chuva da pista
function pickWeather(def, rng) {
    const r = rng(), p = def.rain || 0.15;
    if (r > p) return "dry";
    const k = rng();
    return k < 0.28 ? "light" : k < 0.42 ? "heavy" : k < 0.68 ? "starts" : k < 0.86 ? "stops" : "shower";
}

function weatherInit(race, kind) {
    const rng = race.rng;
    if (!kind || kind === "random") kind = pickWeather(race.def, rng);
    const sched = weatherSchedule(kind, race.laps, rng);
    race.weather = {
        kind, sched, rain: 0, wet: 0, cloud: 0, anyWet: false,
        fcErr: (rng() - 0.5) * 1.6,        // erro da previsão, em voltas
        fcConf: 0.55 + rng() * 0.3
    };
    const w = race.weather;
    w.rain = rainAt(w, 0); w.wet = kind === "dry" ? 0 : (w.rain > 0 ? Math.min(0.9, 0.25 + w.rain * 0.6) : 0);
    w.cloud = w.rain > 0 ? 1 : (kind === "dry" ? (rng() < 0.4 ? 0.5 : 0) : 0.7);
    w.anyWet = w.wet > 0.3;
}

// chuva em um ponto da corrida (volta fracionária), com rampa de 0,7 volta
function rainAt(w, lapF) {
    let r = 0;
    w.sched.forEach(s => {
        const up = clamp((lapF - s.a) / 0.7, 0, 1), down = clamp((s.b - lapF) / 0.7, 0, 1);
        r = Math.max(r, s.i * Math.min(up, down));
    });
    return r;
}

function raceLapF(race) {
    const lead = race.cars[0];
    return race.phase === "countdown" ? 0 : Math.max(0, lead.dist);
}

function weatherStep(race) {
    const w = race.weather; if (!w) return;
    const lapF = raceLapF(race);
    w.rain = rainAt(w, lapF);
    const perFrame = 1 / race.framesPerLap;
    const target = w.rain > 0.02 ? Math.min(1, 0.22 + w.rain * 0.8) : 0;
    const rate = target > w.wet ? 0.55 : 0.16;      // molha rápido, seca devagar
    w.wet += (target - w.wet) * rate * perFrame * 1.6;
    if (target === 0 && w.wet < 0.01) w.wet = 0;
    w.wet = clamp(w.wet, 0, 1);
    const ct = w.rain > 0.02 ? 1 : (w.wet > 0.05 ? 0.6 : (w.kind === "dry" ? w.cloud : 0));
    w.cloud += (ct - w.cloud) * 0.002;
    if (w.wet > 0.3) w.anyWet = true;
}

// rendimento do pneu conforme a pista: 1 = ideal. Pneu errado custa caro.
function wetPerf(tyre, wet) {
    const sm = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
    if (tyre === "INTER") {
        const dryPen = Math.max(0, 0.22 - wet) / 0.22, wetPen = Math.max(0, wet - 0.6) / 0.4;
        return 0.985 - 0.045 * dryPen - 0.10 * wetPen;
    }
    if (tyre === "WET") {
        const dryPen = Math.max(0, 0.55 - wet) / 0.55;
        return 0.96 - 0.12 * dryPen;
    }
    return 1 - 0.30 * sm(0.05, 0.85, wet);     // pneus de pista seca
}
// desgaste extra por usar o pneu fora da condição ideal
function wetWearMult(tyre, wet) {
    if (tyre === "INTER") return 1 + 2.2 * Math.max(0, 0.22 - wet) / 0.22;
    if (tyre === "WET") return 1 + 3.5 * Math.max(0, 0.55 - wet) / 0.55;
    return 1 - 0.4 * wet;
}
// risco de perder tração: pneu de seco no molhado é muito pior
function gripRisk(tyre, wet) {
    if (wet < 0.05) return 1;
    if (tyre === "INTER") return 1 + 0.8 * wet + 3 * Math.max(0, wet - 0.7);
    if (tyre === "WET") return 1 + 0.4 * wet;
    return 1 + 9 * wet;
}

// pneu ideal para uma umidade percebida
function idealWetTyre(wet) {
    if (wet < 0.16) return null;           // pneu de pista seca
    return wet < 0.68 ? "INTER" : "WET";
}

function weatherLabel(w) {
    if (!w) return "☀️ SECO";
    if (w.rain > 0.65) return "⛈ CHUVA FORTE";
    if (w.rain > 0.02) return "🌧 CHUVA";
    if (w.wet > 0.4) return "☁️ PISTA MOLHADA";
    if (w.wet > 0.08) return "☁️ PISTA ÚMIDA";
    return w.cloud > 0.4 ? "☁️ NUBLADO" : "☀️ SECO";
}

// previsão para o jogador (com erro): texto curto
function forecastText(race) {
    const w = race.weather; if (!w) return "";
    const now = raceLapF(race);
    const shift = w.fcErr;
    let first = null, last = null;
    for (let d = 0; d <= race.laps - now + 1; d += 0.25) {
        const r = rainAt(w, now + d + shift);
        if (r > 0.1 && first == null) first = d;
        if (r > 0.1) last = d;
    }
    const conf = Math.round(w.fcConf * 100);
    const cur = rainAt(w, now + shift);
    if (first == null) return w.wet > 0.1 ? "PREVISÃO: PISTA SECANDO" : "PREVISÃO: SEM CHUVA";
    if (cur > 0.1) {
        const endIn = last >= race.laps - now ? null : Math.round(last);
        return endIn == null ? "PREVISÃO: CHUVA ATÉ O FIM" : "PREVISÃO: CHUVA PARA EM ~" + Math.max(1, endIn) + " VOLTAS (" + conf + "%)";
    }
    return "PREVISÃO: CHUVA EM ~" + Math.max(1, Math.round(first)) + " VOLTAS (" + conf + "%)";
}
