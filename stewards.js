"use strict";
// ==========================================================
// COMISSÁRIOS: punições de pilotos e de equipes (sem DOM)
// Baseado nas regras reais: tempo de 5s/10s (cumprido no box ou somado ao tempo final),
// drive-through (2 voltas para cumprir), perda de posições no grid, desqualificação técnica,
// pontos na superlicença (12 = 1 corrida de suspensão) e multas para equipes.
// As probabilidades são de balanceamento do jogo.
// ==========================================================

const STEW = {
    FALSE_START_P: 0.008,        // largada antecipada, por carro
    TRACK_LIMIT_P: 0.035,        // limites de pista, por volta (ritmo normal)
    TRACK_LIMIT_PUSH: 0.075,     // ... em ritmo de ataque
    TRACK_LIMIT_WORN: 0.03,      // ... extra com pneu abaixo de 25%
    CONTACT_BASE: 0.025,         // contato por tentativa de ultrapassagem
    UNSAFE_RELEASE_P: 0.012,     // soltura insegura, por parada
    PIT_LINE_P: 0.006,           // cruzar a linha de saída dos boxes de forma perigosa
    DSQ_TECH_P: 0.004,           // desqualificação técnica pós-corrida, por carro
    GRID_ENGINE_P: 0.04,         // 10 posições por excesso de componentes (x confiabilidade do motor)
    GRID_GEARBOX_P: 0.02,        // 5 posições por troca de câmbio
    UNSERVED_S: 20,              // punição não cumprida: tempo somado ao final (regra do jogo)
    BAN_POINTS: 12,              // pontos na licença para 1 corrida de suspensão
    COST_CAP_P: 0.04             // multa por teto de gastos, por equipe, no fim da temporada
};

const fmtEuro = n => "€" + n.toLocaleString("pt-BR");

function logPenalty(race, car, p) {
    const e = Object.assign({
        id: race.penalties.length + 1, frame: race.frame, lap: car ? Math.max(1, car.lap) : 0,
        carId: car ? car.id : -1, driver: car ? car.name : "", team: car ? car.team : "",
        kind: "time", seconds: 0, places: 0, points: 0, euros: 0, reason: ""
    }, p);
    race.penalties.push(e);
    if (car) car.licGained += e.points;
    emit(race, "penalty", { entry: e, car });
    return e;
}

function addTimePenalty(race, car, seconds, reason, points) {
    car.penPending += seconds;
    return logPenalty(race, car, { kind: "time", seconds, points: points || 0, reason });
}

function addDriveThrough(race, car, reason, points) {
    if (car.dt) { car.penPending += 5; return logPenalty(race, car, { kind: "time", seconds: 5, points: points || 0, reason: reason + " (acumulou)" }); }
    car.dt = { deadline: car.lap + 2 };       // 2 voltas para cumprir
    return logPenalty(race, car, { kind: "drive", points: points || 0, reason });
}

function addFine(race, car, euros, reason) {
    return logPenalty(race, car, { kind: "fine", euros, reason });
}

// Penalidade não cumprida vira tempo somado ao final
function convertDriveThrough(race, car) {
    if (!car.dt) return;
    car.dt = null;
    car.penPending += STEW.UNSERVED_S;
    logPenalty(race, car, { kind: "time", seconds: STEW.UNSERVED_S, reason: "Drive-through não cumprido: tempo somado ao resultado" });
}

// ---------- antes da corrida: perda de posições no grid
function stewardsGrid(race, list) {
    const pens = [];
    list.forEach(c => {
        if (race.rng() < STEW.GRID_ENGINE_P * c.fail) pens.push({ c, places: 10, reason: "Excedeu a cota de componentes do motor (PU)" });
        else if (race.rng() < STEW.GRID_GEARBOX_P) pens.push({ c, places: 5, reason: "Troca de caixa de câmbio fora da cota" });
    });
    pens.forEach(p => {
        const i = list.indexOf(p.c);
        list.splice(i, 1);
        list.splice(Math.min(list.length, i + p.places), 0, p.c);
    });
    return pens;
}

