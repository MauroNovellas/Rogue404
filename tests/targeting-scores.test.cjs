const assert = require('node:assert/strict');
const harness = require('./helpers/game-harness.cjs');

function arena() {
    const h = harness();
    h.GameState.map = Array.from({ length: 24 }, () => Array(70).fill('.'));
    h.GameState.seen = Array.from({ length: 24 }, () => Array(70).fill(true));
    h.GameState.visible = Array.from({ length: 24 }, () => Array(70).fill(true));
    h.GameState.persistence = { 1: [] }; h.GameState.rng = () => 0.5;
    h.GameState.player.talents.ranged = 1;
    return h;
}
function enemy(x, y) { return { x, y, hp: 30, maxHp: 30, name: 'Murciélago', symbol: 'M', color: '#fff', speed: 0, energy: 0, atk: 0, xp: 10 }; }
function scoreGame() {
    const h = harness(); h.GameState.current = 'GAMEOVER'; h.GameState.runId = 'run-network-test';
    h.DOM.menus.victory.classList.add('hidden'); h.document.getElementById('player-name').value = 'mauro';
    h.context.console = { log() {}, error() {} };
    return h;
}
function acknowledge(payload, rank = 21) { return { saved: true, entry: payload, rank, total: 30, leaderboard: [] }; }
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('los dardos alcanzan las 80 posiciones del radio 4, no solo ocho rayos', () => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        if (!dx && !dy) continue;
        const h = arena(), target = enemy(20 + dx, 12 + dy);
        h.GameState.entities.enemies = [target];
        h.CombatSystem.startTargeting('ranged');
        assert.equal(h.GameState.current, 'TARGETING', `${dx},${dy}`);
        assert.equal(h.CombatSystem.fireRanged(), true);
        assert.equal(target.hp, 25, `${dx},${dy}`);
        assert.equal(h.GameState.moves, 1);
    }
});

test('la trayectoria oblicua respeta cada casilla cruzada y no atraviesa obstáculos', () => {
    const reference = arena().CombatSystem.projectilePathTo(24, 14);
    assert.ok(reference.some(cell => cell.x !== 20 && cell.y !== 12));
    for (const cell of reference.slice(0, -1)) {
        const h = arena(); h.GameState.entities.enemies = [enemy(24, 14)];
        h.GameState.map[cell.y][cell.x] = '#';
        assert.equal(h.CombatSystem.rangedTargets().length, 0, `${cell.x},${cell.y}`);
        h.CombatSystem.startTargeting('ranged');
        assert.equal(h.GameState.current, 'PLAYING'); assert.equal(h.GameState.moves, 0);
    }
});

test('Tab, Shift+Tab y flechas seleccionan sin disparar ni mover al personaje', () => {
    const h = arena(); h.GameState.entities.enemies = [enemy(23, 13), enemy(18, 15)];
    h.emit('keydown', 'l'); const first = JSON.stringify(h.GameState.ui.rangedTarget);
    h.emit('keydown', 'Tab'); assert.notEqual(JSON.stringify(h.GameState.ui.rangedTarget), first);
    h.emit('keydown', 'Tab', { shiftKey: true }); assert.equal(JSON.stringify(h.GameState.ui.rangedTarget), first);
    h.emit('keydown', 'ArrowRight');
    assert.equal(h.GameState.moves, 0); assert.equal(h.GameState.player.x, 20);
    h.emit('keydown', 'Enter');
    assert.equal(h.GameState.moves, 1); assert.equal(h.GameState.current, 'PLAYING');
    assert.equal(h.GameState.player.combat.cooldowns.ranged, 2);
});

test('el clic puede elegir otro enemigo válido sin depender del objetivo preseleccionado', () => {
    const h = arena(), first = enemy(22, 13), second = enemy(17, 14);
    h.GameState.entities.enemies = [first, second]; h.CombatSystem.startTargeting('ranged');
    assert.equal(h.CombatSystem.fireRanged(second.x, second.y), true);
    assert.equal(first.hp, 30); assert.equal(second.hp, 25);
});

test('un objetivo oculto, lejano o interceptado no aparece entre los seleccionables', () => {
    const h = arena(), first = enemy(22, 13), behind = enemy(24, 14), hidden = enemy(17, 14), far = enemy(25, 12);
    h.GameState.entities.enemies = [first, behind, hidden, far]; h.GameState.visible[14][17] = false;
    const targets = h.CombatSystem.rangedTargets();
    assert.equal(targets.length, 1); assert.equal(targets[0], first);
    h.CombatSystem.startTargeting('ranged');
    assert.equal(h.CombatSystem.fireRanged(24, 14), false); assert.equal(h.GameState.moves, 0);
});

test('el símbolo de una escalera descubierta permanece en la niebla', () => {
    const h = arena(); h.GameState.stairs = { up: { x: 10, y: 10 }, down: { x: 60, y: 20 } };
    h.GameState.seen.forEach(row => row.fill(false)); h.GameState.visible.forEach(row => row.fill(false));
    h.GameState.seen[10][10] = true; h.DOM.container.clientWidth = 1000; h.DOM.container.clientHeight = 600;
    h.Renderer.draw();
    assert.match(h.DOM.container.innerHTML, /data-map-x="10" data-map-y="10"[^>]*>&lt;<\/span>/);
    const markers = h.document.getElementById('stair-compass').children;
    assert.equal(markers.length, 1); assert.equal(markers[0].dataset.stair, 'up');
    assert.match(markers[0].textContent, /Subida/);
    assert.equal(h.GameState.seen[20][60], false);
});

