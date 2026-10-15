const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const harness = require('./helpers/game-harness.cjs');

function arena() {
    const h = harness();
    h.GameState.map = Array.from({ length: 24 }, () => Array(70).fill('.'));
    h.GameState.seen = Array.from({ length: 24 }, () => Array(70).fill(true));
    h.GameState.visible = Array.from({ length: 24 }, () => Array(70).fill(true));
    h.GameState.persistence = { 1: [] };
    h.GameState.rng = () => 0.5;
    return h;
}

function enemy(x = 23, y = 12, extra = {}) {
    return { x, y, name: 'Objetivo', symbol: 'M', color: '#fff', hp: 30, maxHp: 30, atk: 0, xp: 10, speed: 0, energy: 0, isSleeping: false, ...extra };
}

function spend(h, id, points = 1) {
    h.GameState.player.talentPoints += points;
    h.ProgressionSystem.open();
    return h.ProgressionSystem.choose(id);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('subir de nivel concede vida y un punto, nunca ataque automático', () => {
    const h = arena(); h.GameState.player.hp = 3;
    h.CombatSystem.gainXp(99);
    assert.equal(h.GameState.player.level, 1);
    h.CombatSystem.gainXp(1);
    assert.equal(h.GameState.player.level, 2);
    assert.equal(h.GameState.player.xp, 0);
    assert.equal(h.GameState.player.nextXp, 150);
    assert.equal(h.GameState.player.maxHp, 110);
    assert.equal(h.GameState.player.hp, 110);
    assert.equal(h.GameState.player.baseAtk, 3);
    assert.equal(h.GameState.player.talentPoints, 1);
    assert.equal(h.GameState.current, 'PLAYING', 'La elección espera al cierre del turno');
});

test('una recompensa grande acumula niveles, puntos y XP sobrante', () => {
    const h = arena(); h.CombatSystem.gainXp(500);
    assert.equal(h.GameState.player.level, 4);
    assert.equal(h.GameState.player.xp, 25);
    assert.equal(h.GameState.player.nextXp, 337);
    assert.equal(h.GameState.player.talentPoints, 3);
    assert.equal(h.GameState.player.maxHp, 130);
});

test('un barrido completa todas las bajas y la respuesta enemiga antes de abrir talentos', () => {
    const h = arena();
    h.GameState.entities.enemies = [enemy(21, 12, { hp: 1, xp: 60 }), enemy(20, 13, { hp: 1, xp: 60 })];
    let stateDuringEnemies;
    const update = h.GameLogic.updateEnemies;
    h.GameLogic.updateEnemies = () => { stateDuringEnemies = h.GameState.current; update(); };
    h.CombatSystem.performAreaAttack();
    assert.equal(stateDuringEnemies, 'PLAYING');
    assert.equal(h.GameState.entities.enemies.length, 0);
    assert.equal(h.GameState.score, 50);
    assert.equal(h.GameState.moves, 1);
    assert.equal(h.GameState.current, 'CHARACTER');
    assert.equal(h.GameState.player.talentPoints, 1);
    assert.equal(h.GameState.player.combat.cooldowns.area, 5);
});

test('morir en la respuesta del turno tiene prioridad sobre la elección de talento', () => {
    const h = arena();
    h.GameState.entities.enemies = [enemy(21, 12, { speed: 1, atk: 1000 })];
    h.CombatSystem.gainXp(100); h.GameLogic.endTurn();
    assert.equal(h.GameState.current, 'GAMEOVER');
    assert.equal(h.DOM.menus.character.classList.contains('hidden'), true);
});

test('Fuerza suma +2 al ataque base por punto y no permite doble gasto', () => {
    const h = arena();
    assert.equal(spend(h, 'strength'), true);
    assert.equal(h.GameState.player.baseAtk, 5);
    assert.equal(h.GameState.player.talents.strength, 1);
    assert.equal(h.GameState.player.talentPoints, 0);
    assert.equal(h.ProgressionSystem.choose('strength'), false);
    assert.equal(h.GameState.player.baseAtk, 5);
    assert.equal(spend(h, 'strength'), true);
    assert.equal(h.GameState.player.baseAtk, 7);
    assert.equal(h.GameState.moves, 0);
});

test('Resistencia se suma a la armadura y participa en Defender', () => {
    const h = arena();
    h.GameState.player.talents.resilience = 2;
    h.GameState.player.equipment.armor = { value: 2, name: 'Malla' };
    h.CombatSystem.enemyAttack(enemy(21, 12, { atk: 10 }));
    assert.equal(h.GameState.player.hp, 94, '10 - 2 natural - 2 armadura');
    h.GameState.player.combat.isDefending = true;
    h.CombatSystem.enemyAttack(enemy(21, 12, { atk: 10 }));
    assert.equal(h.GameState.player.hp, 93, 'Defender potencia la defensa combinada');
    h.UISystem.updateHUD();
    assert.equal(h.elements.get('def-val').textContent, '2');
    const properties = Object.fromEntries(h.UISystem.equipmentInfo('armor').properties);
    assert.equal(properties['Defensa natural + armadura'], '4');
});

test('la defensa natural no elimina los peligros de supervivencia', () => {
    const h = arena();
    h.GameState.player.talents.resilience = 5;
    h.GameState.player.food = 0;
    h.GameLogic.processSurvival();
    assert.equal(h.GameState.player.hp, 98);
});

test('Velocidad reduce de verdad las acciones enemigas, con energía fraccionaria estable', () => {
    for (const rank of [0, 1, 2, 3]) {
        const h = arena(); let attacks = 0;
        h.GameState.player.talents.speed = rank;
        h.GameState.entities.enemies = [enemy(21, 12, { speed: 1 })];
        h.CombatSystem.enemyAttack = () => { attacks++; };
        for (let i = 0; i < 100; i++) h.GameLogic.updateEnemies();
        assert.equal(attacks, Math.floor(100 / (1 + rank * 0.15)), `Rango ${rank}`);
        assert.ok(h.GameState.entities.enemies[0].energy >= -1e-9 && h.GameState.entities.enemies[0].energy < 1);
    }
});

test('los límites de talentos no consumen puntos y Fuerza siempre queda disponible', () => {
    const h = arena(); h.GameState.player.talentPoints = 2;
    Object.assign(h.GameState.player.talents, { resilience: 5, speed: 3, ranged: 5, strength: 20 });
    h.ProgressionSystem.open();
    for (const id of ['resilience', 'speed', 'ranged', 'unknown']) assert.equal(h.ProgressionSystem.choose(id), false);
    assert.equal(h.GameState.player.talentPoints, 2);
    assert.equal(h.ProgressionSystem.choose('strength'), true);
    assert.equal(h.GameState.player.talentPoints, 1);
    assert.equal(h.GameState.current, 'CHARACTER');
});

test('puedes guardar puntos y abrir N después sin repetir el aviso en cada turno', () => {
    const h = arena(); h.CombatSystem.gainXp(100); h.GameLogic.endTurn();
    h.emit('keydown', 'Escape');
    assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(h.GameState.player.talentPoints, 1);
    h.GameLogic.endTurn();
    assert.equal(h.GameState.current, 'PLAYING');
    h.emit('keydown', 'n');
    const moves = h.GameState.moves;
    h.emit('keydown', '2');
    assert.equal(h.ProgressionSystem.defense(), 1);
    assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(h.GameState.moves, moves);
});

test('Personaje pausa los turnos, conserva puntos y regresa a la mochila o al equipo', async () => {
    for (const previous of ['INVENTORY', 'EQUIPMENT']) {
        const h = arena(); h.StateController.change(previous); h.ProgressionSystem.open();
        const before = JSON.stringify({ x: h.GameState.player.x, moves: h.GameState.moves, hp: h.GameState.player.hp });
        assert.equal(await h.GameLogic.movePlayer(1, 0), false);
        h.GameLogic.endTurn();
        assert.equal(JSON.stringify({ x: h.GameState.player.x, moves: h.GameState.moves, hp: h.GameState.player.hp }), before);
        h.emit('keydown', 'n'); assert.equal(h.GameState.current, previous);
    }
});

test('subir de nivel mientras mantienes dirección cancela la repetición pendiente', async () => {
    const h = arena(); h.GameState.entities.enemies = [enemy(21, 12, { hp: 1, xp: 100 })];
    h.emit('keydown', 'd'); await h.flush();
    assert.equal(h.GameState.current, 'CHARACTER');
    assert.equal(h.MovementInput.key, null);
    assert.equal(h.MovementInput.timer, null);
    h.emit('keydown', '1'); await h.flush();
    assert.equal(h.MovementInput.timer, null);
    assert.equal(h.GameState.moves, 1);
});

test('el dardo requiere aprenderlo y apuntar o cancelar no consume acciones', () => {
    const h = arena();
    h.emit('keydown', 'l'); assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(spend(h, 'ranged'), true);
    h.GameState.entities.enemies = [enemy(23, 13)];
    h.emit('keydown', 'l');
    assert.equal(h.GameState.current, 'TARGETING');
    assert.match(h.DOM.container.innerHTML, /class="ranged-aim"/);
    h.emit('keydown', 'Escape');
    assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(h.GameState.moves, 0);
    assert.equal(h.GameState.player.combat.cooldowns.ranged, 0);
    assert.doesNotMatch(h.DOM.container.innerHTML, /class="ranged-aim"/);
});

test('el dardo impacta a distancia sin usar el arma de mano y recarga en dos acciones posteriores', () => {
    const h = arena(); h.GameState.player.talents.ranged = 1;
    h.GameState.player.equipment.weapon = { value: 100, name: 'Espada' };
    const target = enemy(24, 12); h.GameState.entities.enemies = [target];
    h.CombatSystem.startTargeting('ranged'); h.CombatSystem.executeAttack(1, 0);
    assert.equal(target.hp, 25, 'El daño base es 3 + 2 de talento, no el de la espada');
    assert.equal(h.GameState.moves, 1);
    assert.equal(h.GameState.player.combat.cooldowns.ranged, 2);
    h.CombatSystem.startTargeting('ranged'); assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(h.GameState.moves, 1);
    h.CombatSystem.performWait(); assert.equal(h.GameState.player.combat.cooldowns.ranged, 1);
    h.CombatSystem.performWait(); assert.equal(h.GameState.player.combat.cooldowns.ranged, 0);
});

test('el dardo golpea únicamente al primer enemigo de su trayectoria', () => {
    const h = arena(); h.GameState.player.talents.ranged = 2;
    const first = enemy(22, 12), second = enemy(24, 12);
    h.GameState.entities.enemies = [first, second];
    h.CombatSystem.startTargeting('ranged'); h.CombatSystem.executeAttack(1, 0);
    assert.equal(first.hp, 23); assert.equal(second.hp, 30);
});

test('paredes, cofres abiertos o cerrados y mercaderes bloquean los proyectiles', () => {
    for (const obstacle of ['wall', 'closedChest', 'openChest', 'shop']) {
        const h = arena(); h.GameState.player.talents.ranged = 1;
        const target = enemy(23, 12); h.GameState.entities.enemies = [target];
        if (obstacle === 'wall') h.GameState.map[12][22] = '#';
        else if (obstacle === 'shop') h.GameState.entities.shops = [{ x: 22, y: 12 }];
        else h.GameState.entities.chests = [{ x: 22, y: 12, isOpen: obstacle === 'openChest' }];
        h.CombatSystem.startTargeting('ranged'); h.CombatSystem.executeAttack(1, 0);
        assert.equal(target.hp, 30, obstacle);
        assert.equal(h.GameState.moves, 0);
        assert.equal(h.GameState.player.combat.cooldowns.ranged, 0);
    }
});

test('no se dispara atravesando esquinas ni a enemigos ocultos o fuera de alcance', () => {
    for (const scenario of ['corner', 'fog', 'range']) {
        const h = arena(); h.GameState.player.talents.ranged = 1;
        let target;
        if (scenario === 'corner') { target = enemy(22, 14); h.GameState.map[12][21] = '#'; }
        else if (scenario === 'fog') { target = enemy(23, 12); h.GameState.visible[12][23] = false; }
        else target = enemy(25, 12);
        h.GameState.entities.enemies = [target];
        h.CombatSystem.startTargeting('ranged'); h.CombatSystem.executeAttack(1, scenario === 'corner' ? 1 : 0);
        assert.equal(target.hp, 30, scenario);
    }
});

test('las ocho direcciones son válidas y los dardos pueden cruzar un hueco', () => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const h = arena(); h.GameState.player.talents.ranged = 1;
        const target = enemy(20 + dx * 3, 12 + dy * 3); h.GameState.entities.enemies = [target];
        h.FloorSystem.isHole = (x, y) => x === 20 + dx && y === 12 + dy;
        h.CombatSystem.startTargeting('ranged'); h.CombatSystem.executeAttack(dx, dy);
        assert.equal(target.hp, 25, `${dx},${dy}`);
    }
});