// ---------- apagar das luzes: largada antecipada
function stewardsOnGo(race) {
    race.cars.forEach(c => {
        if (race.rng() < STEW.FALSE_START_P) addTimePenalty(race, c, 10, "Largada antecipada (jump start)", 0);
    });
}

// ---------- fim de cada volta: limites de pista
function stewardsLap(race, car) {
    let p = car.pace === "push" ? STEW.TRACK_LIMIT_PUSH : STEW.TRACK_LIMIT_P;
    if (car.tyreWear < 25) p += STEW.TRACK_LIMIT_WORN;
    p *= 1 + (race.weather ? race.weather.wet : 0);
    if (race.rng() >= p) return;
    car.tlCount++;
    // só o aviso final entra no registro (antes eram 3 linhas por piloto)
    if (car.tlCount < 4) { if (car.tlCount === 3) logPenalty(race, car, { kind: "warning", reason: "Limites de pista: último aviso (3/3)" }); }
    else { car.tlCount = 0; addTimePenalty(race, car, 5, "Limites de pista: 4ª infração", 0); }
}

// ---------- ultrapassagem: pode haver contato
function stewardsContact(race, att, def) {
    let p = STEW.CONTACT_BASE;
    if (att.pace === "push") p *= 1.8;
    if (att.tyreWear < 30) p *= 1.5;
    p *= 1 + (1 - race.def.overtake) * 0.8;          // pistas travadas = mais risco
    p *= 1 + 0.8 * (race.weather ? race.weather.wet : 0);   // pista molhada = mais contatos
    if (race.rng() > p) return false;

    att.damage = Math.min(0.05, att.damage + 0.012 + race.rng() * 0.012);
    def.damage = Math.min(0.05, def.damage + 0.006 + race.rng() * 0.006);
    att.mistake = Math.max(att.mistake, 60); def.mistake = Math.max(def.mistake, 60);
    emit(race, "contact", { car: att, other: def });

    const r = race.rng();
    if (r < 0.35) { if (att.isPlayer || def.isPlayer) logPenalty(race, att, { kind: "note", reason: "Incidente de corrida com " + def.name + ": nenhuma ação" }); }
    else if (r < 0.70) addTimePenalty(race, att, 5, "Causou colisão com " + def.name + " (com atenuantes)", 2);
    else if (r < 0.90) addTimePenalty(race, att, 10, "Causou colisão com " + def.name, 3);
    else addDriveThrough(race, att, "Colisão imprudente com " + def.name, 4);

    if (race.rng() < 0.05 && !def.inPit && !def.finished && !def.dnf) breakDown(race, def);
    return true;
}

// ---------- saída dos boxes: erros da equipe
function stewardsPitExit(race, car) {
    if (race.rng() < STEW.UNSAFE_RELEASE_P) {
        const euros = [5000, 10000, 20000][Math.floor(race.rng() * 3)];
        addFine(race, car, euros, "Soltura insegura nos boxes (erro da equipe)");
        addTimePenalty(race, car, 5, "Soltura insegura nos boxes (erro da equipe)", 0);
    } else if (race.rng() < STEW.PIT_LINE_P) {
        addDriveThrough(race, car, "Cruzou a linha de saída dos boxes de forma perigosa", 3);
    }
}

// ---------- depois da corrida: inspeção técnica
function stewardsPostRace(race) {
    race.cars.forEach(c => {
        if (c.finished && !c.dnf && race.rng() < STEW.DSQ_TECH_P) {
            c.dsq = true;
            logPenalty(race, c, { kind: "dsq", reason: "Desqualificado: prancha do assoalho desgastada abaixo de 9 mm" });
            addFine(race, c, 25000, "Infração técnica (equipe)");
        }
    });
}
