const assert = require('node:assert/strict');
const harness = require('./helpers/game-harness.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function arena() {
    const h = harness(); const s = h.GameState;
    s.map = Array.from({ length: 24 }, () => Array(70).fill('.'));
    s.seen = s.map.map(row => row.map(() => true)); s.visible = s.map.map(row => row.map(() => true));
    s.persistence = { 1: [] }; s.rng = () => .5;
    s.stairs = { up: { x: 2, y: 2 }, down: { x: 60, y: 20 } };
    return h;
}
function enemy(extra = {}) {
    return { x: 21, y: 12, name: 'Objetivo', hp: 10000, maxHp: 10000, atk: 10, xp: 0, speed: 1, energy: 0, isSleeping: false, behavior: 'DUEL', ...extra };
}
function route(h) {
    const s = h.GameState, blocked = new Set([...s.entities.chests.filter(c => !c.isOpen), ...s.entities.shops].map(e => `${e.x},${e.y}`));
    const q = [s.stairs.up], seen = new Set([`${q[0].x},${q[0].y}`]);
    for (let i = 0; i < q.length; i++) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x = q[i].x + dx, y = q[i].y + dy, key = `${x},${y}`;
        if (s.map[y]?.[x] !== '.' || blocked.has(key) || seen.has(key)) continue;
        seen.add(key); q.push({ x, y });
    }
    return seen.has(`${s.stairs.down.x},${s.stairs.down.y}`);
}
test('el primer balance conserva vida y amplía mochila sin alterar el dardo', () => {
    const h = arena(); assert.equal(h.CONFIG.PLAYER.startHP, 100);
    assert.equal(h.CONFIG.PLAYER.inventorySize, 8); assert.equal(h.CONFIG.PROGRESSION.ranged.damage, 2);
    h.GameState.current = 'INVENTORY'; h.GameState.ui.inventoryIndex = 7;
    h.emit('keydown', 'ArrowRight'); assert.equal(h.GameState.ui.inventoryIndex, 7);
});
test('las calidades son explícitas y Épico ronda el 3%, no el 14%', () => {
    const h = arena(); h.GameState.rng = h.Utils.mulberry32(812);
    let epic = 0, normal = 0; const total = 100000;
    for (let i = 0; i < total; i++) { const v = h.Utils.applyVariance(100); epic += v.label === 'ÉPICO'; normal += v.label === 'NORMAL'; }
    assert.ok(epic / total > .027 && epic / total < .033);
    assert.ok(normal / total > .44 && normal / total < .46);
    h.GameState.rng = () => .5; assert.equal(h.Utils.applyVariance(7).value, 7);
});
test('una primera armadura está disponible en planta 2 y las armas de suelo progresan', () => {
    const h = harness();
    for (let seed = 1; seed <= 30; seed++) {
        h.GameLogic.init(seed); h.GameState.level = 2; h.MapSystem.initLevel();
        assert.ok(h.GameState.entities.items.some(item => item.type === 'armor'));
    }
    assert.ok(h.BalanceSystem.gearPower('weapon', 'ground', 12) > h.BalanceSystem.gearPower('weapon', 'ground', 2));
});
test('el estreno del Trasgo limita su cantidad y su poder normal está acotado', () => {
    const h = harness(); let hp = [], atk = [], elites = 0, total = 0;
    for (let seed = 1; seed <= 100; seed++) {
        h.GameLogic.init(seed); h.GameState.level = 5; h.MapSystem.initLevel();
        const trolls = h.GameState.entities.enemies.filter(e => e.typeId === 'TROLL');
        assert.equal(trolls.length, 1);
        for (const e of h.GameState.entities.enemies) { elites += Boolean(e.elite); total++; }
        for (const e of trolls.filter(e => !e.elite)) { hp.push(e.hp); atk.push(e.atk); }
    }
    assert.ok(Math.min(...hp) >= 38 && Math.max(...hp) <= 52);
    assert.ok(Math.min(...atk) >= 9 && Math.max(...atk) <= 13);
    assert.ok(elites / total < .15);
});
test('cofres y comerciantes no cortan la ruta a las escaleras', () => {
    const h = harness();
    for (let seed = 1; seed <= 100; seed++) for (const level of [3, 6, 9, 12]) {
        h.GameLogic.init(seed); h.GameState.level = level; h.MapSystem.initLevel();
        assert.ok(route(h), `Semilla ${seed}, planta ${level}`);
    }
    for (const [seed, level] of [[80,3], [104,9], [288,9], [261,12]]) {
        h.GameLogic.init(seed); h.GameState.level = level; h.MapSystem.initLevel(); assert.ok(route(h));
    }
});
test('un cofre abierto permite caminar y disparar a través de su casilla', async () => {
    const h = arena(); h.GameState.entities.chests = [{ x: 21, y: 12, isOpen: true }];
    assert.equal(h.CombatSystem.projectileBlocked(21, 12), false);
    assert.equal(h.FloorSystem.canSlideTo(21, 12), true);
    assert.equal(await h.GameLogic.movePlayer(1, 0), true); assert.equal(h.GameState.player.x, 21);
});
test('los enemigos muertos no reaparecen; los heridos conservan estado y posición', () => {
    const h = harness(); const s = h.GameState; h.GameLogic.init(81); s.current = 'PLAYING';
    const target = s.entities.enemies[0], survivor = s.entities.enemies[1];
    survivor.hp = 2; survivor.energy = .75; const spot = [survivor.x, survivor.y];
    s.player.baseAtk = 10000; h.CombatSystem.bumpAttack(target); const count = s.entities.enemies.length;
    const points = s.points; s.level = 2; h.MapSystem.initLevel(); s.level = 1; h.MapSystem.initLevel();
    assert.equal(s.entities.enemies.length, count);
    const restored = s.entities.enemies.find(e => e.x === spot[0] && e.y === spot[1]);
    assert.equal(restored.hp, 2); assert.equal(restored.energy, .75); assert.equal(s.points, points);
});
test('la exploración recordada y los objetos tirados sobreviven al regreso sin duplicarse', () => {
    const h = harness(); const s = h.GameState; h.GameLogic.init(82); s.current = 'PLAYING';
    s.seen[10][10] = true; s.player.inventory = [{ type: 'food', name: 'Reserva', value: 20 }];
    h.GameLogic.endTurn = () => {}; h.InventorySystem.dropItem(0);
    const id = s.entities.items.find(item => item.recoveryDropId).recoveryDropId;
    s.level = 2; h.MapSystem.initLevel(); s.level = 1; h.MapSystem.initLevel();
    assert.equal(s.seen[10][10], true);
    assert.equal(s.entities.items.filter(item => item.recoveryDropId === id).length, 1);
});
test('la nueva partida limpia los estados de plantas, dinero y puntuación', () => {
    const h = harness(); h.GameLogic.init(83); h.GameState.points = 500; h.GameState.score = 200;
    h.GameState.entities.enemies = []; h.GameState.level = 2; h.MapSystem.initLevel();
    h.GameLogic.init(83); assert.ok(h.GameState.entities.enemies.length);
    assert.equal(h.GameState.points, 0); assert.equal(h.GameState.score, 0);
    assert.equal(Object.keys(h.GameState.floorStates).length, 0);
});
test('explorar una profundidad concede XP una sola vez, sin granja de escaleras', () => {
    const h = harness(); const s = h.GameState; h.GameLogic.init(831);
    assert.equal(s.player.xp, 0); s.level = 2; h.MapSystem.initLevel(); assert.equal(s.player.xp, 25);
    s.level = 1; h.MapSystem.initLevel(); s.level = 2; h.MapSystem.initLevel(); assert.equal(s.player.xp, 25);
    s.level = 3; h.MapSystem.initLevel(); assert.equal(s.player.xp, 50);
    h.GameLogic.init(831); assert.equal(s.player.xp, 0); assert.equal(s.visitedDepths.size, 1);
});
test('subir y bajar escaleras no elimina la recarga de habilidades', () => {
    const h = harness(); h.GameLogic.init(832);
    h.GameState.player.combat.cooldowns = { area: 4, ranged: 2 };
    h.GameState.level = 2; h.MapSystem.initLevel(); h.GameState.level = 1; h.MapSystem.initLevel();
    assert.equal(h.GameState.player.combat.cooldowns.area, 4); assert.equal(h.GameState.player.combat.cooldowns.ranged, 2);
});
test('los cofres especiales ofrecen dos piezas con el valor definitivo y permiten aplazar', () => {
    const h = arena(); const chest = { x: 21, y: 12, specialId: 'FROZEN_VAULT_CHEST', isOpen: false };
    h.GameState.entities.chests = [chest]; h.GameLogic.endTurn = () => {};
    h.GameLogic.openChest(0); const options = h.GameState.ui.rewardChoice.options;
    assert.equal(options.length, 2); assert.equal(options[0].kind, 'weapon'); assert.equal(options[1].kind, 'armor');
    const value = options[1].item.value;
    h.GameLogic.cancelChestReward(); h.GameState.rng = () => .999;
    h.GameLogic.openChest(0); assert.equal(h.GameState.ui.rewardChoice.options[1].item.value, value);
    h.GameLogic.chooseChestReward(1); assert.equal(h.GameState.player.inventory[0].value, value);
    assert.equal(chest.rewardClaimed, true);
});
test('el premio de una mochila llena queda en el suelo, persiste y solo se recoge una vez', () => {
    const h = harness(); const s = h.GameState; h.GameLogic.init(84); s.current = 'PLAYING';
    h.GameLogic.endTurn = () => {}; const chest = s.entities.chests[0];
    s.rng = () => .5; h.GameLogic.openChest(0);
    const reward = { kind: 'relic', relicId: 'WARD_STONE', name: 'Piedra de Guardia' };
    s.ui.rewardChoice.options = [reward];
    s.player.inventory = Array(8).fill({ type: 'food', value: 20 });
    h.GameLogic.chooseChestReward(0);
    let item = s.entities.items.find(item => item.relicId === 'WARD_STONE'); assert.ok(item);
    const id = item.recoveryDropId; s.level = 2; h.MapSystem.initLevel(); s.level = 1; h.MapSystem.initLevel();
    item = s.entities.items.find(item => item.recoveryDropId === id); assert.ok(item);
    s.player.inventory.pop(); h.GameLogic.collectItemsAt(item.x, item.y);
    assert.equal(s.player.inventory.filter(item => item.relicId === 'WARD_STONE').length, 1);
    h.MapSystem.initLevel(); assert.equal(s.entities.items.some(item => item.recoveryDropId === id), false);
});
test('la armadura protege sin inmunidad; Defender conserva su respuesta limitada', () => {
    const h = arena(); const p = h.GameState.player; p.equipment.armor = { value: 1000 };
    h.CombatSystem.enemyAttack(enemy()); assert.equal(p.hp, 97);
    p.combat.isDefending = true; h.CombatSystem.enemyAttack(enemy()); assert.equal(p.hp, 96);
    h.CombatSystem.enemyAttack(enemy({ atk: 0 })); assert.equal(p.hp, 96);
});
test('Salvaje pasa por iniciativa e IA: no borra APLASTAR ni fuerza un contraataque directo', () => {
    const h = arena(); const s = h.GameState;
    const troll = enemy({ typeId: 'TROLL', behavior: 'WARDEN', homeX: 21, homeY: 12, territoryRadius: 5, pressureRange: 2, smashMult: 1.5 });
    s.entities.enemies = [troll]; s.player.hp = 10000; let smashes = 0;
    const original = h.GameLogic.performTrollSmash; h.GameLogic.performTrollSmash = e => { smashes++; return original(e); };
    for (let i = 0; i < 8; i++) { s.player.combat.pendingAttack = 'savage'; h.CombatSystem.executeAttack(1, 0); }
    assert.ok(smashes >= 3); assert.ok(troll.energy >= 0);
});
test('Velocidad también reduce las respuestas de Salvaje', () => {
    const counts = [];
    for (const rank of [0, 3]) {
        const h = arena(); const s = h.GameState; s.player.hp = 100000; s.player.talents.speed = rank;
        const target = enemy({ hp: 100000 }); s.entities.enemies = [target];
        let count = 0; const attack = h.CombatSystem.enemyAttack;
        h.CombatSystem.enemyAttack = e => { count++; return attack(e); };
        for (let i = 0; i < 100; i++) { s.player.combat.pendingAttack = 'savage'; h.CombatSystem.executeAttack(1, 0); }
        counts.push(count);
    }
    assert.ok(counts[1] < counts[0]); assert.ok(counts[0] >= 120);
});
test('Rápido descoloca cada tres acciones, sin encadenar protección casi total', () => {
    const h = arena(); const s = h.GameState; s.player.hp = 100000;
    s.entities.enemies = [enemy({ hp: 100000 })]; let count = 0;
    h.CombatSystem.enemyAttack = () => { count++; };
    for (let i = 0; i < 100; i++) { s.player.combat.pendingAttack = 'quick'; h.CombatSystem.executeAttack(1, 0); }
    assert.equal(count, 66);
});
test('Esperar potencia también el ataque por contacto y gasta la carga', () => {
    const h = arena(); const target = enemy(); h.GameState.entities.enemies = [target];
    h.GameState.player.combat.waitBonus = 2; h.CombatSystem.bumpAttack(target);
    assert.equal(target.hp, 9994); assert.equal(h.GameState.player.combat.waitBonus, 0);
});
test('la sed normal y la de magma acumulan la exposición sin reiniciarse al equipar', () => {
    const h = arena(); const s = h.GameState;
    for (let i = 0; i < 3; i++) h.GameLogic.processSurvival(); assert.equal(s.player.water, 100);
    s.floor = { type: 'MAGMA' };
    for (let i = 0; i < 2; i++) h.GameLogic.processSurvival(); assert.equal(s.player.water, 99);
    s.player.equipment.armor = { traits: { thirstResist: .6 } };
    for (let i = 0; i < 5; i++) h.GameLogic.processSurvival(); assert.equal(s.player.water, 98);
});
test('la protección térmica ahorra realmente el 60% del gasto de fumarola', () => {
    const costs = [];
    for (const protectedGear of [false, true]) {
        const h = arena(); const s = h.GameState;
        s.floor = { type: 'MAGMA', riskZone: { type: 'MAGMA_FUMAROLE', x1: 19, x2: 22, y1: 10, y2: 14 } };
        if (protectedGear) s.player.equipment.armor = { traits: { heatResist: .6, thirstResist: .6 } };
        for (let i = 0; i < 5; i++) h.GameLogic.processSurvival();
        costs.push(100 - s.player.water);
    }
    assert.deepEqual(costs, [11, 5]);
});
test('las tiendas mantienen recuperación aprovechable y precios moderados', () => {
    const h = arena(); const s = h.GameState;
    for (const [level, waterPrice, weaponPrice] of [[3,90,225], [6,110,350], [9,130,500], [12,150,700]]) {
        s.level = level; const stock = h.ShopSystem.createStock();
        assert.equal(stock.find(i => i.type === 'water').value, 60);
        assert.equal(stock.find(i => i.type === 'water').price, waterPrice);
        assert.equal(stock.find(i => i.type === 'weapon').price, weaponPrice);
        assert.ok(stock.find(i => i.type === 'ring').price <= 240);
    }
});
test('comprar, vender y sufrir un robo no resta ni fabrica puntos', () => {
    const h = arena(); const s = h.GameState; s.level = 3; s.score = 1000; s.points = 200;
    h.ShopSystem.buy(0); assert.equal(s.points, 200); assert.ok(s.score < 1000);
    h.ShopSystem.sell(0); assert.equal(s.points, 200);
    h.GameLogic.goblinStealGold(enemy({ behavior: 'THIEF', stealGold: 20 })); assert.equal(s.points, 200);
});
test('recuperar oro robado al jugador no lo puntúa dos veces', () => {
    const h = arena(); const s = h.GameState; h.BalanceSystem.award(100);
    const goblin = enemy({ behavior: 'THIEF', stealGold: 20, stolenGold: 0 });
    h.GameLogic.goblinStealGold(goblin); h.GameLogic.dropGoblinLoot(goblin);
    h.GameLogic.collectItemsAt(goblin.x, goblin.y);
    assert.equal(s.score, 100); assert.equal(s.points, 100);
});
test('los premios por especie diferencian amenaza y el inventario lleno no bloquea el oro', () => {
    const h = arena(); const s = h.GameState;
    for (const [typeId, gold] of [['BAT',10], ['GOBLIN',20], ['TROLL',40]]) {
        const before = s.score; h.BalanceSystem.bounty({ typeId }); assert.equal(s.score - before, gold);
    }
    s.player.inventory = Array(8).fill({ type: 'food' });
    s.ui.rewardChoice = { options: [{ kind: 'gold', value: 80 }], index: 0 };
    h.GameLogic.chooseChestReward(0); assert.equal(s.score, 150); assert.equal(s.player.inventory.length, 8);
});
test('comida y agua llenas no gastan el objeto ni el turno', () => {
    const h = arena(); const p = h.GameState.player;
    p.inventory = [{ type: 'food', value: 60 }]; h.InventorySystem.useItem(0);
    assert.equal(p.inventory.length, 1); assert.equal(h.GameState.moves, 0);
    p.food = 50; h.InventorySystem.useItem(0); assert.equal(p.food, 100); assert.equal(p.inventory.length, 0);
});
test('el guardado envía puntos y versión de reglas, no la cartera', async () => {
    const h = arena(); const s = h.GameState;
    s.current = 'GAMEOVER'; s.runId = 'balance-save-test'; s.score = 40; s.points = 450;
    h.DOM.menus.victory.classList.add('hidden'); h.document.getElementById('player-name').value = 'mauro';
    let entry;
    h.context.fetch = async (_url, options) => { entry = JSON.parse(options.body); return { ok: true, json: async () => ({ saved: true, entry, rank: 1, total: 1, leaderboard: [entry] }) }; };
    await h.Network.saveScore(); assert.equal(entry.score, 450); assert.equal(entry.ruleset, 'balance-1');
});
test('el autómata no persigue objetos que no caben y compara las recompensas ofrecidas', () => {
    const h = arena(); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'autoplayer.js'), 'utf8'), h.context);
    const bot = h.context.AutoPlayer, s = h.GameState;
    s.player.inventory = Array(8).fill({ type: 'food' });
    s.entities.items = [{ x: 22, y: 12, type: 'food' }, { x: 23, y: 12, type: 'GOLD' }];
    assert.equal(bot.knownItemTargets().length, 1); assert.equal(bot.knownItemTargets()[0].type, 'GOLD');
    s.player.inventory = []; s.player.hp = 40;
    const armor = { item: { type: 'armor', value: 3 } }, weapon = { item: { type: 'weapon', value: 3 } };
    assert.ok(bot.rewardUtility(armor) > bot.rewardUtility(weapon));
});
test('el premio visible sobre un cofre abierto no queda oculto por su símbolo', () => {
    const h = arena(); const s = h.GameState;
    s.entities.chests = [{ x: 21, y: 12, isOpen: true }];
    s.entities.items = [{ x: 21, y: 12, type: 'relic', relicId: 'WARD_STONE', symbol: '&', color: '#fff' }];
    h.Renderer.draw(); assert.match(h.DOM.container.innerHTML, /data-map-x="21" data-map-y="12"[^>]*>&<\/span>/);
});

(async () => {
    let failed = 0;
    for (const { name, fn } of tests) {
        try { await fn(); console.log(`✓ ${name}`); }
        catch (error) { failed++; console.error(`✗ ${name}`); console.error(error); }
    }
    console.log(`\n${tests.length - failed}/${tests.length} pruebas de balance completadas.`);
    if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