test('las mejoras de alcance y Fuerza aumentan el dardo de forma compatible', () => {
    const h = arena(); h.GameState.player.talents.ranged = 5;
    assert.equal(h.ProgressionSystem.rangedRange(), 8);
    assert.equal(h.ProgressionSystem.rangedDamage(), 13);
    spend(h, 'strength');
    assert.equal(h.ProgressionSystem.rangedDamage(), 15);
    assert.equal(h.CombatSystem.projectilePath(1, 0).length, 8);
});

test('una baja con dardo conserva XP, botín de Goblin y la elección de talento', () => {
    const h = arena(); h.GameState.player.talents.ranged = 1;
    h.GameState.entities.enemies = [enemy(23, 12, { hp: 1, xp: 100, name: 'Goblin', behavior: 'THIEF', stolenGold: 20 })];
    h.CombatSystem.startTargeting('ranged'); h.CombatSystem.executeAttack(1, 0);
    assert.equal(h.GameState.entities.enemies.length, 0);
    assert.equal(h.GameState.entities.items[0].value, 20);
    assert.equal(h.GameState.score, 25);
    assert.equal(h.GameState.player.stats.kills.Goblin, 1);
    assert.equal(h.GameState.current, 'CHARACTER');
    assert.equal(h.GameState.player.talentPoints, 1);
    assert.equal(h.GameState.player.combat.cooldowns.ranged, 2);
});

