"use strict";
// ==========================================================
// TEMPORADA: calendário, campeonato de pilotos e de construtores,
// pontos na superlicença, suspensões, multas e teto de gastos (sem DOM)
// ==========================================================

function newSeason(cfg, order) {
    return {
        version: 3, cfg, order: order.slice(), round: 0, done: false,
        drivers: {},   // "piloto|equipe" -> { name, team, pts, wins, podiums }
        teams: {},     // equipe -> { name, pts, wins, fines }
        lic: {},       // "piloto|equipe" -> pontos na superlicença (0-11)
        bans: {},      // "piloto|equipe" -> corridas de suspensão restantes
        history: [],   // por etapa: { trackIdx, winner, team, penalties }
        champions: null, costCap: []
    };
}

function seasonBanned(season) {
    const s = new Set();
    Object.keys(season.bans).forEach(k => { if (season.bans[k] > 0) s.add(k); });
    return s;
}

// Aplica o resultado de uma corrida. Devolve um resumo para a tela.
function seasonApply(season, race, cls) {
    const out = { newBans: [], served: [], fines: 0 };
    const keyOf = c => c.name + "|" + c.team;

    // quem estava suspenso nesta corrida já cumpriu
    Object.keys(season.bans).forEach(k => {
        if (season.bans[k] > 0) { season.bans[k]--; out.served.push(k); }
        if (season.bans[k] <= 0) delete season.bans[k];
    });

    cls.forEach(r => {
        const c = r.car;
        const t = season.teams[c.team] || (season.teams[c.team] = { name: c.team, pts: 0, wins: 0, fines: 0 });
        t.pts += r.points;
        if (r.pos === 1 && !c.dnf && !c.dsq) t.wins++;
        if (c.sub) return;                                   // reservas não pontuam entre os pilotos
        const k = keyOf(c);
        const d = season.drivers[k] || (season.drivers[k] = { name: c.name, team: c.team, pts: 0, wins: 0, podiums: 0 });
        d.pts += r.points;
        if (r.pos === 1 && !c.dnf && !c.dsq) d.wins++;
        if (r.pos <= 3 && !c.dnf && !c.dsq) d.podiums++;
        if (c.licGained) {
            season.lic[k] = (season.lic[k] || 0) + c.licGained;
            if (season.lic[k] >= STEW.BAN_POINTS) {
                season.lic[k] -= STEW.BAN_POINTS;
                season.bans[k] = 1;
                out.newBans.push(k);
            }
        }
    });

    race.penalties.forEach(p => {
        if (p.kind === "fine") {
            const t = season.teams[p.team] || (season.teams[p.team] = { name: p.team, pts: 0, wins: 0, fines: 0 });
            t.fines += p.euros; out.fines += p.euros;
        }
    });

    const w = cls[0];
    season.history.push({ trackIdx: season.order[season.round], winner: w.car.name, team: w.car.team, penalties: race.penalties.length });
    season.round++;
    if (season.round >= season.order.length) season.done = true;
    return out;
}

// Fim da temporada: inspeção do teto de gastos + campeões
function seasonFinish(season, rng) {
    rng = rng || Math.random;
    season.costCap = [];
    Object.keys(season.teams).forEach(n => {
        if (rng() < STEW.COST_CAP_P) {
            const euros = 100000 + Math.floor(rng() * 9) * 100000;
            season.teams[n].fines += euros;
            season.costCap.push({ team: n, euros });
        }
    });
    const d = driverTable(season)[0], t = teamTable(season)[0];
    season.champions = { driver: d ? d.name + " (" + d.team + ")" : "-", team: t ? t.name : "-" };
    return season.champions;
}

function driverTable(season) {
    return Object.keys(season.drivers).map(k => Object.assign({ key: k, lic: season.lic[k] || 0, ban: season.bans[k] || 0 }, season.drivers[k]))
        .sort((a, b) => b.pts - a.pts || b.wins - a.wins || b.podiums - a.podiums || a.name.localeCompare(b.name));
}
function teamTable(season) {
    return Object.keys(season.teams).map(k => season.teams[k])
        .sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.name.localeCompare(b.name));
}
