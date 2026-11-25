"use strict";
// ==========================================================
// SIMULAÇÃO (sem DOM): geometria da pista, corrida, pit stops, IA
// ==========================================================

const CANVAS_W = 640, CANVAS_H = 440, TRACK_PAD = 58;
const TRACK_HALF = 17;      // meia largura do asfalto (px)
const PIT_OFFSET = 31;      // distância do pit lane ao eixo da pista (px)

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------- geometria
function buildTrack(def) {
    const xs = def.pts.map(p => p[0]), ys = def.pts.map(p => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const scale = Math.min((CANVAS_W - 2 * TRACK_PAD) / (maxx - minx), (CANVAS_H - 2 * TRACK_PAD) / (maxy - miny));
    const ox = (CANVAS_W - (maxx - minx) * scale) / 2 - minx * scale;
    const oy = (CANVAS_H - (maxy - miny) * scale) / 2 - miny * scale;
    const tf = (x, y) => [x * scale + ox, y * scale + oy];

    const ctrl = def.pts.map(p => tf(p[0], p[1]));
    const n = ctrl.length, PER = 22, N = n * PER;
    const X = new Float64Array(N), Y = new Float64Array(N);
    for (let i = 0; i < n; i++) {
        const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
        for (let k = 0; k < PER; k++) {
            const t = k / PER, t2 = t * t, t3 = t2 * t;
            X[i * PER + k] = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
            Y[i * PER + k] = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        }
    }
    const cum = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) {
        const a = (i - 1) % N, b = i % N;
        cum[i] = cum[i - 1] + Math.hypot(X[b] - X[a], Y[b] - Y[a]);
    }
    const length = cum[N];

    // tangentes (diferença central) e normais; positivo = lado direito de quem avança
    const TX = new Float64Array(N), TY = new Float64Array(N), ANG = new Float64Array(N), CURV = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        const a = (i - 2 + N) % N, b = (i + 2) % N;
        const dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1;
        TX[i] = dx / l; TY[i] = dy / l; ANG[i] = Math.atan2(dy, dx);
    }
    for (let i = 0; i < N; i++) {
        const b = (i + 3) % N, a = (i - 3 + N) % N;
        let d = ANG[b] - ANG[a];
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const ds = (cum[(i + 3) % N] - cum[(i - 3 + N) % N] + (i + 3 >= N || i - 3 < 0 ? length : 0)) || 1;
        CURV[i] = d / Math.abs(ds > length / 2 ? ds - length : ds); // rad/px, com sinal (+ = curva à direita)
    }

    function locate(p) {
        p = ((p % 1) + 1) % 1;
        const target = p * length;
        let lo = 0, hi = N;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid; }
        const i = lo, j = (i + 1) % N;
        const seg = cum[i + 1] - cum[i] || 1;
        return { i, j, t: (target - cum[i]) / seg };
    }

    const track = {
        def, ctrl, N, X, Y, cum, length, scale, tf, CURV, ANG, TX, TY,
        // posição no circuito: p = fração da volta, lat = deslocamento lateral em px (+ = direita)
        at(p, lat = 0) {
            const { i, j, t } = locate(p);
            const x = X[i] + (X[j] - X[i]) * t, y = Y[i] + (Y[j] - Y[i]) * t;
            let tx = TX[i] + (TX[j] - TX[i]) * t, ty = TY[i] + (TY[j] - TY[i]) * t;
            const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
            return { x: x - ty * lat, y: y + tx * lat, angle: Math.atan2(ty, tx) };
        }
    };

    // ----- pit lane: escolhe o lado com mais espaço livre
    const span = def.pitSpan || SIM.PIT_SPAN;
    const half = span / 2;
    let bestSide = 1, bestClear = -1;
    for (const side of [1, -1]) {
        let minD = 1e9;
        for (let k = 0; k <= 20; k++) {
            const f = k / 20, p = -half + f * span;
            const q = track.at(p, side * (PIT_OFFSET + 8));
            for (let s = 0; s < N; s += 3) {
                const sp = s / N;
                let dp = Math.abs(((sp - p + 0.5 + 1) % 1) - 0.5);
                if (dp < span * 0.9) continue;
                const d = Math.hypot(X[s] - q.x, Y[s] - q.y);
                if (d < minD) minD = d;
            }
        }
        if (minD > bestClear) { bestClear = minD; bestSide = side; }
    }
    track.pit = {
        span, half, side: bestSide,
        lateral(f) { return bestSide * PIT_OFFSET * smooth((f) / 0.24) * (1 - smooth((f - 0.76) / 0.24)); },
        at(f) { return track.at(-half + f * span, this.lateral(f)); }
    };
    return track;
}

