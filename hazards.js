"use strict";
// ==========================================================
// ZONAS DE MODO RETA (asa ativa 2026) E INCIDENTES (sem DOM)
// Em 2026 o DRS deu lugar à asa ativa: nas zonas liberadas pela FIA o carro abre as asas (modo reta)
// e precisa voltar ao modo curva antes da freada. Aqui o piloto às vezes esquece de fechar a asa.
// As probabilidades são de balanceamento do jogo.
// ==========================================================

const HZ = {
    FORGET_P: 0.007,        // chance de esquecer a asa aberta, por zona e por carro
    WARN_FRAMES: 45,        // tempo entre o aviso e a consequência (dá para poupar/levantar o pé)
    ZONE_BOOST: 1.006,      // ganho de velocidade com a asa aberta
    TRACTION_BASE: 0.004,   // perda de tração por volta (pista seca, pneu certo)
    YELLOW_AHEAD: 0.07,     // trecho antes de um carro parado em que há bandeira amarela
    YELLOW_SLOW: 0.985,
    SPIN_FRAMES: 70
};

function inZone(z, p) { return z.a > z.b ? (p >= z.a || p < z.b) : (p >= z.a && p < z.b); }

function hazardsInit(race) {
    const T = race.track, N = T.N;
    race.zones = (race.def.zones || []).map((z, i) => ({ id: i, a: z.a, b: z.b, name: z.name, sev: z.sev }));
    race.crashes = []; race.incidents = []; race.yellow = false;
    // curvas fortes (máximos locais de curvatura) para locais de perda de tração
    const cv = new Float64Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -6; k <= 6; k++) s += Math.abs(T.CURV[(i + k + N) % N]); cv[i] = s / 13; }
    const cand = [];
    for (let i = 0; i < N; i += 4) {
        let ok = cv[i] > 0.012;
        for (let k = -10; k <= 10 && ok; k++) if (cv[(i + k + N) % N] > cv[i]) ok = false;
        if (ok) cand.push(T.cum[i] / T.length);
    }
    race.corners = cand.length ? cand : [0.25, 0.5, 0.75];
}

function logIncident(race, car, text) {
    race.incidents.push({ lap: Math.max(1, car.lap), driver: car.name, team: car.team, text });
}

function nearbyCars(race, car, range) {
    return race.cars.filter(o => o !== car && !o.dnf && !o.out && !o.inPit && !o.finished && Math.abs(o.dist - car.dist) * race.track.length < range);
}

function spinCar(race, car, why) {
    car.spin = HZ.SPIN_FRAMES; car.spinDir = race.rng() < 0.5 ? 1 : -1;
    car.tyreWear = Math.max(0, car.tyreWear - 5);          // pneu "quadrado"
    emit(race, "spin", { car, why });
    logIncident(race, car, "Rodou" + (why ? " (" + why + ")" : "") + " e perdeu tempo");
    nearbyCars(race, car, 40).forEach(o => { if (o.dist < car.dist && race.rng() < 0.6) { o.mistake = Math.max(o.mistake, 40); emit(race, "evade", { car: o, other: car }); } });
}

function crashCar(race, car, why) {
    car.dnf = true; car.dnfFrame = race.frame; car.pitRequested = null; car.pitAsk = null;
    car.dist = (car.lap - 1) + car.progress;
    car.crash = { side: race.rng() < 0.5 ? 1 : -1, rot: (race.rng() - 0.5) * 2.4, at: car.progress };
    car.spin = 0; car.wing = "closed"; car.wingStuck = null;
    race.crashes.push(car);
    emit(race, "crash", { car, why });
    if (race.rng() < 0.75) deploySC(race, race.rng() < 0.65 ? "SC" : "VSC", "acidente de " + car.name);
    logIncident(race, car, "ABANDONO por acidente" + (why ? " (" + why + ")" : ""));
    // outros carros próximos: acertados ou só se atrapalham
    nearbyCars(race, car, 46).forEach(o => {
        const r = race.rng();
        if (r < 0.14) {
            o.dnf = true; o.dnfFrame = race.frame; o.pitRequested = null; o.pitAsk = null; o.dist = (o.lap - 1) + o.progress;
            o.crash = { side: -car.crash.side, rot: (race.rng() - 0.5) * 2, at: o.progress }; race.crashes.push(o);
            emit(race, "crashHit", { car: o, other: car, out: true });
            logIncident(race, o, "ABANDONO: atingido por " + car.name);
        } else if (r < 0.40) {
            o.damage = Math.min(0.05, o.damage + 0.015 + race.rng() * 0.015); o.mistake = Math.max(o.mistake, 60);
            emit(race, "crashHit", { car: o, other: car, out: false });
            logIncident(race, o, "Atingido por detritos de " + car.name + " (asa danificada)");
        } else if (r < 0.75) {
            o.mistake = Math.max(o.mistake, 45); emit(race, "evade", { car: o, other: car });
        }
    });
}

