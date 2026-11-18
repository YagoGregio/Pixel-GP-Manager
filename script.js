// ==========================================
// DADOS DO GRID OFICIAL 2026 + IA
// ==========================================
const AI_TEAMS = [
    { name: "McLaren", color: "#ff8000", secondary: "#111111", pace: 0.98, drivers: ["L. Norris", "O. Piastri"] },
    { name: "Ferrari", color: "#e10600", secondary: "#ffea00", pace: 0.98, drivers: ["C. Leclerc", "L. Hamilton"] },
    { name: "Red Bull", color: "#1e41ff", secondary: "#ff1801", pace: 0.97, drivers: ["M. Verstappen", "L. Lawson"] },
    { name: "Mercedes", color: "#00d2be", secondary: "#111111", pace: 0.96, drivers: ["G. Russell", "K. Antonelli"] },
    { name: "Aston Martin", color: "#006f62", secondary: "#cedc00", pace: 0.94, drivers: ["F. Alonso", "L. Stroll"] },
    { name: "Williams", color: "#005aff", secondary: "#ffffff", pace: 0.93, drivers: ["C. Sainz", "A. Albon"] },
    { name: "Audi", color: "#d5001c", secondary: "#c0c0c0", pace: 0.92, drivers: ["N. Hulkenberg", "G. Bortoleto"] },
    { name: "Alpine", color: "#0090ff", secondary: "#ff69b4", pace: 0.91, drivers: ["P. Gasly", "J. Doohan"] },
    { name: "Racing Bulls", color: "#6692ff", secondary: "#ffffff", pace: 0.91, drivers: ["Y. Tsunoda", "I. Hadjar"] },
    { name: "Haas", color: "#ffffff", secondary: "#e10600", pace: 0.90, drivers: ["E. Ocon", "O. Bearman"] },
    { name: "Cadillac", color: "#ffb800", secondary: "#000000", pace: 0.89, drivers: ["C. Herta", "V. Bottas"] }
];

const TYRE_TYPES = {
    SOFT:   { code: "S", speedBonus: 1.045, wearRate: 0.055, class: "soft" },
    MEDIUM: { code: "M", speedBonus: 1.015, wearRate: 0.032, class: "medium" },
    HARD:   { code: "H", speedBonus: 0.985, wearRate: 0.018, class: "hard" }
};

const PACE_MODES = {
    conserve: { speed: 0.96, wearMult: 0.65, ersDelta: 0.08 },
    normal:   { speed: 1.00, wearMult: 1.00, ersDelta: 0.01 },
    push:     { speed: 1.04, wearMult: 1.55, ersDelta: -0.14 }
};

// Pontos do circuito pixelado (estilo Interlagos simplificado)
const TRACK_POINTS = [
    { x: 160, y: 370 }, // Reta principal
    { x: 480, y: 370 }, // Final da reta
    { x: 560, y: 310 }, // S do Senna entrada
    { x: 520, y: 240 }, // S do Senna saída
    { x: 570, y: 150 }, // Curva do Sol
    { x: 490, y: 80  }, // Reta oposta
    { x: 250, y: 80  }, // Descida do Lago
    { x: 170, y: 150 }, // Ferradura
    { x: 280, y: 210 }, // Laranjinha
    { x: 140, y: 240 }, // Pinheirinho
    { x: 90,  y: 310 }  // Junção
];

// Estado global do jogo
let cars = [];
let playerCars = [];
let totalLaps = 15;
let gameSpeed = 1;
let raceFinished = false;
let animationId = null;

// ==========================================
// PRÉ-VISUALIZAÇÃO DO CARRO NA TELA INICIAL
// ==========================================
const previewCanvas = document.getElementById("preview-canvas");
const pCtx = previewCanvas.getContext("2d");

function drawPixelCar(ctx, x, y, angle, primary, secondary, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    // Pneus (4 rodas pixeladas)
    ctx.fillStyle = "#111";
    ctx.fillRect(-10, -8, 6, 4);
    ctx.fillRect(5, -8, 6, 4);
    ctx.fillRect(-10, 4, 6, 4);
    ctx.fillRect(5, 4, 6, 4);

    // Chassi principal
    ctx.fillStyle = primary;
    ctx.fillRect(-11, -4, 22, 8);
    ctx.fillRect(11, -2, 4, 4); // Bico

    // Detalhe secundário e aerofólio
    ctx.fillStyle = secondary;
    ctx.fillRect(-13, -5, 4, 10); // Asa traseira
    ctx.fillRect(-2, -3, 7, 6);   // Cobertura motor

    // Capacete do piloto
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1, -2, 3, 4);

    ctx.restore();
}