// ---------------------------------------------------------- desempenho
// Rendimento do pneu: perde pouco no começo, cai mais na "janela" e despenca no fim
function tyrePerf(w) {
    if (w >= 50) return 1 - 0.0004 * (100 - w);
    if (w >= 30) return 0.98 - 0.0012 * (50 - w);
    return 0.956 - 0.0035 * (30 - w);
}

function pitEase(u) {
    const e = x => x * x * (3 - 2 * x);
    if (u < 0.44) return 0.5 * e(u / 0.44);
    if (u < 0.56) return 0.5;
    return 0.5 + 0.5 * e((u - 0.56) / 0.44);
}

// ---------------------------------------------------------- criação da corrida
// opts.player = { teamName, color, secondary, engine, drivers:[{name, face}], realTeam: nome da equipe real escolhida ou null }
// opts.banned = Set de "piloto|equipe" suspensos nesta corrida (substituídos por reservas)
function createRace(opts) {
    const def = opts.trackDef;
    const rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    const track = buildTrack(def);
    const laps = opts.laps || 12;
    const race = {
        rng, track, laps, def,
        framesPerLap: def.lapSeconds * SIM.RATIO,
        baseSpeed: 1 / (def.lapSeconds * SIM.RATIO),
        frame: 0, goFrame: 0, phase: "countdown", countdown: SIM.COUNTDOWN,
        leaderFinished: false, winner: null, finishingFrames: 0,
        fastest: null, events: [], penalties: [], cars: [], playerCars: [], lightsOn: 0
    };

    weatherInit(race, opts.weather);
    hazardsInit(race);

    const pl = opts.player, banned = opts.banned || new Set();
    const customNames = pl.realTeam ? [] : pl.drivers.map(d => d.name.trim().toLowerCase());
    const list = [];

    // ----- as 11 equipes reais (o jogador pode assumir uma delas)
    const form = {};                                   // forma da equipe neste fim de semana
    const formOf = name => form[name] != null ? form[name] : (form[name] = (rng() - 0.5) * 0.008);
    TEAMS_2026.forEach(team => {
        const eng = ENGINES[team.engine];
        const mine = pl.realTeam === team.name;
        team.drivers.forEach((drv, k) => {
            let name = drv.name, face = drv.f, skill = drv.skill, sub = false;
            if (banned.has(drv.name + "|" + team.name) || customNames.includes(drv.name.trim().toLowerCase())) {
                name = "Reserva " + team.name + (k ? " 2" : ""); face = RESERVE_DRIVERS[k % 2].f; skill = RESERVE_DRIVERS[k % 2].skill; sub = true;
            }
            list.push(makeCar(race, {
                name, team: team.name, color: team.color, secondary: team.secondary, face,
                basePace: team.pace + skill + formOf(team.name), isPlayer: mine, playerIndex: mine ? k : -1, eng, sub
            }));
        });
    });

    // ----- 12ª equipe criada pelo jogador
    if (!pl.realTeam) {
        const eng = ENGINES[pl.engine] || ENGINES.ferrari;
        pl.drivers.forEach((d, k) => {
            let name = d.name, face = d.face, sub = false;
            if (banned.has(d.name + "|" + pl.teamName)) { name = "Reserva " + pl.teamName + (k ? " 2" : ""); face = RESERVE_DRIVERS[k % 2].f; sub = true; }
            list.push(makeCar(race, {
                name, team: pl.teamName, color: pl.color, secondary: pl.secondary, face,
                basePace: CUSTOM_CHASSIS + eng.pace - (k === 1 ? 0.004 : 0) - (sub ? 0.004 : 0),
                isPlayer: true, playerIndex: k, eng, sub
            }));
        });
    }
    list.forEach(c => { if (c.isPlayer) c.autoBox = true; });

    // pneus de largada
    list.forEach(c => {
        if (c.isPlayer) c.tyre = c.playerIndex === 0 ? "SOFT" : "MEDIUM";
        else { const r = rng(); c.tyre = r < 0.35 ? "SOFT" : r < 0.82 ? "MEDIUM" : "HARD"; }
        // pista molhada na largada: a maioria já sai com pneu de chuva
        const w0 = race.weather.wet + (rng() - 0.5) * 0.16, ideal = idealWetTyre(w0);
        if (ideal && (c.isPlayer || rng() < 0.9)) c.tyre = ideal;
        c.compounds = new Set([c.tyre]);
    });

    // classificação: ritmo + sorte, depois perdas de posição por punição
    if (opts.qualiOrder) {                                  // grid vindo da sessão de classificação
        const idx = new Map(opts.qualiOrder.map((k, i) => [k, i]));
        const at = c => idx.has(c.name + "|" + c.team) ? idx.get(c.name + "|" + c.team) : 99;
        list.forEach(c => { c.qual = c.basePace; });
        list.sort((a, b) => at(a) - at(b));
    } else {
        list.forEach(c => { c.qual = c.basePace + (rng() - 0.5) * 0.008; });
        list.sort((a, b) => b.qual - a.qual);
    }
    const gridPens = stewardsGrid(race, list);

    const L = track.length;
    list.forEach((c, i) => {
        const row = Math.floor(i / 2), odd = i % 2;
        const px = 18 + row * SIM.GRID_ROW_PX + (odd ? 18 : 0);
        c.progress = -px / L;
        c.lane = c.laneTarget = odd ? 7 : -7;
        c.startPos = i + 1;
        c.dist = c.progress;
        const pos = track.at(c.progress, c.lane);
        c.x = pos.x; c.y = pos.y; c.angle = pos.angle;
    });
    race.cars = list;
    race.playerCars = list.filter(c => c.isPlayer).sort((a, b) => a.playerIndex - b.playerIndex);
    race.cars.forEach((c, i) => { c.id = i; c.pos = i + 1; });
    gridPens.forEach(p => logPenalty(race, p.c, { kind: "grid", places: p.places, reason: p.reason }));
    return race;
}

