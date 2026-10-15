const assert = require('node:assert/strict');
const harness = require('./helpers/game-harness.cjs');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('las barras usan el máximo de vida real, porcentajes accesibles y avisos', () => {
    const h = harness();
    Object.assign(h.GameState.player, { hp: 40, maxHp: 200, food: 70, water: 15 });
    h.UISystem.updateResourceMeters();
    for (const [id, value] of [['hp', 20], ['food', 70], ['water', 15]]) {
        assert.equal(h.elements.get(`${id}-fill`).style.width, `${value}%`);
        assert.equal(h.elements.get(`${id}-meter`).ariaValueNow, String(value));
    }
    assert.equal(h.elements.get('hp-percent').textContent, '20%');
    assert.match(h.elements.get('hp-meter').className, /resource-low/);
    assert.doesNotMatch(h.elements.get('food-meter').className, /resource-low/);
});

test('las barras nunca salen de 0–100, incluso sin máximo de vida', () => {
    const h = harness();
    Object.assign(h.GameState.player, { hp: 20, maxHp: 0, food: -20, water: 500 });
    h.UISystem.updateResourceMeters();
    assert.equal(h.elements.get('hp-fill').style.width, '0%');
    assert.equal(h.elements.get('food-fill').style.width, '0%');
    assert.equal(h.elements.get('water-fill').style.width, '100%');
});

test('la ficha muestra arma, calidad, ataque y precio reales, o huecos vacíos', () => {
    const h = harness();
    assert.equal(h.UISystem.equipmentInfo('weapon').name, 'Puños');
    assert.equal(h.UISystem.equipmentInfo('armor').quality, 'Sin objeto equipado');
    h.GameState.player.equipment.weapon = { name: 'Espada [ÉPICO]', value: 7, buyPrice: 200, symbol: '!' };
    const info = h.UISystem.equipmentInfo('weapon');
    assert.equal(info.quality, 'ÉPICO');
    assert.equal(info.power, 'ATK +7');
    const props = Object.fromEntries(info.properties);
    assert.equal(props['Ataque base + arma'], '10');
    assert.equal(props['Precio de compra'], '200 oro');
    assert.equal(props['Efectos especiales'], 'Ninguno');
});

test('la ficha explica todas las propiedades de los tres equipos especiales', () => {
    const h = harness();
    for (const [traits, expected] of [
        [{ slipResist: 0.75, frozenRestHeal: 1 }, { 'Resistencia a resbalones': '75%', 'Descanso en hielo': '+1 vida' }],
        [{ heatResist: 0.6, thirstResist: 0.6, magmaRestHeal: 1 }, { 'Resistencia al calor': '60%', 'Resiste sed extra por calor': '60%', 'Descanso en magma': '+1 vida' }],
        [{ fallDamageResist: 0.5, retainEquippedOnFall: true }, { 'Resistencia a caídas': '50%', 'Conserva equipo al caer': 'Sí' }]
    ]) {
        h.GameState.player.equipment.armor = { name: 'Equipo', value: 1, specialId: 'SPECIAL', traits };
        const properties = Object.fromEntries(h.UISystem.equipmentInfo('armor').properties);
        for (const [key, value] of Object.entries(expected)) assert.equal(properties[key], value);
        assert.equal(properties['Defensa'], '+1');
    }
});

test('O abre equipo desde la mochila y regresa sin consumir turnos', () => {
    const h = harness();
    h.StateController.change(h.STATE_ENUM.INVENTORY);
    const moves = h.GameState.moves;
    h.emit('keydown', 'o');
    assert.equal(h.GameState.current, h.STATE_ENUM.EQUIPMENT);
    assert.equal(h.elements.get('equipment-grid').children.length, 2);
    h.emit('keydown', 'Escape');
    assert.equal(h.GameState.current, h.STATE_ENUM.INVENTORY);
    assert.equal(h.GameState.moves, moves);
});

test('mantener dirección repite con cadencia propia y soltar cancela', async () => {
    const h = harness(); let calls = 0;
    h.GameLogic.movePlayer = async () => { calls++; return true; };
    h.emit('keydown', 'ArrowRight'); await h.flush();
    assert.equal(calls, 1);
    assert.equal(await h.tick(), h.CONFIG.INPUT.holdDelay);
    assert.equal(calls, 2);
    assert.equal(await h.tick(), h.CONFIG.INPUT.repeatInterval);
    assert.equal(calls, 3);
    h.emit('keyup', 'ArrowRight');
    assert.equal(h.timers.size, 0);
    assert.equal(h.MovementInput.key, null);
});