test('ambas escaleras mantienen un indicador aunque queden fuera del encuadre', () => {
    const h = arena(); h.GameState.stairs = { up: { x: 2, y: 2 }, down: { x: 66, y: 21 } };
    h.DOM.container.clientWidth = 250; h.DOM.container.clientHeight = 220;
    h.Renderer.draw();
    assert.ok(h.Renderer.viewport.x > 2 && h.Renderer.viewport.x + h.Renderer.viewport.cols < 66);
    const markers = h.document.getElementById('stair-compass').children;
    assert.equal(markers.length, 2);
    assert.match(markers[0].textContent, /↖/); assert.match(markers[1].textContent, /↘/);
});

test('se recuerdan las escaleras al volver de planta, pero una partida nueva no revela la bajada', () => {
    const h = harness(); h.GameLogic.init(777);
    assert.equal(Boolean(h.GameState.knownStairs[1].down), false);
    h.GameState.player.x = h.GameState.stairs.down.x; h.GameState.player.y = h.GameState.stairs.down.y;
    h.MapSystem.updateFog(); assert.equal(h.GameState.knownStairs[1].down, true);
    h.GameState.level = 2; h.GameState.entryMethod = 'descending'; h.MapSystem.initLevel();
    h.GameState.level = 1; h.GameState.entryMethod = 'ascending'; h.MapSystem.initLevel();
    assert.equal(h.GameState.knownStairs[1].up, true); assert.equal(h.GameState.knownStairs[1].down, true);
    assert.equal(h.GameState.seen[h.GameState.stairs.up.y][h.GameState.stairs.up.x], true);
    assert.equal(h.GameState.visible[h.GameState.stairs.up.y][h.GameState.stairs.up.x], false);
    h.GameLogic.init(777); assert.equal(Boolean(h.GameState.knownStairs[1].down), false);
});

test('el guardado exige confirmación de esta partida y explica los puestos fuera del Top 20', async () => {
    const h = scoreGame(); let requests = 0;
    h.context.fetch = async (_, options) => { requests++; return { ok: true, json: async () => acknowledge(JSON.parse(options.body)) }; };
    await Promise.all([h.Network.saveScore(), h.Network.saveScore()]);
    assert.equal(requests, 1); assert.equal(h.Network.isSaving, true);
    assert.match(h.elements.get('death-save-status').textContent, /Fuera del Top 20/);
    assert.equal(h.elements.get('death-save-button').disabled, true);
    assert.equal(h.timers.size, 0, 'No se reinicia automáticamente borrando la confirmación');
});

test('los errores del servidor se muestran y permiten reintentar con el mismo identificador', async () => {
    const h = scoreGame(); let requests = 0;
    h.context.fetch = async (_, options) => {
        requests++; const payload = JSON.parse(options.body);
        assert.equal(payload.runId, 'run-network-test');
        return requests === 1 ? { ok: false, status: 500, json: async () => ({ error: 'Sin permisos de escritura' }) } : { ok: true, json: async () => acknowledge(payload) };
    };
    await h.Network.saveScore();
    assert.match(h.elements.get('death-save-status').textContent, /permisos de escritura/);
    assert.equal(h.Network.isSaving, false); assert.equal(h.elements.get('death-save-button').disabled, false);
    await h.Network.saveScore(); assert.equal(h.Network.isSaving, true); assert.equal(requests, 2);
});

test('una página 404 HTML o una confirmación ajena nunca se presentan como guardado correcto', async () => {
    for (const scenario of ['html', 'wrongId']) {
        const h = scoreGame();
        h.context.fetch = async () => ({ ok: true, json: async () => { if (scenario === 'html') throw new SyntaxError(); return acknowledge({ runId: 'another-run' }); } });
        await h.Network.saveScore();
        assert.equal(h.Network.isSaving, false);
        assert.match(h.elements.get('death-save-status').textContent, /No se pudo guardar/);
    }
});

test('las partidas de pruebas explican el bloqueo y nunca envían resultados', async () => {
    const h = scoreGame(); h.GameState.ui.testMode = true; let calls = 0;
    h.context.fetch = async () => { calls++; };
    await h.Network.saveScore(); assert.equal(calls, 0);
    assert.match(h.elements.get('death-save-status').textContent, /pruebas/);
});

test('una respuesta tardía no modifica la siguiente expedición', async () => {
    const h = scoreGame(); let finish;
    h.context.fetch = (_, options) => new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => acknowledge(JSON.parse(options.body)) }); });
    const saving = h.Network.saveScore(); h.GameState.runId = 'new-expedition'; h.Network.isSaving = false;
    finish(); await saving;
    assert.equal(h.Network.isSaving, false); assert.notEqual(h.elements.get('death-save-button').textContent, 'Guardada');
});

(async () => {
    for (const { name, fn } of tests) { await fn(); console.log(`✓ ${name}`); }
    console.log(`\n${tests.length}/${tests.length} pruebas de apuntado, escaleras y confirmaciones completadas.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