function makeCar(race, o) {
    const rng = race.rng, e = o.eng;
    return {
        id: 0, name: o.name, team: o.team, color: o.color, secondary: o.secondary, face: o.face,
        isPlayer: o.isPlayer, playerIndex: o.playerIndex != null ? o.playerIndex : -1, sub: !!o.sub,
        basePace: o.basePace, fail: e.fail, wearMult: e.wear, ersRegen: e.ersRegen, drs: e.drs, launchFrames: e.launch,
        lap: 1, progress: 0, dist: 0, lapsDone: 0, pos: 0, startPos: 0, qual: 0,
        tyre: "MEDIUM", tyreWear: 100, compounds: new Set(), ers: 100, pace: "normal", noise: (rng() - 0.5) * 0.006,
        pitRequested: null, pitAsk: null, askCool: 0, autoBox: false, pits: 0,
        inPit: false, pitT: 0, pitSwapped: false, pitCrossed: false, launch: 0, through: false, holdExtra: 0,
        pitThreshold: 33 + rng() * 14,
        finished: false, finishFrame: 0, penaltyFrames: 0,
        dnf: false, dnfTimer: 0, dnfFrame: 0, out: false,
        mistake: 0, charge: 0, passing: 0, passSide: 1, noCharge: 0, lastSpeed: 0, dirty: false,
        lapFrames: 0, bestLap: null, lastLap: null, posHist: [], posLost: 0,
        lane: 0, laneTarget: 0, x: 0, y: 0, angle: 0, stopped: false,
        // punições
        damage: 0, penPending: 0, servedSeconds: 0, dt: null, tlCount: 0, licGained: 0, dsq: false,
        // asa ativa, incidentes e clima
        om: false, boost: 0, boostCool: 0, scDecided: 0,
        wing: "closed", zone: -1, wingStuck: null, spin: 0, spinDir: 1, tc: null, crash: null,
        wxBias: (rng() - 0.5) * 0.14, wxDelay: 90 + Math.floor(rng() * 330), wxSince: 0
    };
}

// ---------------------------------------------------------- eventos
function emit(race, type, data) { race.events.push(Object.assign({ type }, data)); }

// ---------------------------------------------------------- passo da simulação
function stepRace(race) {
    race.frame++;
    if (race.phase === "countdown") {
        race.countdown--;
        const t = SIM.COUNTDOWN - race.countdown;
        const lights = clamp(Math.floor(t / 30), 0, 5);
        if (lights !== race.lightsOn && race.countdown > 30) { race.lightsOn = lights; emit(race, "lights", { n: lights }); }
        if (race.countdown <= 30 && race.lightsOn !== 0) { race.lightsOn = 0; emit(race, "lights", { n: 0 }); }
        if (race.countdown <= 0) {
            race.phase = "racing"; race.goFrame = race.frame;
            emit(race, "go", {});
            stewardsOnGo(race);
        }
        return;
    }
    if (race.phase === "done") return;

    weatherStep(race);
    scStep(race);
    if (race.frame % 30 === 0) {
        const lbl = weatherLabel(race.weather);
        if (lbl !== race.wxLabel) { race.wxLabel = lbl; emit(race, "weather", { label: lbl, rain: race.weather.rain, wet: race.weather.wet }); }
        const y = race.crashes.some(c => !c.out);
        if (y !== race.yellow) { race.yellow = y; emit(race, "yellow", { on: y }); }
    }
    sortCars(race);
    const order = race.cars;
    for (let i = 0; i < order.length; i++) order[i].pos = i + 1;
    for (let i = 0; i < order.length; i++) updateCar(race, order[i], i);

    // histórico de posições (a cada 60 quadros) para detectar queda de rendimento
    if (race.frame % 60 === 0) {
        order.forEach((c, i) => {
            c.posHist.push(i + 1);
            if (c.posHist.length > 9) c.posHist.shift();
            const best = Math.min(...c.posHist);
            c.posLost = c.pos > best ? (i + 1) - best : 0;
        });
    }

    // fim de corrida
    if (race.phase === "racing" && race.leaderFinished) race.phase = "finishing";
    if (race.phase === "finishing") {
        race.finishingFrames++;
        const pending = race.cars.filter(c => !c.finished && !c.dnf);
        if (pending.length === 0 || race.finishingFrames > 60 * 25) {
            pending.forEach(c => finishCar(race, c));
            race.phase = "done";
            stewardsPostRace(race);
            emit(race, "done", {});
        }
    }
}