test('la repetición nativa no duplica pasos ni habilidades especiales', async () => {
    const h = harness(); let calls = 0;
    h.GameLogic.movePlayer = async () => { calls++; return true; };
    h.emit('keydown', 'd'); await h.flush();
    const generation = h.MovementInput.generation;
    assert.equal(h.emit('keydown', 'd', { repeat: true }).defaultPrevented, true);
    assert.equal(calls, 1);
    assert.equal(h.MovementInput.generation, generation);
    h.emit('keydown', 't', { repeat: true });
    assert.equal(h.GameState.moves, 0);
});

test('una pared cancela, pero se puede continuar atacando por contacto', async () => {
    for (const enemy of [false, true]) {
        const h = harness();
        if (enemy) h.GameState.entities.enemies.push({ x: 21, y: 12 });
        h.GameLogic.movePlayer = async () => false;
        h.emit('keydown', 'd'); await h.flush();
        assert.equal(h.timers.size, enemy ? 1 : 0);
    }
});

test('los menús, la pestaña oculta y la pérdida de foco cancelan la marcha', async () => {
    for (const stop of [h => h.emit('keydown', 'm'), h => h.emit('keydown', 'o'), h => { h.document.hidden = true; h.emit('visibilitychange'); }, h => h.emit('window:blur')]) {
        const h = harness();
        h.GameLogic.movePlayer = async () => true;
        h.emit('keydown', 'd'); await h.flush();
        assert.equal(h.timers.size, 1);
        stop(h);
        assert.equal(h.timers.size, 0);
        assert.equal(h.MovementInput.key, null);
    }
});

test('los pasos esperan a las animaciones y no se reactivan tras soltar', async () => {
    for (const release of [false, true]) {
        const h = harness(); let finish, calls = 0;
        h.GameLogic.movePlayer = () => { calls++; h.GameState.ui.movementLocked = true; return new Promise(resolve => { finish = () => { h.GameState.ui.movementLocked = false; resolve(true); }; }); };
        h.emit('keydown', 'd'); await h.flush();
        assert.equal(calls, 1);
        assert.equal(h.timers.size, 0, 'No se repite mientras dura el movimiento');
        h.emit('keydown', 'd', { repeat: true });
        assert.equal(calls, 1);
        if (release) h.emit('keyup', 'd');
        finish(); await h.flush();
        assert.equal(h.timers.size, release ? 0 : 1);
    }
});

test('un movimiento pendiente no se reanuda al salir de un menú', async () => {
    const h = harness(); let finish;
    h.GameLogic.movePlayer = () => new Promise(resolve => { finish = resolve; });
    h.emit('keydown', 'd');
    h.StateController.change(h.STATE_ENUM.INVENTORY);
    h.StateController.change(h.STATE_ENUM.PLAYING);
    finish(true); await h.flush();
    assert.equal(h.timers.size, 0);
    assert.equal(h.MovementInput.key, null);
});

test('el diario conserva sus flechas para desplazarse, no para caminar', () => {
    const h = harness(); let calls = 0;
    h.GameLogic.movePlayer = () => { calls++; return true; };
    h.DOM.log.focus(); h.emit('keydown', 'ArrowDown');
    assert.equal(calls, 0);
});

test('el encuadre elimina márgenes desconocidos sin modificar la niebla', () => {
    const h = harness();
    h.DOM.container.clientWidth = 980; h.DOM.container.clientHeight = 560;
    h.GameState.seen = Array.from({ length: h.CONFIG.GRID.rows }, () => Array(h.CONFIG.GRID.cols).fill(false));
    h.GameState.seen[12][20] = true;
    const before = JSON.stringify(h.GameState.seen);
    const view = h.Renderer.getViewport();
    assert.equal(view.cols, 3); assert.equal(view.rows, 3);
    assert.equal(view.fontSize, 32);
    assert.equal(JSON.stringify(h.GameState.seen), before);
});

test('el encuadre mantiene al jugador dentro de pantalla, incluidos los bordes', () => {
    const h = harness();
    h.GameState.seen = Array.from({ length: h.CONFIG.GRID.rows }, () => Array(h.CONFIG.GRID.cols).fill(true));
    for (const [width, height] of [[980, 560], [350, 270], [220, 140]]) {
        h.DOM.container.clientWidth = width; h.DOM.container.clientHeight = height;
        for (const [x, y] of [[0, 0], [69, 23], [35, 12]]) {
            Object.assign(h.GameState.player, { x, y });
            const view = h.Renderer.getViewport();
            assert.ok(view.x >= 0 && view.y >= 0 && view.x + view.cols <= 70 && view.y + view.rows <= 24);
            assert.ok(x >= view.x && x < view.x + view.cols && y >= view.y && y < view.y + view.rows);
            assert.ok(view.cols * view.fontSize * 0.61 <= width - 24);
            assert.ok(view.rows * view.fontSize <= height - 24);
        }
    }
});

(async () => {
    for (const { name, fn } of tests) { await fn(); console.log(`✓ ${name}`); }
    console.log(`\n${tests.length}/${tests.length} pruebas de interfaz y movimiento completadas.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