function updatePreview() {
    const pColor = document.getElementById("primary-color").value;
    const sColor = document.getElementById("secondary-color").value;
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawPixelCar(pCtx, 60, 30, 0, pColor, sColor, 2.5);
}

document.getElementById("primary-color").addEventListener("input", updatePreview);
document.getElementById("secondary-color").addEventListener("input", updatePreview);
updatePreview();

// ==========================================
// INICIALIZAÇÃO DA CORRIDA
// ==========================================
document.getElementById("start-game-btn").addEventListener("click", () => {
    const teamName = document.getElementById("team-name").value.trim() || "CUSTOM F1";
    const primary = document.getElementById("primary-color").value;
    const secondary = document.getElementById("secondary-color").value;
    const d1Name = document.getElementById("driver1-name").value.trim() || "PILOTO 1";
    const d2Name = document.getElementById("driver2-name").value.trim() || "PILOTO 2";
    const engine = document.getElementById("engine-select").value;

    const engineBonus = {
        ferrari: 0.97,
        mercedes: 0.96,
        honda: 0.965,
        audi: 0.955,
        rbpt: 0.96
    }[engine];

    // Se o jogador escolher Bortoleto, evitamos duplicidade na Audi
    const gridTeams = JSON.parse(JSON.stringify(AI_TEAMS));
    if (d1Name.toUpperCase().includes("BORTOLETO") || d2Name.toUpperCase().includes("BORTOLETO")) {
        const audi = gridTeams.find(t => t.name === "Audi");
        if (audi) audi.drivers[1] = "M. Schumacher";
    }

    cars = [];
    let gridIndex = 0;

    // Adiciona equipes da IA
    gridTeams.forEach(team => {
        team.drivers.forEach((driverName, idx) => {
            cars.push(createCar({
                name: driverName,
                team: team.name,
                color: team.color,
                secondary: team.secondary,
                basePace: team.pace - (idx * 0.008),
                isPlayer: false,
                gridPos: gridIndex++
            }));
        });
    });

    // Adiciona a equipe do jogador (largando no meio do pelotão para desafio)
    const p1 = createCar({
        name: d1Name,
        team: teamName,
        color: primary,
        secondary: secondary,
        basePace: engineBonus,
        isPlayer: true,
        playerIndex: 0,
        gridPos: 10
    });

    const p2 = createCar({
        name: d2Name,
        team: teamName,
        color: primary,
        secondary: secondary,
        basePace: engineBonus - 0.006,
        isPlayer: true,
        playerIndex: 1,
        gridPos: 11
    });

    cars.splice(10, 0, p1, p2);
    // Reajusta posições iniciais no grid
    cars.forEach((c, i) => {
        c.progress = -i * 0.018;
    });

    playerCars = [p1, p2];

    document.getElementById("d1-name").textContent = p1.name;
    document.getElementById("d2-name").textContent = p2.name;

    document.getElementById("setup-screen").classList.remove("active");
    document.getElementById("race-screen").classList.add("active");

    startRaceLoop();
});

function createCar({ name, team, color, secondary, basePace, isPlayer, playerIndex = -1 }) {
    return {
        name,
        team,
        color,
        secondary,
        basePace,
        isPlayer,
        playerIndex,
        lap: 1,
        progress: 0, // 0.0 a 1.0 por volta
        totalDistance: 0,
        tyre: isPlayer && playerIndex === 1 ? "MEDIUM" : "SOFT",
        tyreWear: 100,
        ers: 100,
        paceMode: "normal",
        pitRequested: null,
        inPit: false,
        pitTimer: 0,
        finished: false,
        x: 160,
        y: 370,
        angle: 0
    };
}

// ==========================================
// CONTROLES DE VELOCIDADE, RITMO E PIT STOP
// ==========================================
document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        gameSpeed = parseInt(btn.dataset.speed);
    });
});

document.querySelectorAll(".pace-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const dIdx = parseInt(btn.dataset.driver);
        const mode = btn.dataset.pace;
        const car = playerCars[dIdx];
        if (!car) return;

        car.paceMode = mode;
        const card = document.getElementById(`card-d${dIdx + 1}`);
        card.querySelectorAll(".pace-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        logRadio(`${car.name}: Modo ${mode.toUpperCase()} ativado.`);
    });
});