function sortCars(race) {
    race.cars.sort((a, b) => {
        if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
        if (a.dnf && b.dnf) return (b.lapsDone - a.lapsDone) || (b.dnfFrame - a.dnfFrame);
        if (b.dist !== a.dist) return b.dist - a.dist;
        return a.finishFrame - b.finishFrame;
    });
}

function freeSpeed(race, car) {
    const ty = TYRES[car.tyre], pm = PACE_MODES[car.pace];
    const w = race.weather.wet;
    let s = race.baseSpeed * car.basePace * (1 + car.noise) * ty.speed * pm.speed * tyrePerf(car.tyreWear) * wetPerf(car.tyre, w) * (1 - 0.03 * w);
    if (car.pace === "push" && car.ers > 3) s *= 1.012;
    if (car.mistake > 0) s *= 0.965;
    if (car.damage > 0) s *= 1 - car.damage;
    return s;
}

function updateCar(race, car, idx) {
    const T = race.track, L = T.length, order = race.cars;
    if (car.out) return;

    // ----- carro quebrado: desacelera, solta fumaça e sai da pista
    if (car.dnf) {
        car.dnfTimer++;
        if (car.crash) {
            car.lastSpeed *= 0.90;
            car.lane += (car.crash.side * (TRACK_HALF + 11) - car.lane) * 0.08;
        } else {
            car.lastSpeed *= 0.975;
            car.lane += (PIT_OFFSET * 0.3 * Math.sign(car.lane || 1) - car.lane) * 0.02;
        }
        car.progress += car.lastSpeed;
        placeCar(T, car);
        if (car.dnfTimer > 480) car.out = true;
        return;
    }

    car.lapFrames++;

    // ----- depois da bandeirada: volta de desaceleração
    if (car.finished) {
        car.lastSpeed += (race.baseSpeed * 0.5 - car.lastSpeed) * 0.02;
        car.progress += car.lastSpeed;
        if (car.progress >= 1) car.progress -= 1;
        car.lane += (0 - car.lane) * 0.05;
        placeCar(T, car);
        return;
    }

    if (car.inPit) { stepPit(race, car); placeCar(T, car, true); return; }

    if (car.mistake > 0) car.mistake--;
    if (car.askCool > 0) car.askCool--;
    if (car.noCharge > 0) car.noCharge--;

    // ----- IA e decisões periódicas
    if ((race.frame + car.id * 7) % 15 === 0) evaluatePit(race, car, idx);

    // ----- velocidade com trânsito (ar sujo, DRS, ultrapassagem)
    let speed = freeSpeed(race, car);
    if (race.frame - race.goFrame < 130) speed *= clamp(0.12 + (race.frame - race.goFrame) / 130, 0.12, 1);
    if (car.launch > 0) { speed *= 0.45 + 0.55 * (1 - car.launch / car.launchFrames); car.launch--; }

    if (car.wing !== "closed") speed *= HZ.ZONE_BOOST;
    if (car.spin > 0) {
        const u = 1 - car.spin / HZ.SPIN_FRAMES;
        speed *= 0.08 + 0.92 * Math.pow(u, 1.5);
        car.spin--;
    }
    if (race.crashes.length && !race.sc) speed *= yellowFactor(race, car);

    let ahead = null;
    for (let j = idx - 1; j >= 0; j--) {
        const c = order[j];
        if (c.out || c.dnf || c.inPit || c.finished) continue;
        ahead = c; break;
    }
    let gapPx = ahead ? (ahead.dist - car.dist) * L : 1e9;
    car.dirty = false;
    let laneT = 0;
    if (ahead && gapPx >= 0 && gapPx < 64 && race.phase !== "countdown") {
        if (!car.om && gapPx < 60) speed *= 1 + (car.drs - 1) * 0.3;        // só o vácuo (vácuo = "slipstream")
        if (gapPx < 36) { speed *= 0.997; car.dirty = true; }
        if (car.passing > 0) {
            car.passing--; laneT = car.passSide * 9;
        } else if (gapPx < 27) {
            const aheadSpeed = Math.max(ahead.lastSpeed, race.baseSpeed * 0.3);
            const adv = speed / aheadSpeed - 1;
            if (adv > 0 && car.noCharge === 0) car.charge += adv * 0.65 * race.def.overtake;
            else car.charge = Math.max(0, car.charge - 0.004);
            if (car.charge >= 1) {
                car.charge = 0; car.passing = 80; car.passSide = (idx + car.id) % 2 ? 1 : -1;
                ahead.noCharge = 300; ahead.charge = 0;
                stewardsContact(race, car, ahead);
            } else {
                speed = Math.min(speed, aheadSpeed * 1.0006);
                laneT = ((idx % 2) ? 1 : -1) * 4;
            }
        } else {
            car.charge = Math.max(0, car.charge - 0.006);
        }
    } else {
        car.charge = Math.max(0, car.charge - 0.01);
        if (car.passing > 0) car.passing--;
    }
    // Overtake Mode (armado na linha de detecção) e Boost
    if (car.om) {
        speed *= (car.wing !== "closed") ? car.drs : 1 + (car.drs - 1) * 0.5;
        car.ers = Math.max(0, car.ers - OM.DRAIN_LAP / race.framesPerLap);
        if (car.ers <= 0) car.om = false;
    }
    if (car.boost > 0) { speed *= OM.BOOST_SPEED; car.boost--; }
    if (car.boostCool > 0) car.boostCool--;
    if (race.sc) {
        speed = scSpeed(race, car, speed, ahead, gapPx);
        car.charge = 0; car.passing = 0; car.boost = 0; laneT = ((idx % 2) ? 1 : -1) * 4;
    }
    if (race.phase === "racing" && race.frame - race.goFrame < 60) laneT = car.laneTarget * 0.6;
    if (car.spin > 0) laneT = car.spinDir * 11;
    car.lane += (laneT - car.lane) * 0.08;
    car.drawRot = car.spin > 0 ? (1 - car.spin / HZ.SPIN_FRAMES) * Math.PI * 3 * car.spinDir : 0;

    // IA: ritmo (ataca se há carro à frente e pneu bom; poupa se pneu fraco)
    if (!car.isPlayer && (race.frame + car.id * 5) % 30 === 0) {
        if (car.tyreWear < 35) car.pace = "conserve";
        else if (ahead && gapPx < 50 && car.tyreWear > 55 && car.ers > 25) car.pace = "push";
        else car.pace = "normal";
    }
    if (!car.isPlayer && !race.sc && ahead && gapPx < 50 && car.ers > 45 && (race.frame + car.id * 3) % 45 === 0 && race.rng() < 0.3) activateBoost(race, car);
    // ERS acabou: sai do modo ataque
    if (car.pace === "push" && car.ers <= 0 && car.isPlayer) { car.pace = "normal"; emit(race, "ersEmpty", { car }); }
    if (car.pace === "push" && car.ers <= 0) car.pace = "normal";

    // ----- avanço
    car.lastSpeed = speed;
    const prevP = ((car.progress % 1) + 1) % 1;
    car.progress += speed;
    overtakeDetect(race, car, prevP, ahead, gapPx);
    hazardsStep(race, car, prevP);
    if (car.dnf) return;

    // desgaste e bateria
    const ty = TYRES[car.tyre], pm = PACE_MODES[car.pace];
    const wearRate = ty.wear / race.framesPerLap * race.def.wear * pm.wear * car.wearMult * (car.dirty ? 1.12 : 1) * wetWearMult(car.tyre, race.weather.wet) * (race.sc ? 0.3 : 1);
    car.tyreWear = Math.max(0, car.tyreWear - wearRate);
    const ersStep = pm.ers / race.framesPerLap * (pm.ers > 0 ? car.ersRegen : 1);
    car.ers = clamp(car.ers + ersStep, 0, 100);

    // ----- entrada nos boxes (no trecho final da volta)
    if (car.progress >= 1 - T.pit.half && car.progress < 1) {
        if (car.dt) {
            if (car.lap >= race.laps || race.leaderFinished) convertDriveThrough(race, car);
            else beginPit(race, car, true);
        } else if (car.pitRequested) {
            if (car.lap >= race.laps || race.leaderFinished) {
                emit(race, "pitCancelled", { car, reason: "late" });
                car.pitRequested = null;
            } else beginPit(race, car, false);
        }
    }

    // ----- linha de chegada
    if (!car.inPit && car.progress >= 1) {
        car.progress -= 1;
        completeLap(race, car, false);
    }

    car.dist = car.finished ? car.lapsDone : (car.lap - 1) + car.progress;
    placeCar(T, car);
}

