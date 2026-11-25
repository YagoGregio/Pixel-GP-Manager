"use strict";
// ==========================================================
// DADOS DO JOGO: constantes, pneus, motores, grid 2026 e rostos
// ==========================================================

const SIM = {
    RATIO: 6.5,          // 1 quadro de simulação = 1/6.5 s de corrida (só afeta o relógio mostrado)
    PIT_FRAMES: 170,     // duração total da passagem pelo pit lane (quadros)
    THROUGH_FRAMES: 94,  // drive-through: passa pelo pit lane sem parar
    PIT_SPAN: 0.09,      // trecho da volta ocupado pelo pit lane (fração da volta)
    GRID_ROW_PX: 36,     // distância entre fileiras do grid (pixels)
    COUNTDOWN: 240,      // quadros de contagem antes da largada
    PIT_CALL_WEAR: 46,   // desgaste em que o piloto percebe queda de rendimento e pede box
    PIT_CRITICAL_WEAR: 28
};

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// wear = % de pneu consumido por volta em ritmo normal; speed = multiplicador de velocidade
const TYRES = {
    SOFT:   { code: "S", speed: 1.012, wear: 19,   cls: "soft",   label: "MACIO" },
    MEDIUM: { code: "M", speed: 1.000, wear: 11.5, cls: "medium", label: "MÉDIO" },
    HARD:   { code: "H", speed: 0.990, wear: 7.5,  cls: "hard",   label: "DURO" },
    INTER:  { code: "I", speed: 1.000, wear: 9,    cls: "inter",  label: "INTERMEDIÁRIO", wet: true },
    WET:    { code: "W", speed: 1.000, wear: 8,    cls: "wet",    label: "CHUVA", wet: true }
};
const DRY_TYRES = ["SOFT", "MEDIUM", "HARD"];
const GAME_VERSION = "3.1.1";

// ers = variação da bateria em % por volta
const PACE_MODES = {
    conserve: { speed: 0.978, wear: 0.62, ers: +25 },
    normal:   { speed: 1.000, wear: 1.00, ers: +6 },
    push:     { speed: 1.016, wear: 1.45, ers: -35 }
};

// Cada motor muda algo diferente. Agora TODAS as equipes usam um motor (o real de 2026).
//  pace = bônus de ritmo | fail = chance relativa de quebra e de troca de componentes (grid penalty)
//  wear = desgaste de pneu | drs = bônus de vácuo/ultrapassagem | ersRegen = recarga da bateria | launch = saída dos boxes
const ENGINES = {
    ferrari:  { name: "Ferrari",       label: "Ferrari (+Potência)",           pace: +0.006, fail: 1.00, wear: 1.00, drs: 1.010, ersRegen: 1.0, launch: 90 },
    mercedes: { name: "Mercedes",      label: "Mercedes (+Confiabilidade)",    pace: +0.002, fail: 0.25, wear: 1.00, drs: 1.010, ersRegen: 1.0, launch: 90 },
    honda:    { name: "Honda",         label: "Honda (+Velocidade de ponta)",  pace: +0.002, fail: 1.00, wear: 1.00, drs: 1.024, ersRegen: 1.0, launch: 90 },
    audi:     { name: "Audi",          label: "Audi (+Aceleração e ERS)",      pace: +0.002, fail: 1.00, wear: 1.00, drs: 1.010, ersRegen: 1.7, launch: 55 },
    rbpt:     { name: "Red Bull-Ford", label: "Ford RBPT (+Equilíbrio)",       pace: +0.003, fail: 0.70, wear: 0.92, drs: 1.012, ersRegen: 1.2, launch: 75 }
};

// Equipe criada pelo jogador: chassi de meio/fim de pelotão + bônus do motor escolhido
// v3.1.1: a diferença entre as equipes foi comprimida (a Mercedes vencia 87% das corridas)
const BAL_MEAN = 0.975, BAL_SQUEEZE = 0.55;
const CUSTOM_CHASSIS = BAL_MEAN + (0.968 - BAL_MEAN) * BAL_SQUEEZE;

// Paletas de rosto
const SKIN_TONES = ["#f6d5bd", "#e8b896", "#c98f63", "#9b6440", "#6a4128"];
const SKIN_LABELS = ["CLARA", "MÉDIA", "MORENA", "PARDA", "ESCURA"];
const HAIR_COLORS = { preto: "#17110d", castanho: "#4a2f1e", loiro: "#b8935a", ruivo: "#9b4a22", grisalho: "#8d8b88" };
const HAIR_STYLES = ["short", "slick", "curly", "messy", "long", "buzz", "receding", "bald"];
const HAIR_STYLE_LABELS = { short: "CURTO", slick: "PENTEADO", curly: "CACHEADO", messy: "BAGUNÇADO", long: "COMPRIDO", buzz: "RASPADO", receding: "ENTRADAS", bald: "CARECA" };
const BEARD_STYLES = ["none", "stubble", "beard", "goatee"];
const BEARD_LABELS = { none: "SEM BARBA", stubble: "BARBA POR FAZER", beard: "BARBA", goatee: "BODE" };