document.querySelectorAll(".pit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const dIdx = parseInt(btn.dataset.driver);
        const tyre = btn.dataset.tyre;
        const car = playerCars[dIdx];
        if (!car || car.inPit || car.finished) return;

        car.pitRequested = tyre;
        document.getElementById(`d${dIdx + 1}-pit-status`).textContent = `BOX (${tyre[0]})`;
        logRadio(`Box confirmado para ${car.name}! Pneus ${tyre} prontos.`);
    });
});

document.getElementById("restart-btn").addEventListener("click", () => {
    cancelAnimationFrame(animationId);
    raceFinished = false;
    document.getElementById("race-banner").classList.add("hidden");
    document.getElementById("restart-btn").classList.add("hidden");
    document.getElementById("race-screen").classList.remove("active");
    document.getElementById("setup-screen").classList.add("active");
});

function logRadio(msg) {
    const log = document.getElementById("radio-log");
    const p = document.createElement("p");
    p.textContent = `> ${msg}`;
    log.prepend(p);
    if (log.children.length > 20) log.lastChild.remove();
}

// ==========================================
// FÍSICA E SIMULAÇÃO DA CORRIDA
// ==========================================
function updateSimulation() {
    for (let step = 0; step < gameSpeed; step++) {
        if (raceFinished) break;

        cars.forEach(car => {
            if (car.finished) return;

            // Lógica de Pit Stop em andamento
            if (car.inPit) {
                car.pitTimer--;
                if (car.pitTimer <= 0) {
                    car.inPit = false;
                    car.tyre = car.pitRequested || "MEDIUM";
                    car.tyreWear = 100;
                    car.pitRequested = null;
                    if (car.isPlayer) {
                        document.getElementById(`d${car.playerIndex + 1}-pit-status`).textContent = "";
                        logRadio(`${car.name} saiu dos boxes com pneus ${car.tyre}!`);
                    }
                }
                return;
            }

            // Inteligência Artificial gerencia pneus e ritmo
            if (!car.isPlayer) {
                if (car.tyreWear < 28 && !car.pitRequested && car.lap < totalLaps - 1) {
                    car.pitRequested = car.lap > totalLaps / 2 ? "SOFT" : "HARD";
                }
                car.paceMode = car.tyreWear < 40 ? "conserve" : "normal";
            }

            // Cálculo de velocidade
            const tyreData = TYRE_TYPES[car.tyre];
            const paceData = PACE_MODES[car.paceMode];

            // Penalidade severa se o pneu acabar
            const wearPenalty = car.tyreWear > 20 ? 1.0 : 0.82 + (car.tyreWear / 100);
            const ersBonus = (car.paceMode === "push" && car.ers > 5) ? 1.025 : 1.0;

            const speed = 0.00165 * car.basePace * tyreData.speedBonus * paceData.speed * wearPenalty * ersBonus;

            car.progress += speed;
            car.totalDistance += speed;

            // Desgaste de pneu e bateria ERS
            car.tyreWear = Math.max(0, car.tyreWear - (tyreData.wearRate * paceData.wearMult));
            car.ers = Math.min(100, Math.max(0, car.ers + paceData.ersDelta));

            if (car.isPlayer && Math.floor(car.tyreWear) === 25 && Math.random() < 0.05) {
                logRadio(`ALERTA: Pneus de ${car.name} em 25%! Considere parar.`);
            }

            // Completou uma volta
            if (car.progress >= 1.0) {
                car.progress -= 1.0;

                // Verifica entrada nos boxes na reta principal
                if (car.pitRequested) {
                    car.inPit = true;
                    car.pitTimer = 140; // ~2.3 segundos em 1x
                    return;
                }

                car.lap++;
                if (car.lap > totalLaps) {
                    car.finished = true;
                    car.lap = totalLaps;
                }
            }

            // Atualiza posição X, Y no circuito
            updateCarCoordinates(car);
        });

        // Ordena classificação pela distância total percorrida
        cars.sort((a, b) => b.totalDistance - a.totalDistance);

        // Verifica fim de corrida
        if (cars[0].finished && !raceFinished) {
            raceFinished = true;
            document.getElementById("race-banner").textContent = `VITÓRIA DE ${cars[0].name.toUpperCase()}!`;
            document.getElementById("race-banner").classList.remove("hidden");
            document.getElementById("restart-btn").classList.remove("hidden");
            logRadio(`FIM DE PROVA! Vencedor: ${cars[0].name} (${cars[0].team})`);
        }
    }
}