function placeCar(T, car, inPitDraw) {
    if (inPitDraw) {
        const f = car.pitF;
        const p = T.pit.at(f);
        car.x = p.x; car.y = p.y; car.angle = p.angle;
        return;
    }
    const p = T.at(car.progress, car.lane);
    car.x = p.x; car.y = p.y; car.angle = p.angle;
}

function completeLap(race, car, inPit) {
    const sec = car.lapFrames / SIM.RATIO;
    car.lapFrames = 0;
    car.lapsDone = car.lap;       // voltas completas
    if (car.lap >= 2 && !inPit) {
        car.lastLap = sec;
        if (car.bestLap == null || sec < car.bestLap) car.bestLap = sec;
        if (!race.fastest || sec < race.fastest.time) {
            race.fastest = { car, time: sec, lap: car.lap };
            emit(race, "fastest", { car, time: sec, lap: car.lap });
        }
    }
    car.lap++;
    car.noise = (race.rng() - 0.5) * 0.0064;
    if (car.dt && car.lap > car.dt.deadline) convertDriveThrough(race, car);
    if (!inPit) {
        stewardsLap(race, car);
        hazardsLap(race, car);
        if (race.rng() < 0.012) { car.mistake = 50; emit(race, "mistake", { car }); }
        if (race.rng() < 0.0011 * car.fail && car.lapsDone < race.laps) { breakDown(race, car); return; }
    }
    if (car.lapsDone >= race.laps || race.leaderFinished) finishCar(race, car);
}