// pior caso: asa ainda aberta quando a freada chega
function resolveWing(race, car) {
    const ws = car.wingStuck; car.wingStuck = null; car.wing = "closed";
    const w = race.weather ? race.weather.wet : 0;
    let f = car.pace === "conserve" ? 0.45 : car.pace === "push" ? 1.4 : 1;
    if (!car.isPlayer && race.rng() < 0.5) f = 0.5;           // a IA às vezes levanta o pé
    const crashP = Math.min(0.75, ws.sev * 0.16 * f * (1 + 1.2 * w));
    const spinP = Math.min(0.9 - crashP, (0.18 + 0.2 * ws.sev) * f * (1 + 1.0 * w));
    const r = race.rng();
    if (r < crashP) crashCar(race, car, "asa aberta na entrada da curva: " + ws.name);
    else if (r < crashP + spinP) spinCar(race, car, "asa aberta: " + ws.name);
    else {
        car.mistake = Math.max(car.mistake, 70); car.tyreWear = Math.max(0, car.tyreWear - 2);
        emit(race, "wobble", { car, zone: ws.name });
        logIncident(race, car, "Susto: asa aberta na freada (" + ws.name + "), perdeu tempo");
    }
}

function resolveTraction(race, car, fromWing) {
    const w = race.weather ? race.weather.wet : 0;
    const risk = gripRisk(car.tyre, w);
    const crashP = Math.min(0.5, 0.035 * (1 + 0.25 * (risk - 1)) * (car.pace === "push" ? 1.5 : 1));
    const spinP = Math.min(0.9 - crashP, 0.30 * (0.6 + 0.4 * risk));
    const r = race.rng();
    const why = w > 0.15 ? (TYRES[car.tyre].wet ? "pista molhada" : "pneu de pista seca no molhado") : (car.tyreWear < 25 ? "pneu no fim" : "perda de tração");
    if (r < crashP) crashCar(race, car, why);
    else if (r < crashP + spinP) spinCar(race, car, why);
    else { car.mistake = Math.max(car.mistake, 55); emit(race, "slide", { car, why }); logIncident(race, car, "Escorregou (" + why + ") e perdeu tempo"); }
}

// chamado a cada quadro para carros em pista; prev = progresso do quadro anterior
function hazardsStep(race, car, prev) {
    if (race.sc) { car.wing = "closed"; car.zone = -1; car.wingStuck = null; car.tc = null; return; }
    const p = ((car.progress % 1) + 1) % 1;
    // ----- zonas de modo reta
    let zi = -1;
    for (let k = 0; k < race.zones.length; k++) if (inZone(race.zones[k], p)) { zi = k; break; }
    if (car.zone !== zi) {
        if (car.zone >= 0 && car.wing === "open") {                     // saiu da zona: precisa fechar a asa
            const z = race.zones[car.zone], w = race.weather ? race.weather.wet : 0;
            let pf = HZ.FORGET_P * (car.pace === "push" ? 1.7 : car.pace === "conserve" ? 0.6 : 1) * (1 + 1.5 * w);
            if (z.sev > 0.9) pf *= 1.9;                        // trechos de altíssimo risco (130R, Eau Rouge)
            if (car.tyreWear < 25) pf *= 1.4;
            if (car.mistake > 0) pf *= 1.5;
            if (race.rng() < pf) {
                car.wing = "stuck"; car.wingStuck = { t: HZ.WARN_FRAMES, sev: z.sev, name: z.name };
                emit(race, "wingWarning", { car, zone: z.name });
            } else car.wing = "closed";
        }
        car.zone = zi;
        if (zi >= 0 && car.wing !== "stuck") car.wing = "open";
    }
    if (car.wingStuck && --car.wingStuck.t <= 0) resolveWing(race, car);

    // ----- perda de tração em curva marcada
    if (car.tc != null) {
        const at = car.tc, crossed = prev <= p ? (prev < at && p >= at) : (at > prev || at <= p);
        if (crossed) { car.tc = null; resolveTraction(race, car); }
    }
}

// no fim da volta: sorteia se haverá perda de tração e em qual curva
function hazardsLap(race, car) {
    const w = race.weather ? race.weather.wet : 0;
    let p = HZ.TRACTION_BASE * gripRisk(car.tyre, w);
    if (car.tyreWear < 25) p *= 2;
    if (car.pace === "push") p *= 1.5;
    if (w > 0.15 && car.tyre !== "INTER" && car.tyre !== "WET") p = Math.min(p, 0.09);
    if (race.rng() < p) car.tc = race.corners[Math.floor(race.rng() * race.corners.length)];
}