function updateCarCoordinates(car) {
    let p = car.progress;
    if (p < 0) p = (1 + (p % 1)) % 1;

    const totalSegments = TRACK_POINTS.length;
    const scaled = p * totalSegments;
    const idx = Math.floor(scaled) % totalSegments;
    const nextIdx = (idx + 1) % totalSegments;
    const t = scaled - Math.floor(scaled);

    const p1 = TRACK_POINTS[idx];
    const p2 = TRACK_POINTS[nextIdx];

    car.x = p1.x + (p2.x - p1.x) * t;
    car.y = p1.y + (p2.y - p1.y) * t;
    car.angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

// ==========================================
// RENDERIZAÇÃO DA PISTA E UI
// ==========================================
const trackCanvas = document.getElementById("track-canvas");
const ctx = trackCanvas.getContext("2d");

function drawTrack() {
    // Gramado pixelado
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(0, 0, trackCanvas.width, trackCanvas.height);

    // Zebras externas (vermelho e branco)
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    TRACK_POINTS.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.closePath();
    ctx.lineWidth = 44;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = "#e10600";
    ctx.stroke();
    ctx.setLineDash([]);

    // Asfalto
    ctx.lineWidth = 34;
    ctx.strokeStyle = "#374151";
    ctx.stroke();

    // Pit Lane (faixa paralela à reta principal)
    ctx.beginPath();
    ctx.moveTo(180, 398);
    ctx.lineTo(460, 398);
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#1f2937";
    ctx.stroke();

    // Linha de chegada quadriculada
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(156, 353, 8, 34);
    ctx.fillStyle = "#000000";
    ctx.fillRect(156, 353, 4, 8);
    ctx.fillRect(160, 361, 4, 8);
    ctx.fillRect(156, 369, 4, 8);
    ctx.fillRect(160, 377, 4, 8);

    // Desenha os carros (do último para o primeiro para líderes ficarem por cima)
    for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        const drawX = c.inPit ? 320 : c.x;
        const drawY = c.inPit ? 398 : c.y;
        const drawAngle = c.inPit ? 0 : c.angle;

        drawPixelCar(ctx, drawX, drawY, drawAngle, c.color, c.secondary, 1);

        // Marcador acima dos carros do jogador
        if (c.isPlayer) {
            ctx.fillStyle = "#ffea00";
            ctx.font = "8px 'Press Start 2P'";
            ctx.fillText(`P${i + 1}`, drawX - 8, drawY - 14);
        }
    }
}

function updateUI() {
    // Atualiza contador de voltas
    const leaderLap = Math.min(totalLaps, cars[0].lap);
    document.getElementById("lap-counter").textContent = `${leaderLap}/${totalLaps}`;

    // Atualiza Torre de Classificação
    const lbList = document.getElementById("leaderboard-list");
    lbList.innerHTML = "";

    cars.forEach((car, idx) => {
        const li = document.createElement("li");
        li.className = `lb-item ${car.isPlayer ? "player-team" : ""}`;
        const tyreCode = TYRE_TYPES[car.tyre].code;
        const statusText = car.inPit ? "PIT" : `[${tyreCode}]`;

        li.innerHTML = `
            <div class="lb-left">
                <span>${idx + 1}.</span>
                <span class="team-color-dot" style="background:${car.color}"></span>
                <span>${car.name}</span>
            </div>
            <span>${statusText}</span>
        `;
        lbList.appendChild(li);
    });

    // Atualiza Painel dos 2 Pilotos do Jogador
    playerCars.forEach((car, idx) => {
        const pos = cars.indexOf(car) + 1;
        const num = idx + 1;
        const tyreObj = TYRE_TYPES[car.tyre];

        document.getElementById(`d${num}-pos`).textContent = `P${pos}`;

        const tyreBadge = document.getElementById(`d${num}-tyre`);
        tyreBadge.textContent = tyreObj.code;
        tyreBadge.className = `tyre-badge ${tyreObj.class}`;

        // Barra de desgaste do pneu
        const wearPct = Math.round(car.tyreWear);
        const wearBar = document.getElementById(`d${num}-wear-bar`);
        wearBar.style.width = `${wearPct}%`;
        wearBar.className = `progress-fill ${wearPct > 50 ? "green" : wearPct > 25 ? "yellow" : "red"}`;
        document.getElementById(`d${num}-wear-text`).textContent = `${wearPct}%`;

        // Barra de ERS
        const ersPct = Math.round(car.ers);
        document.getElementById(`d${num}-ers-bar`).style.width = `${ersPct}%`;
        document.getElementById(`d${num}-ers-text`).textContent = `${ersPct}%`;
    });
}

function startRaceLoop() {
    function loop() {
        updateSimulation();
        drawTrack();
        updateUI();
        animationId = requestAnimationFrame(loop);
    }
    loop();
}