function finishCar(race, car) {
    if (car.finished) return;
    if (car.dt) convertDriveThrough(race, car);
    car.finished = true;
    car.finishFrame = race.frame;
    if (car.lapsDone < 1) car.lapsDone = Math.max(0, car.lap - 1);
    car.penaltyFrames = (car.compounds.size < 2 && !race.weather.anyWet) ? Math.round(20 * SIM.RATIO) : 0;
    car.pitRequested = null; car.pitAsk = null;
    car.dist = car.lapsDone;
    if (!race.leaderFinished) {
        race.leaderFinished = true; race.winner = car;
        emit(race, "flag", { car });
    }
    emit(race, "finished", { car });
}

function breakDown(race, car) {
    car.dnf = true; car.dnfFrame = race.frame; car.pitRequested = null; car.pitAsk = null;
    car.dist = (car.lap - 1) + car.progress;
    emit(race, "dnf", { car });
    if (race.rng() < 0.35) deploySC(race, "VSC", "carro parado: " + car.name);
}

// ---------------------------------------------------------- pit stop
function beginPit(race, car, through) {
    car.inPit = true; car.pitT = 0; car.pitF = 0; car.pitSwapped = false; car.pitCrossed = false;
    car.through = !!through; car.holdExtra = 0; car.wing = "closed"; car.wingStuck = null; car.zone = -1; car.tc = null; car.spin = 0;
    if (!car.isPlayer) car.pace = "normal";
    emit(race, "pitIn", { car, tyre: car.pitRequested, through: !!through });
}

function stepPit(race, car) {
    const T = race.track;
    const total = car.through ? SIM.THROUGH_FRAMES : SIM.PIT_FRAMES;
    let u = car.pitT / total;
    // cumprindo punição de tempo: o carro fica parado no box
    if (!car.through && car.pitSwapped && u >= 0.44 && u < 0.56 && car.holdExtra > 0) {
        car.holdExtra--; car.pitHold = true; car.pitF = 0.5; car.lastSpeed = 0;
        return;
    }
    car.pitT++;
    u = clamp(car.pitT / total, 0, 1);
    const f = car.through ? u : pitEase(u);
    car.pitF = f;
    car.pitHold = !car.through && u >= 0.44 && u < 0.56;
    if (!car.through && u >= 0.44 && !car.pitSwapped) {
        car.pitSwapped = true;
        car.tyre = car.pitRequested || "MEDIUM";
        car.compounds.add(car.tyre);
        car.tyreWear = 100; car.pits++; car.pitRequested = null; car.pitAsk = null;
        car.askCool = 360; car.posHist = []; car.posLost = 0;
        if (car.damage > 0) { car.damage = 0; emit(race, "wingChange", { car }); }
        if (car.penPending > 0) {
            car.holdExtra = Math.round(car.penPending * SIM.RATIO);
            car.servedSeconds += car.penPending;
            emit(race, "served", { car, seconds: car.penPending });
            car.penPending = 0;
        }
    }
    const P = f * T.pit.span - T.pit.half;
    if (!car.pitCrossed && f >= 0.5) {
        car.pitCrossed = true;
        completeLap(race, car, true);
    }
    car.progress = car.pitCrossed ? Math.max(0, P) : 1 + P;
    car.lastSpeed = 0;
    car.dist = (car.lap - 1) + car.progress;
    if (u >= 1) {
        const wasThrough = car.through;
        car.inPit = false; car.pitT = 0; car.launch = car.launchFrames;
        car.lane = 0; car.laneTarget = 0; car.through = false;
        if (wasThrough) { car.dt = null; emit(race, "dtServed", { car }); }
        else stewardsPitExit(race, car);
        emit(race, "pitOut", { car, through: wasThrough });
    }
}