// carros parados na pista: bandeira amarela para quem se aproxima
function yellowFactor(race, car) {
    let f = 1;
    for (let i = 0; i < race.crashes.length; i++) {
        const c = race.crashes[i];
        if (c.out || c === car) continue;
        const d = ((c.crash.at - car.progress) % 1 + 1) % 1;
        if (d < HZ.YELLOW_AHEAD) { f = HZ.YELLOW_SLOW; break; }
    }
    return f;
}


// ==========================================================
// SAFETY CAR / VSC
// ==========================================================
const SCAR = {
    SC_SPEED: 0.42, VSC_SPEED: 0.62, CATCH: 1.7, GAP_PX: 24,
    SC_LAPS: [2.6, 4.0], VSC_LAPS: [1.2, 2.0], COOLDOWN: 1200, DETECT: 0.93
};

function deploySC(race, kind, reason) {
    if (race.sc || race.phase !== "racing" || (race.scCool || 0) > 0) return false;
    const lead = race.cars[0];
    if (lead && lead.lap >= race.laps) return false;                       // não na última volta
    const rg = kind === "SC" ? SCAR.SC_LAPS : SCAR.VSC_LAPS;
    race.scId = (race.scId || 0) + 1;
    race.sc = { kind, frames: Math.round(race.framesPerLap * (rg[0] + race.rng() * (rg[1] - rg[0]))), reason };
    emit(race, "safetyCar", { kind, reason });
    return true;
}

function scStep(race) {
    if (race.scCool > 0) race.scCool--;
    if (!race.sc) return;
    race.sc.frames--;
    const lead = race.cars[0];
    const blocked = race.crashes.some(c => !c.out) && race.sc.kind === "SC";
    if ((race.sc.frames <= 0 && !blocked) || (lead && lead.lap >= race.laps) || race.phase !== "racing") {
        emit(race, "safetyCarEnd", { kind: race.sc.kind });
        race.sc = null; race.scCool = SCAR.COOLDOWN;
    }
}

// velocidade de um carro sob SC/VSC (sem ultrapassagens; no SC o pelotão se fecha)
function scSpeed(race, car, speed, ahead, gapPx) {
    const sc = race.sc;
    if (sc.kind === "VSC") return Math.min(speed, race.baseSpeed * SCAR.VSC_SPEED);
    const base = race.baseSpeed * SCAR.SC_SPEED;
    if (!ahead) return Math.min(speed, base);
    if (gapPx > SCAR.GAP_PX + 8) return Math.min(speed, base * SCAR.CATCH);
    if (gapPx < SCAR.GAP_PX) return Math.min(base, ahead.lastSpeed * 0.985);
    return Math.min(base, Math.max(ahead.lastSpeed, base * 0.8));
}

// ==========================================================
// OVERTAKE MODE e BOOST (energia)
// ==========================================================
const OM = { MIN_ERS: 12, BONUS_ERS: 5, DRAIN_LAP: 12, BOOST_COST: 30, BOOST_LAPS: 0.3, BOOST_COOL: 0.8, BOOST_SPEED: 1.015, GAP_SECONDS: 1.0 };

// linha de detecção (último trecho da volta): arma o Overtake Mode para a volta seguinte
function overtakeDetect(race, car, prevP, ahead, gapPx) {
    const p = ((car.progress % 1) + 1) % 1;
    if (!(prevP < SCAR.DETECT && p >= SCAR.DETECT)) return;
    car.om = false;
    if (race.sc || !ahead) return;
    const gapSec = gapPx / race.track.length * race.def.lapSeconds;
    if (gapSec < OM.GAP_SECONDS && car.ers >= OM.MIN_ERS) {
        car.om = true; car.ers = Math.min(100, car.ers + OM.BONUS_ERS);
        emit(race, "overtakeArmed", { car, gap: gapSec });
    }
}

function activateBoost(race, car) {
    if (!car || car.dnf || car.finished || car.inPit || race.sc || race.phase !== "racing") return false;
    if (car.boost > 0 || car.boostCool > 0 || car.ers < OM.BOOST_COST) return false;
    car.boost = Math.round(race.framesPerLap * OM.BOOST_LAPS);
    car.boostCool = Math.round(race.framesPerLap * OM.BOOST_COOL);
    car.ers -= OM.BOOST_COST;
    emit(race, "boost", { car });
    return true;
}
