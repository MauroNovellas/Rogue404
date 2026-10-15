// Auditoría local, sin red ni cambios en los valores publicados.
// Uso: node analysis/balance-audit.cjs world|duels|bots|checks|sustained [muestras]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const harness = require('../tests/helpers/game-harness.cjs');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'checks';
const samples = Number(process.argv[3]) || (mode === 'world' ? 300 : mode === 'duels' ? 300 : 20);
// Estos dos diagnósticos conservan las cargas y supuestos del informe original.
// No volver a publicarlos como medidas del balance actual.
if (['duels', 'checks'].includes(mode)) throw Error('Modo histórico de 8c63bb4: consulta resultados/ y ANALISIS_BALANCE.md. Para el motor actual usa world, bots, sustained y tests/balance.test.cjs.');
function average(values) { return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length); }
function stats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return { n: values.length, mean: average(values), min: sorted[0], p10: sorted[Math.floor((sorted.length - 1) * .1)], median: sorted[Math.floor((sorted.length - 1) * .5)], p90: sorted[Math.floor((sorted.length - 1) * .9)], max: sorted.at(-1) };
}
function environment({ bots = false, fog = false } = {}) {
    const h = harness();
    h.context.setTimeout = setTimeout; h.context.clearTimeout = clearTimeout;
    if (bots) for (const file of ['autoplayer.js', 'autoplayer-profiles.js', 'autoplayer-navigation.js', 'autoplayer-mission.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), h.context, { filename: file });
    vm.runInContext('Renderer.draw = () => {}; UISystem.updateHUD = () => {}; UISystem.fillEndGameStats = () => {}; UISystem.renderCharacter = () => {}; UISystem.renderRewardChoice = () => {}; VisualFX.floatText = () => {}; Utils.log = () => {}; Network.fetchScores = async () => []; Network.saveScore = async () => { throw Error("Red prohibida en la auditoría"); }; FloorSystem.waitSlipFrame = () => Promise.resolve(); window.setTimeout = fn => { fn(); return 0; };', h.context);
    h.context.fetch = async () => { throw Error('Red prohibida en la auditoría'); };
    if (!fog) h.MapSystem.updateFog = () => {};
    return h;
}
function distances(h, start, blocked = new Set()) {
    const map = h.GameState.map, width = h.CONFIG.GRID.cols;
    const dist = new Int32Array(width * h.CONFIG.GRID.rows).fill(-1), queue = [start];
    dist[start.y * width + start.x] = 0;
    for (let i = 0; i < queue.length; i++) {
        const { x, y } = queue[i], value = dist[y * width + x] + 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy, key = ny * width + nx;
            if (map[ny]?.[nx] !== '.' || blocked.has(`${nx},${ny}`) || dist[key] >= 0) continue;
            dist[key] = value; queue.push({ x: nx, y: ny });
        }
    }
    return target => dist[target.y * width + target.x];
}
async function world() {
    const h = environment(), { CONFIG, GameState: s, Utils, MapSystem, ShopSystem } = h;
    const result = { maps: samples * 12, floors: {}, variance: {}, shops: {}, xp: [] };
    for (let level = 1; level <= 12; level++) {
        const unreachableSeeds = [];
        const columns = Object.fromEntries(['floorTiles', 'stairDistance', 'enemies', 'potentialXp', 'gold', 'foodDrops', 'food', 'waterDrops', 'water', 'chests', 'weapons', 'armor', 'boots', 'rings', 'nearestWater', 'nearestWeapon'].map(key => [key, []]));
        const enemyValues = {};
        for (let seed = 1; seed <= samples; seed++) {
            s.seed = seed; s.level = level; s.persistence = {}; s.recoveryDrops = {}; s.knownStairs = {};
            MapSystem.initLevel();
            const entities = s.entities, items = entities.items;
            const blocked = new Set([...entities.chests, ...entities.shops].map(item => `${item.x},${item.y}`));
            const dist = distances(h, s.stairs.up, blocked);
            const ofType = type => items.filter(item => item.type === type);
            const value = type => ofType(type).reduce((sum, item) => sum + item.value, 0);
            const nearest = type => { const values = ofType(type).map(dist).filter(d => d >= 0); return values.length ? Math.min(...values) : -1; };
            const row = {
                floorTiles: s.map.flat().filter(tile => tile === '.').length,
                stairDistance: dist(s.stairs.down), enemies: entities.enemies.length,
                potentialXp: entities.enemies.reduce((sum, enemy) => sum + enemy.xp, 0),
                gold: value('GOLD'), foodDrops: ofType('food').length, food: value('food'), waterDrops: ofType('water').length, water: value('water'),
                chests: entities.chests.length, weapons: ofType('weapon').length, armor: ofType('armor').length, boots: ofType('boots').length, rings: ofType('ring').length,
                nearestWater: nearest('water'), nearestWeapon: nearest('weapon')
            };
            if (row.stairDistance < 0) unreachableSeeds.push(seed);
            for (const [key, value] of Object.entries(row)) columns[key].push(value);
            for (const enemy of entities.enemies) {
                const type = enemyValues[enemy.typeId] ||= { hp: [], atk: [], count: 0 };
                type.hp.push(enemy.hp); type.atk.push(enemy.atk); type.count++;
            }
        }
        result.floors[level] = { type: s.floor.type, unreachableSeeds, ...Object.fromEntries(Object.entries(columns).map(([key, values]) => [key, stats(values)])), monsters: Object.fromEntries(Object.entries(enemyValues).map(([key, data]) => [key, { count: data.count, hp: stats(data.hp), atk: stats(data.atk) }])) };
        console.log(`Planta ${level}: ${columns.enemies.length} mapas`);
    }
    s.rng = Utils.mulberry32(74091);
    const mult = [], labels = {};
    for (let i = 0; i < 200000; i++) { const v = Utils.applyVariance(100); mult.push(v.multiplier); labels[v.label] = (labels[v.label] || 0) + 1; }
    result.variance = { multiplier: stats(mult), qualityCounts: labels };
    for (const level of [3, 6, 9, 12]) {
        s.level = level; s.rng = Utils.mulberry32(123);
        const values = {};
        for (let i = 0; i < 2000; i++) for (const item of ShopSystem.createStock()) {
            const group = values[item.type] ||= { value: [], price: [], restoreEffective: [] };
            group.value.push(item.value); group.price.push(item.price); group.restoreEffective.push(['food', 'water'].includes(item.type) ? Math.min(100, item.value) : item.value);
        }
        result.shops[level] = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Object.fromEntries(Object.entries(value).map(([k, values]) => [k, stats(values)]))]));
    }
    let cumulative = 0, xp = 100;
    for (let level = 2; level <= 12; level++) { cumulative += xp; result.xp.push({ level, cumulative, cost: xp }); xp = Math.max(xp + 1, Math.floor(xp * 1.5)); }
    return result;
}
async function duels() {
    const h = environment(), { GameState: s, CONFIG, Utils, CombatSystem, GameLogic } = h;
    s.map = Array.from({ length: 24 }, () => Array(70).fill('.'));
    s.visible = Array.from({ length: 24 }, () => Array(70).fill(true));
    s.seen = s.visible; s.floor = { type: 'NORMAL' }; s.stairs = { up: { x: 2, y: 2 }, down: { x: 60, y: 20 } };
    h.ProgressionSystem.gainXp = () => {};
    const stages = [
        { id: 'inicio', depth: 1, hp: 100, weapon: 0, armor: 0, points: 0 },
        { id: 'antes-cofre-3', depth: 3, hp: 110, weapon: 3, armor: 0, points: 1 },
        { id: 'arma-cofre-3', depth: 3, hp: 110, weapon: 9, armor: 0, points: 1 },
        { id: 'armadura-cofre-3', depth: 3, hp: 110, weapon: 3, armor: 8, points: 1 },
        { id: 'normal-5', depth: 5, hp: 120, weapon: 3, armor: 1, points: 2 },
        { id: 'cofres-6', depth: 6, hp: 130, weapon: 14, armor: 12, points: 3 },
        { id: 'sin-cofres-9', depth: 9, hp: 140, weapon: 3, armor: 2, points: 4 },
        { id: 'cofres-9', depth: 9, hp: 140, weapon: 19, armor: 18, points: 4 }
    ];
    const results = [];
    for (const stage of stages) for (const def of CONFIG.ENTITIES.enemies.filter(enemy => enemy.minLevel <= stage.depth)) for (const build of ['strength', 'resilience', 'speed']) for (const style of ['bump', 'quick', 'savage']) {
        const losses = [], turns = [], incoming = []; let wins = 0;
        for (let seed = 1; seed <= samples; seed++) {
            s.rng = Utils.mulberry32(seed * 1009 + stage.depth * 31); s.level = stage.depth; s.moves = 0; s.score = 0;
            s.current = 'PLAYING'; s.ui.upgradePromptPending = false; s.ui.floorWarningOpen = false;
            s.player = {
                x: 20, y: 12, hp: stage.hp, maxHp: stage.hp, food: 100, water: 100, level: 1, xp: 0, nextXp: 1e9,
                baseAtk: 3 + (build === 'strength' ? stage.points * 2 : 0), talentPoints: 0,
                talents: { strength: 0, resilience: build === 'resilience' ? stage.points : 0, speed: build === 'speed' ? Math.min(3, stage.points) : 0, ranged: 0 },
                inventory: [], equipment: { weapon: { value: stage.weapon }, armor: { value: stage.armor } },
                stats: { kills: {}, maxWeapon: { name: 'Prueba' }, maxArmor: { name: 'Prueba' } },
                combat: { isDefending: false, waitBonus: 0, wardTurns: 0, wardDefense: 0, wardStrike: 0, cooldowns: { area: 0, ranged: 0 }, pendingAttack: null }
            };
            const hp = Utils.applyVariance(def.hp + stage.depth * 2).value;
            const atk = Utils.applyVariance(def.atk + Math.floor(stage.depth / 2)).value;
            const enemy = { x: 21, y: 12, name: def.name, hp, maxHp: hp, atk, xp: def.xp, speed: 1, energy: 0, isSleeping: false, behavior: 'DUEL' };
            s.entities = { enemies: [enemy], items: [], shops: [], chests: [] }; s.persistence = { [stage.depth]: [] };
            let attacks = 0; const original = CombatSystem.enemyAttack;
            CombatSystem.enemyAttack = e => { attacks++; return original(e); };
            while (s.current !== 'GAMEOVER' && enemy.hp > 0 && s.moves < 200) {
                if (style === 'bump') { CombatSystem.bumpAttack(enemy); GameLogic.endTurn(); }
                else { s.player.combat.pendingAttack = style; CombatSystem.executeAttack(1, 0); }
            }
            CombatSystem.enemyAttack = original;
            if (enemy.hp <= 0 && s.current !== 'GAMEOVER') wins++;
            losses.push(stage.hp - Math.max(0, s.player.hp)); turns.push(s.moves); incoming.push(attacks);
        }
        results.push({ stage: stage.id, enemy: def.id, build, style, wins, n: samples, hpLoss: stats(losses), turns: stats(turns), incoming: stats(incoming) });
    }
    return { samplesPerCase: samples, assumptions: 'Intercambio adyacente 1v1 con daño, críticos, iniciativa y descolocación reales; IA de fuga/territorio neutralizada; sin curación al subir nivel; sin anillos/botas; no es tasa de éxito humana.', results };
}
async function bots() {
    const h = environment({ bots: true, fog: true });
    const capacity = Number(process.env.ROGUE_AUDIT_CAPACITY) || h.CONFIG.PLAYER.inventorySize;
    h.CONFIG.PLAYER.inventorySize = capacity;
    const { GameState: s } = h, bot = h.context.AutoPlayer, simulation = h.context.AutoSimulation;
    let metrics;
    const hooks = (obj, key, wrapper) => { const original = obj[key]; obj[key] = (...args) => wrapper(original, ...args); };
    hooks(h.InventorySystem, 'pickup', (fn, item, ...args) => {
        if (metrics && s.player.inventory.length >= h.CONFIG.PLAYER.inventorySize) metrics.blockedPickups++;
        const before = s.player.inventory.length; const value = fn(item, ...args);
        if (metrics && s.player.inventory.length > before) metrics.pickups[item.type] = (metrics.pickups[item.type] || 0) + 1;
        return value;
    });
    hooks(h.InventorySystem, 'useItem', (fn, index) => {
        const item = s.player.inventory[index];
        if (metrics && item) {
            metrics.uses[item.type] = (metrics.uses[item.type] || 0) + 1;
            if (item.type === 'water' || item.type === 'food') metrics.waste[item.type] += Math.max(0, item.value - (100 - s.player[item.type]));
        }
        return fn(index);
    });
    hooks(h.ShopSystem, 'buy', (fn, index) => { const before = s.score, out = fn(index); if (metrics) metrics.spent += before - s.score; return out; });
    hooks(h.FloorSystem, 'fallPlayer', fn => { if (metrics) metrics.falls++; return fn(); });
    const results = [];
    const goals = process.env.ROGUE_AUDIT_GOALS ? process.env.ROGUE_AUDIT_GOALS.split(',').map(Number) : [3, 6, 9];
    const profiles = process.env.ROGUE_AUDIT_PROFILES ? process.env.ROGUE_AUDIT_PROFILES.split(',') : ['prudent', 'explorer', 'greedy', 'aggressive', 'novice'];
    for (const goalDepth of goals) for (const profile of profiles) {
        const runs = [];
        for (let seed = 1; seed <= samples; seed++) {
            metrics = { blockedPickups: 0, fullTurns: 0, turnSamples: 0, sizeSum: 0, maxInventory: 0, pickups: {}, uses: {}, waste: { food: 0, water: 0 }, spent: 0, falls: 0 };
            const originalStep = bot.step;
            bot.step = async () => { const decision = await originalStep(); const size = s.player.inventory.length; metrics.fullTurns += size >= h.CONFIG.PLAYER.inventorySize ? 1 : 0; metrics.turnSamples++; metrics.sizeSum += size; metrics.maxInventory = Math.max(size, metrics.maxInventory); return decision; };
            const run = await simulation.runInternal({ seed, profile, goalDepth, maxActions: 1800 });
            bot.step = originalStep;
            run.playerLevel = s.player.level; run.talents = { ...s.player.talents }; run.metrics = metrics;
            runs.push(run);
        }
        results.push({ goalDepth, profile, summary: simulation.aggregate(runs), runs });
        console.log(`Bot objetivo ${goalDepth}, ${profile}: ${runs.filter(run => run.success).length}/${samples}, profundidad ${average(runs.map(run => run.maxDepth)).toFixed(2)}, causas ${JSON.stringify(simulation.aggregate(runs).causes)}`);
    }
    return { capacity, seeds: `1..${samples}`, maxActions: 1800, caveats: 'Balance 1: los bots comparan premios, usan reliquias y venden equipo común sobrante. Siguen asignando todos los talentos a Fuerza y no usan dardos. Política distinta de la auditoría original: no es una comparación aislada ni una tasa de éxito humana. No hay red.', results };
}
async function checks() {
    const h = environment(), { GameState: s, GameLogic, MapSystem, CombatSystem, ShopSystem, FloorSystem } = h;
    GameLogic.init(777); s.current = 'PLAYING';
    const original = s.entities.enemies.length; s.entities.enemies = []; MapSystem.initLevel();
    const respawn = { original, afterClearAndReentry: s.entities.enemies.length };
    s.level = 3; MapSystem.initLevel(); const e = s.entities.enemies[0];
    s.player.x = e.x - 1; s.player.y = e.y; s.player.baseAtk = 9999;
    CombatSystem.bumpAttack(e); const afterKill = s.entities.enemies.length; MapSystem.initLevel();
    respawn.afterActualKill = afterKill; respawn.afterActualReentry = s.entities.enemies.length;
    s.player.inventory = Array.from({ length: 6 }, () => ({ type: 'food', value: 20, name: 'Ración' }));
    const chest = { kind: 'relic', relicId: 'WARD_STONE', name: 'Piedra de Guardia', color: '#fff' };
    s.ui.rewardChoice = { options: [chest], index: 0 }; GameLogic.chooseChestReward(0);
    const fullChest = { inventory: s.player.inventory.length, remainingChoice: s.ui.rewardChoice.options.length, acquiredStone: s.player.inventory.some(item => item.relicId === 'WARD_STONE') };
    s.level = 6; s.player.water = 100; s.rng = () => .5;
    const water = ShopSystem.createStock().find(item => item.type === 'water');
    const shopWaste = { floor: 6, nominal: water.value, recoverableAtEmpty: Math.min(100, water.value), price: water.price };
    const healing = {};
    for (const type of ['NORMAL', 'FROZEN', 'MAGMA', 'UNSTABLE']) { s.floor = { type }; s.player.equipment = {}; healing[type] = FloorSystem.restHealing(); }
    const score = { killAnyEnemy: 25, baseGoldPerFloor: 80, completionPerMaxDepth: 100, goldAndScoreAreSameVariable: true };
    s.seed = 80; s.level = 3; s.persistence = {}; s.recoveryDrops = {}; MapSystem.initLevel();
    const obstacles = [...s.entities.chests, ...s.entities.shops];
    const blocked = new Set(obstacles.map(item => `${item.x},${item.y}`));
    const chokepoint = {
        seed: 80, floor: 3,
        geometricDistance: distances(h, s.stairs.up)(s.stairs.down),
        playableDistance: distances(h, s.stairs.up, blocked)(s.stairs.down),
        fixesByRemoving: obstacles.filter(item => { const reduced = new Set(blocked); reduced.delete(`${item.x},${item.y}`); return distances(h, s.stairs.up, reduced)(s.stairs.down) >= 0; }).map(item => ({ x: item.x, y: item.y, name: item.name }))
    };
    return { respawn, fullChest, shopWaste, healing, score, chokepoint };
}
async function sustained() {
    const h = environment(), { GameState: s, CombatSystem, GameLogic } = h;
    s.map = Array.from({ length: 24 }, () => Array(70).fill('.')); s.visible = s.map.map(row => row.map(() => true)); s.seen = s.visible;
    s.persistence = { 1: [] }; s.entities = { items: [], shops: [], chests: [], enemies: [] }; s.floor = { type: 'NORMAL' };
    h.ProgressionSystem.gainXp = () => {};
    const result = [];
    for (const behavior of ['DUEL', 'WARDEN']) for (const rank of [0, 1, 2, 3]) for (const boots of [false, true]) for (const style of ['bump', 'quick', 'savage']) {
        s.player.talents = { strength: 0, resilience: 0, speed: rank, ranged: 0 }; s.player.equipment = { boots: boots ? { traits: { initiativeBonus: .1 } } : null };
        s.player.hp = 100000; s.player.maxHp = 100000; s.player.baseAtk = 10; s.player.food = 100; s.player.water = 100;
        s.player.x = 20; s.player.y = 12; s.moves = 0; s.current = 'PLAYING'; s.rng = h.Utils.mulberry32(300);
        s.player.combat = { isDefending: false, waitBonus: 0, cooldowns: { area: 0, ranged: 0 }, pendingAttack: null };
        const enemy = { x: 21, y: 12, homeX: 21, homeY: 12, territoryRadius: 5, pressureRange: 2, smashMult: 1.5, homeRegen: 2, name: 'Blanco', hp: 100000, maxHp: 100000, atk: 10, speed: 1, energy: 0, isSleeping: false, behavior };
        s.entities.enemies = [enemy]; let enemyAttacks = 0, smashes = 0;
        const original = CombatSystem.enemyAttack; CombatSystem.enemyAttack = e => { enemyAttacks++; return original(e); };
        const originalSmash = GameLogic.performTrollSmash; GameLogic.performTrollSmash = e => { smashes++; return originalSmash(e); };
        for (let turn = 0; turn < 100; turn++) {
            if (style === 'bump') { CombatSystem.bumpAttack(enemy); GameLogic.endTurn(); }
            else { s.player.combat.pendingAttack = style; CombatSystem.executeAttack(1, 0); }
        }
        CombatSystem.enemyAttack = original;
        GameLogic.performTrollSmash = originalSmash;
        result.push({ behavior, rank, boots, style, playerActions: 100, enemyAttacks, smashes, damageDealt: 100000 - enemy.hp, damageReceived: 100000 - s.player.hp });
    }
    return result;
}
async function archive() {
    const tag = process.env.ROGUE_AUDIT_TAG;
    if (!tag || !/^[a-z0-9-]+$/.test(tag)) throw Error('Usa ROGUE_AUDIT_TAG con una etiqueta nueva; los datos originales no se sobrescriben.');
    const directory = path.join(__dirname, `resultados-${tag}`);
    const files = ['world', 'bots', 'sustained'].filter(name => fs.existsSync(`/tmp/rogue404-balance-${name}-${tag}.json`));
    if (!files.length) throw Error('No hay resultados para esta etiqueta.');
    fs.mkdirSync(directory);
    for (const name of files) fs.copyFileSync(`/tmp/rogue404-balance-${name}-${tag}.json`, path.join(directory, `${name}.json`));
    return { directory, files, ruleset: 'balance-1', baseline: 'resultados/', tag };
}
(async () => {
    const functions = { world, duels, bots, checks, sustained, archive };
    if (!functions[mode]) throw Error('Modo desconocido');
    const result = await functions[mode]();
    const destination = `/tmp/rogue404-balance-${mode}${process.env.ROGUE_AUDIT_CAPACITY ? `-capacity-${process.env.ROGUE_AUDIT_CAPACITY}` : ''}${process.env.ROGUE_AUDIT_TAG ? `-${process.env.ROGUE_AUDIT_TAG}` : ''}.json`;
    fs.writeFileSync(destination, JSON.stringify(result, null, 2));
    console.log(`Resultado: ${destination}`);
    if (mode === 'checks') console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