// ---------------------------------------------------------- estratégia de pneus
function lapsRemaining(race, car) {
    return race.laps - car.lap + (1 - clamp(car.progress, 0, 1));
}
function wearPerLap(race, car, tyre) {
    return TYRES[tyre || car.tyre].wear * race.def.wear * car.wearMult;
}

function chooseTyre(race, car) {
    const wetIdeal = idealWetTyre(race.weather.wet + car.wxBias);
    if (wetIdeal) return wetIdeal;
    const need = lapsRemaining(race, car) + 0.35;
    const order = ["SOFT", "MEDIUM", "HARD"];
    const feasible = order.filter(k => 100 - need * wearPerLap(race, car, k) >= 18);
    let cands = feasible;
    if (car.compounds.size < 2 && !race.weather.anyWet) {       // regra: usar ao menos dois compostos
        cands = feasible.filter(k => !car.compounds.has(k));
        if (!cands.length) cands = order.filter(k => !car.compounds.has(k)).reverse();
    }
    return cands[0] || "HARD";
}

// Decide se o piloto precisa entrar. Para a equipe do jogador, o piloto "pede" pelo rádio.
// Clima: o piloto percebe a pista (com erro e atraso próprios) e pede o pneu certo
function weatherPitCheck(race, car) {
    const w = race.weather, pw = w.wet + car.wxBias, cur = car.tyre;
    let want = null, reason = null;
    if (!TYRES[cur].wet) {
        if (pw > 0.22) { want = idealWetTyre(pw) || "INTER"; reason = "wet"; }
    } else if (cur === "INTER") {
        if (pw > 0.78) { want = "WET"; reason = "wet"; }
        else if (pw < 0.07) { want = chooseTyre(race, car); reason = "dry"; }
    } else if (cur === "WET") {
        if (pw < 0.14) { want = chooseTyre(race, car); reason = "dry"; }
        else if (pw < 0.40) { want = "INTER"; reason = "dry"; }
    }
    if (!want) { car.wxSince = 0; return null; }
    if (!car.wxSince) car.wxSince = race.frame;
    if (race.frame - car.wxSince < car.wxDelay) return null;       // ainda não reagiu
    return { tyre: want, reason };
}

function evaluatePit(race, car, idx) {
    if (car.inPit || car.finished || car.dnf) return;
    if (car.lap >= race.laps || race.leaderFinished || race.phase !== "racing") return;
    if (race.frame - race.goFrame < 200) return;
    if (race.sc && car.scDecided !== race.scId && !car.pitRequested && lapsRemaining(race, car) > 3) {
        car.scDecided = race.scId;
        if (race.rng() < 0.45 + (car.tyreWear < 55 ? 0.4 : 0) + (car.compounds.size < 2 ? 0.2 : 0)) {
            const tyre = chooseTyre(race, car);
            if (!car.isPlayer) { car.pitRequested = tyre; return; }
            if (car.autoBox) { car.pitRequested = tyre; emit(race, "driverCall", { car, reason: "safetycar", urgent: false, tyre, auto: true }); }
            else if (!car.pitAsk && car.askCool <= 0) { car.pitAsk = { tyre, reason: "safetycar", urgent: false }; emit(race, "driverCall", { car, reason: "safetycar", urgent: false, tyre, auto: false }); }
            return;
        }
    }
    if (race.weather.anyWet || race.weather.wet > 0.05 || race.weather.rain > 0.02) {
        const wx = weatherPitCheck(race, car);
        if (wx && lapsRemaining(race, car) > 1.05 && car.pitRequested !== wx.tyre) {
            if (!car.isPlayer) { car.pitRequested = wx.tyre; return; }
            if (car.autoBox) {
                car.pitRequested = wx.tyre; car.pitAsk = null;
                emit(race, "driverCall", { car, reason: wx.reason, urgent: true, tyre: wx.tyre, auto: true });
            } else if (!car.pitAsk && car.askCool <= 0) {
                car.pitAsk = { tyre: wx.tyre, reason: wx.reason, urgent: true };
                emit(race, "driverCall", { car, reason: wx.reason, urgent: true, tyre: wx.tyre, auto: false });
            } else if (car.pitAsk) car.pitAsk.tyre = wx.tyre;
            return;
        }
    }
    if (car.pitRequested) return;
    const left = lapsRemaining(race, car);
    if (left < 1.05) return;
    const endWear = car.tyreWear - left * wearPerLap(race, car);
    const canFinish = endWear >= 18;
    const needSecond = car.compounds.size < 2 && !race.weather.anyWet;
    const threshold = car.isPlayer ? SIM.PIT_CALL_WEAR : car.pitThreshold;

    let reason = null, urgent = false;
    if (car.tyreWear <= SIM.PIT_CRITICAL_WEAR && !canFinish) { reason = "critical"; urgent = true; }
    else if (car.tyreWear <= threshold && !canFinish) reason = "degrade";
    else if (car.posLost >= 3 && car.tyreWear < 70 && !canFinish) reason = "positions";
    else if (car.posLost >= 2 && car.tyreWear < 55 && !canFinish) reason = "positions";
    else if (needSecond && left <= 2.6) reason = "rule";
    if (!reason) {
        // pedido pendente deixou de fazer sentido (ex.: pneu ainda aguenta)
        return;
    }
    const tyre = chooseTyre(race, car);

    if (!car.isPlayer) { car.pitRequested = tyre; return; }

    if (car.autoBox) {
        car.pitRequested = tyre;
        emit(race, "driverCall", { car, reason, urgent, tyre, auto: true });
    } else if (!car.pitAsk && car.askCool <= 0) {
        car.pitAsk = { tyre, reason, urgent };
        emit(race, "driverCall", { car, reason, urgent, tyre, auto: false });
    } else if (car.pitAsk) {
        car.pitAsk.tyre = tyre; car.pitAsk.urgent = car.pitAsk.urgent || urgent;
    }
}

