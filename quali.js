"use strict";
// ==========================================================
// CLASSIFICAÇÃO Q1 / Q2 / Q3 (sem DOM)
// 22 carros: Q1 elimina 6 (17º-22º), Q2 elimina 6 (11º-16º), Q3 decide os 10 primeiros.
// Cada carro faz 2 voltas rápidas por sessão. O jogador escolhe pneu e risco dos seus pilotos.
// ==========================================================

const QUALI = {
    SESSIONS: [{ name: "Q1", cut: 16 }, { name: "Q2", cut: 10 }, { name: "Q3", cut: 10 }],
    RISK: {
        safe:   { label: "CONSERVADOR", speed: 0.9985, err: 0.010 },
        normal: { label: "NORMAL",      speed: 1.0000, err: 0.035 },
        attack: { label: "ATAQUE",      speed: 1.0025, err: 0.095 }
    },
    LAPS: 2,
    TIME_FACTOR: 0.93      // volta de classificação é mais rápida que a de corrida
};

function qualiWetFor(kind) {
    return { light: 0.40, heavy: 0.85, stops: 0.55 }[kind] || 0;
}

function carKey(c) { return c.name + "|" + c.team; }

// race = corrida "prévia" só para ler o grid de carros
function qualiInit(race, kind) {
    const cars = race.cars.map(c => ({ key: carKey(c), car: c }));
    return {
        def: race.def, kind, wet: qualiWetFor(kind),
        field: cars.slice(), total: cars.length, session: 0, done: false,
        grid: [],                  // do pior para o melhor, preenchido a cada corte
        results: [],               // resultado de cada sessão
        choices: {}                // key -> { tyre, risk } (jogador)
    };
}

function defaultChoice(q, car) {
    const ideal = idealWetTyre(q.wet + (Math.random() - 0.5) * 0.1);
    return { tyre: ideal || "SOFT", risk: "normal" };
}

function qualiLapTime(def, score) {
    return def.lapSeconds * QUALI.TIME_FACTOR / score;
}

// roda a sessão atual; devolve a tabela ordenada
function qualiRunSession(q, rng) {
    if (q.done) return null;
    const S = QUALI.SESSIONS[q.session];
    const rows = q.field.map(f => {
        const c = f.car;
        const ch = c.isPlayer && q.choices[f.key] ? q.choices[f.key] : defaultChoice(q, c);
        const risk = QUALI.RISK[ch.risk] || QUALI.RISK.normal;
        const ty = TYRES[ch.tyre];
        const perf = ty.speed * wetPerf(ch.tyre, q.wet) * (1 - 0.03 * q.wet);
        let best = null, errors = 0;
        for (let L = 0; L < QUALI.LAPS; L++) {
            const noise = (rng() + rng() + rng() - 1.5) * 0.0018;
            const evo = L * 0.0012 * (1 - q.wet);                      // pista "borracha" na 2ª volta
            if (rng() < risk.err * (1 + 1.5 * q.wet) * (ty.wet && q.wet < 0.15 ? 1.5 : 1)) { errors++; continue; }   // volta anulada / erro
            const score = c.basePace * perf * risk.speed * (1 + noise + evo);
            const t = qualiLapTime(q.def, score);
            if (best == null || t < best) best = t;
        }
        return { key: f.key, car: c, time: best, errors, tyre: ch.tyre, risk: ch.risk };
    });
    rows.sort((a, b) => (a.time == null) - (b.time == null) || a.time - b.time);
    rows.forEach((r, i) => { r.pos = i + 1; r.gap = r.time == null ? null : r.time - rows[0].time; });
    const keep = q.session === 0 ? Math.max(10, q.total - 6) : S.cut;
    const out = rows.slice(keep);                                       // eliminados nesta sessão (Q3: nenhum)
    rows.forEach((r, i) => { r.out = q.session < 2 && i >= keep; });
    // eliminados ocupam as posições de trás do grid final
    if (q.session < 2) q.grid = out.map(r => r.key).concat(q.grid);
    q.results.push({ name: S.name, rows });
    if (q.session === 2) {
        q.grid = rows.map(r => r.key).concat(q.grid);
        q.done = true;
        q.field = [];
    } else {
        q.field = rows.slice(0, keep).map(r => ({ key: r.key, car: r.car }));
        q.session++;
    }
    return rows;
}

// resolve tudo sozinho (botão "pular")
function qualiAuto(q, rng) {
    while (!q.done) qualiRunSession(q, rng);
    return q.grid;
}

function formatQuali(t) {
    if (t == null) return "SEM TEMPO";
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
}