test('las direcciones inválidas y los intentos repetidos de aprendizaje no crean acciones', () => {
    const h = arena(); h.GameState.player.talents.ranged = 1;
    h.GameState.entities.enemies = [enemy(23, 13)];
    h.CombatSystem.startTargeting('ranged');
    for (const [dx, dy] of [[0, 0], [2, 0], [0.5, 1]]) h.CombatSystem.executeAttack(dx, dy);
    assert.equal(h.GameState.moves, 0); assert.equal(h.GameState.current, 'TARGETING');
    h.emit('keydown', 'Escape'); h.GameState.player.talentPoints = 2; h.ProgressionSystem.open();
    h.emit('keydown', '1', { repeat: true });
    assert.equal(h.GameState.player.talentPoints, 2);
    h.emit('keydown', 'ArrowRight'); assert.equal(h.GameState.ui.characterIndex, 1);
    assert.equal(h.GameState.moves, 0);
});

test('los talentos persisten entre plantas y se limpian al iniciar otra expedición', () => {
    const h = arena();
    Object.assign(h.GameState.player.talents, { strength: 2, resilience: 1, speed: 1, ranged: 2 });
    h.GameState.player.talentPoints = 1; h.GameState.player.baseAtk = 7;
    const build = JSON.stringify(h.GameState.player.talents);
    h.GameState.seed = 777; h.GameState.level = 3; h.GameState.entryMethod = 'descending'; h.MapSystem.initLevel();
    assert.equal(JSON.stringify(h.GameState.player.talents), build);
    assert.equal(h.GameState.player.talentPoints, 1);
    assert.equal(h.GameState.player.baseAtk, 7);
    h.GameLogic.init(777);
    assert.equal(h.GameState.player.talentPoints, 0);
    assert.equal(h.GameState.player.baseAtk, 3);
    for (const rank of Object.values(h.GameState.player.talents)) assert.equal(rank, 0);
    assert.equal(h.GameState.player.combat.cooldowns.ranged, 0);
});