// ---------------------------------------------------------- comandos do jogador
function requestPit(race, car, tyre) {
    if (!car || car.inPit || car.finished || car.dnf) return false;
    if (race.phase === "countdown") {                       // antes da largada: escolhe o pneu do grid
        car.tyre = tyre; car.compounds = new Set([tyre]); car.pitRequested = null; return true;
    }
    if (car.pitRequested === tyre) { car.pitRequested = null; return true; }   // clicar de novo cancela
    car.pitRequested = tyre; car.pitAsk = null;
    return true;
}
function acceptAsk(race, car) {
    if (!car || !car.pitAsk) return false;
    car.pitRequested = car.pitAsk.tyre; car.pitAsk = null; return true;
}
function declineAsk(race, car) {
    if (!car || !car.pitAsk) return false;
    car.askCool = car.pitAsk.urgent ? 300 : 720; car.pitAsk = null; return true;
}
function setPace(car, mode) { if (PACE_MODES[mode]) car.pace = mode; }

// ---------------------------------------------------------- resultados
function gapToLeader(race, car) {
    const lead = race.cars[0];
    const d = lead.dist - car.dist;
    if (d >= 1) return "+" + Math.floor(d) + (Math.floor(d) === 1 ? " VOLTA" : " VOLTAS");
    return "+" + (d * race.framesPerLap / SIM.RATIO).toFixed(1) + "s";
}

function effectiveFrames(c) { return c.finishFrame + c.penaltyFrames + c.penPending * SIM.RATIO; }

function classification(race) {
    const arr = race.cars.slice();
    arr.sort((a, b) => {
        if (a.dsq !== b.dsq) return a.dsq ? 1 : -1;
        if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
        if (a.dnf) return (b.lapsDone - a.lapsDone) || (b.dnfFrame - a.dnfFrame);
        if (b.lapsDone !== a.lapsDone) return b.lapsDone - a.lapsDone;
        return effectiveFrames(a) - effectiveFrames(b);
    });
    const win = arr[0];
    return arr.map((c, i) => {
        let gap;
        if (c.dsq) gap = "DSQ";
        else if (c.dnf) gap = "DNF";
        else if (i === 0) gap = formatRaceTime((effectiveFrames(c) - race.goFrame) / SIM.RATIO);
        else if (c.lapsDone < win.lapsDone) {
            const n = win.lapsDone - c.lapsDone;
            gap = "+" + n + (n === 1 ? " VOLTA" : " VOLTAS");
        } else gap = "+" + ((effectiveFrames(c) - effectiveFrames(win)) / SIM.RATIO).toFixed(1) + "s";
        const ok = !c.dnf && !c.dsq;
        return { car: c, pos: i + 1, gap, points: ok && i < POINTS.length ? POINTS[i] : 0 };
    });
}

function formatRaceTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
}
function formatLap(t) {
    if (t == null) return "--";
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
}

if (typeof module !== "undefined") module.exports = { buildTrack, createRace, stepRace, classification, tyrePerf };