// Grid 2026. Motores conforme a lista de fornecedores de 2026.
// chassis = qualidade do carro sem o motor. O ritmo total (chassi + motor) foi calibrado pela
// ordem do campeonato de construtores de 2026 (Mercedes, Ferrari, Red Bull, McLaren, Racing Bulls,
// Alpine, Haas, Audi, Williams, Aston Martin, Cadillac). skill = ajuste do piloto (balanceamento do jogo).
// f = aparência do rosto em pixel art: s = tom de pele (0-4), h = cor do cabelo, st = estilo, b = barba
const TEAMS_2026 = [
    { name: "Mercedes",     engine: "mercedes", chassis: 0.998, color: "#00d2be", secondary: "#1a1a1a", drivers: [
        { name: "K. Antonelli",  skill: +0.005, f: { s: 1, h: "#2b1b12", st: "messy",    b: "none" } },
        { name: "G. Russell",    skill: +0.003, f: { s: 0, h: "#6d4b34", st: "short",    b: "none" } } ] },
    { name: "Ferrari",      engine: "ferrari",  chassis: 0.988, color: "#e10600", secondary: "#fff200", drivers: [
        { name: "L. Hamilton",   skill: +0.003, f: { s: 3, h: "#17110d", st: "buzz",     b: "goatee" } },
        { name: "C. Leclerc",    skill: +0.003, f: { s: 0, h: "#2a1a12", st: "slick",    b: "stubble" } } ] },
    { name: "Red Bull",     engine: "rbpt",     chassis: 0.987, color: "#2a3fb5", secondary: "#e10600", drivers: [
        { name: "M. Verstappen", skill: +0.006, f: { s: 0, h: "#6a4a30", st: "short",    b: "stubble" } },
        { name: "I. Hadjar",     skill: +0.001, f: { s: 2, h: "#1c1410", st: "curly",    b: "none" } } ] },
    { name: "McLaren",      engine: "mercedes", chassis: 0.986, color: "#ff8000", secondary: "#2ea8ff", drivers: [
        { name: "L. Norris",     skill: +0.004, f: { s: 0, h: "#6b4a2f", st: "short",    b: "stubble" } },
        { name: "O. Piastri",    skill: +0.001, f: { s: 0, h: "#4a2f1e", st: "short",    b: "none" } } ] },
    { name: "Racing Bulls", engine: "rbpt",     chassis: 0.977, color: "#6692ff", secondary: "#ffffff", drivers: [
        { name: "L. Lawson",     skill: +0.002, f: { s: 0, h: "#8a6a42", st: "short",    b: "none" } },
        { name: "A. Lindblad",   skill: -0.001, f: { s: 1, h: "#3a2418", st: "messy",    b: "none" } } ] },
    { name: "Alpine",       engine: "mercedes", chassis: 0.973, color: "#0090ff", secondary: "#ff87bc", drivers: [
        { name: "P. Gasly",      skill: +0.002, f: { s: 1, h: "#2a1c14", st: "short",    b: "stubble" } },
        { name: "F. Colapinto",  skill: 0,      f: { s: 1, h: "#2a1a12", st: "messy",    b: "stubble" } } ] },
    { name: "Haas",         engine: "ferrari",  chassis: 0.966, color: "#e8e8e8", secondary: "#e10600", drivers: [
        { name: "O. Bearman",    skill: +0.001, f: { s: 0, h: "#3b2a1e", st: "short",    b: "none" } },
        { name: "E. Ocon",       skill: 0,      f: { s: 0, h: "#2a1c14", st: "short",    b: "stubble" } } ] },
    { name: "Audi",         engine: "audi",     chassis: 0.969, color: "#c4c7cc", secondary: "#e10019", drivers: [
        { name: "N. Hulkenberg", skill: 0,      f: { s: 0, h: "#8b6a45", st: "short",    b: "stubble" } },
        { name: "G. Bortoleto",  skill: 0,      f: { s: 2, h: "#1b130e", st: "short",    b: "none" } } ] },
    { name: "Williams",     engine: "mercedes", chassis: 0.967, color: "#00a0de", secondary: "#ffffff", drivers: [
        { name: "C. Sainz",      skill: +0.001, f: { s: 2, h: "#1d140f", st: "short",    b: "stubble" } },
        { name: "A. Albon",      skill: +0.001, f: { s: 2, h: "#1a120d", st: "short",    b: "none" } } ] },
    { name: "Aston Martin", engine: "honda",    chassis: 0.964, color: "#00665f", secondary: "#cedc00", drivers: [
        { name: "F. Alonso",     skill: +0.001, f: { s: 2, h: "#3a3532", st: "receding", b: "stubble" } },
        { name: "L. Stroll",     skill: -0.003, f: { s: 0, h: "#3a2a20", st: "short",    b: "stubble" } } ] },
    { name: "Cadillac",     engine: "ferrari",  chassis: 0.956, color: "#2b2f36", secondary: "#d4af37", drivers: [
        { name: "S. Perez",      skill: -0.001, f: { s: 2, h: "#1a120d", st: "short",    b: "goatee" } },
        { name: "V. Bottas",     skill: -0.001, f: { s: 0, h: "#9a7b4f", st: "short",    b: "stubble" } } ] }
];
TEAMS_2026.forEach(t => { t.chassis = BAL_MEAN + (t.chassis - BAL_MEAN) * BAL_SQUEEZE; t.pace = t.chassis + ENGINES[t.engine].pace; });

const RESERVE_DRIVERS = [
    { name: "Reserva", skill: -0.004, f: { s: 1, h: "#3a2a20", st: "short", b: "none" } },
    { name: "Reserva", skill: -0.004, f: { s: 2, h: "#1a120d", st: "short", b: "none" } }
];

// Posição do carro de cada equipe do grid em ritmo (1 = mais rápido); a equipe do jogador entra na conta
function teamRank(pace) { return TEAMS_2026.filter(t => t.pace > pace + 1e-9).length + 1; }