test('el AutoPlayer no queda bloqueado en la nueva elección de talentos', async () => {
    const h = arena();
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'autoplayer.js'), 'utf8'), h.context);
    h.CombatSystem.gainXp(100); h.GameLogic.endTurn();
    const moves = h.GameState.moves;
    await h.context.AutoPlayer.step();
    assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(h.GameState.player.talents.strength, 1);
    assert.equal(h.GameState.moves, moves);
});

test('la recuperación de rutas del AutoPlayer no se adelanta al menú de talentos', async () => {
    const h = arena();
    for (const script of ['autoplayer.js', 'autoplayer-profiles.js', 'autoplayer-navigation.js', 'autoplayer-mission.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', script), 'utf8'), h.context);
    }
    h.context.AutoPlayer.reset({ goalDepth: 9 });
    h.context.AutoPlayer.memory.escapeTarget = { x: 21, y: 12, key: '21,12', reason: 'test', fingerprint: 'test' };
    h.CombatSystem.gainXp(100); h.GameLogic.endTurn();
    const decision = await h.context.AutoPlayer.step();
    assert.equal(decision.type, 'TALENT');
    assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(h.GameState.player.talents.strength, 1);
    assert.equal(h.GameState.player.x, 20);
});

test('el atajo 3 de Velocidad no activa el salto de planta de las herramientas dev', () => {
    const h = arena();
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dev-tools.js'), 'utf8'), h.context);
    h.GameState.player.talentPoints = 1; h.ProgressionSystem.open(); h.emit('keydown', '3');
    assert.equal(h.GameState.player.talents.speed, 1);
    assert.equal(h.GameState.level, 1);
    assert.equal(h.GameState.ui.testMode, false);
});

test('XP no válida no altera la progresión', () => {
    const h = arena();
    for (const amount of [NaN, Infinity, -10, 0]) h.CombatSystem.gainXp(amount);
    assert.equal(h.GameState.player.xp, 0); assert.equal(h.GameState.player.talentPoints, 0);
});

(async () => {
    for (const { name, fn } of tests) { await fn(); console.log(`✓ ${name}`); }
    console.log(`\n${tests.length}/${tests.length} pruebas de progresión completadas.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
