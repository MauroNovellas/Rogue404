const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/game-harness.cjs');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function arena() {
    const h = harness({ renderInventory: true });
    const s = h.GameState;
    s.map = Array.from({ length: 24 }, () => Array(70).fill('.'));
    s.seen = s.map.map(row => row.map(() => true)); s.visible = s.map.map(row => row.map(() => true));
    s.persistence = { 1: [] }; s.rng = () => .5;
    s.stairs = { up: { x: 2, y: 2 }, down: { x: 60, y: 20 } };
    return h;
}
const armor = (extra = {}) => ({ type: 'armor', name: 'Malla [BUENO]', symbol: ']', value: 5, x: 21, y: 12, color: '#4682b4', ...extra });
const fullBag = s => { s.player.inventory = Array.from({ length: 8 }, (_, i) => ({ type: 'food', value: 20, name: `Reserva ${i}`, symbol: '%' })); };

test('G permite comparar con mochila llena sin recoger, tirar, gastar turno ni sortear valores', () => {
    const h = arena(), s = h.GameState, item = armor(); fullBag(s);
    s.entities.items = [item]; s.player.equipment.armor = armor({ name: 'Malla vieja', value: 2, traits: { heatResist: .6 } });
    s.rng = () => { throw Error('Inspeccionar no debe consumir azar'); };
    h.emit('keydown', 'g');
    assert.equal(s.current, 'INSPECT'); assert.equal(s.moves, 0); assert.equal(s.entities.items[0], item);
    assert.equal(s.player.inventory.length, 8);
    assert.match(h.elements.get('ground-detail').textContent, /Defensa: 2 → 5/);
    assert.match(h.elements.get('ground-detail').textContent, /Propiedades de lo equipado.*60%/);
    assert.equal(h.elements.get('ground-actions').children[0].disabled, true);
    assert.equal(h.elements.get('ground-actions').children[1].disabled, false);
    h.emit('keydown', 'Escape'); assert.equal(s.current, 'PLAYING'); assert.equal(s.moves, 0);
});
test('solo se listan objetos realmente visibles, ordenados por cercanía', () => {
    const h = arena(), s = h.GameState;
    const near = armor(), far = armor({ x: 25 }), hidden = armor({ x: 26 });
    s.entities.items = [far, hidden, near, { type: 'GOLD', x: 20, y: 12 }]; s.visible[12][26] = false;
    assert.equal(h.GroundSystem.visibleItems().length, 2); assert.equal(h.GroundSystem.visibleItems()[0], near);
    assert.equal(h.GroundSystem.open(hidden), false); assert.equal(s.current, 'PLAYING');
    h.GroundSystem.open(far); assert.equal(h.elements.get('ground-actions').children[1].disabled, true);
    assert.equal(h.GroundSystem.equip(), false); assert.equal(s.moves, 0);
    h.emit('keydown', 'ArrowLeft'); assert.equal(s.ui.groundItem, near); assert.equal(s.moves, 0);
});
test('equipar desde el suelo intercambia la pieza aun con ocho objetos y consume un turno', () => {
    const h = arena(), s = h.GameState, item = armor(), old = armor({ value: 2, name: 'Malla vieja' });
    fullBag(s); const names = s.player.inventory.map(item => item.name).join(','); s.player.equipment.armor = old; s.entities.items = [item];
    h.GroundSystem.open(item); assert.equal(h.GroundSystem.equip(), true);
    assert.equal(s.current, 'PLAYING'); assert.equal(s.moves, 1); assert.equal(s.player.equipment.armor, item);
    assert.equal(s.player.inventory.map(item => item.name).join(','), names);
    assert.equal(s.entities.items.length, 1); assert.equal(s.entities.items[0].name, 'Malla vieja');
    assert.ok(s.entities.items[0].recoveryDropId); assert.equal(s.player.stats.maxArmor.val, 5);
    assert.equal(h.GroundSystem.equip(), false); assert.equal(s.moves, 1);
});
test('equipar en un hueco vacío no deja una pieza fantasma ni ocupa mochila', () => {
    const h = arena(), s = h.GameState, item = armor(); fullBag(s); s.entities.items = [item];
    h.GroundSystem.open(item); h.GroundSystem.equip();
    assert.equal(s.player.inventory.length, 8); assert.equal(s.entities.items.length, 0); assert.equal(s.moves, 1);
});
test('botas y anillos se comparan y equipan con sus propiedades reales y sin tocar otros huecos', () => {
    for (const type of ['boots', 'ring']) {
        const h = arena(), s = h.GameState;
        const item = armor({ type, value: 0, traits: { initiativeBonus: .1, defenseBonus: 2 }, name: `Equipo ${type}` });
        s.entities.items = [item]; s.player.equipment.armor = armor({ value: 3 });
        h.GroundSystem.open(item); assert.match(h.elements.get('ground-detail').textContent, /Iniciativa: 100% → 110%/);
        h.GroundSystem.equip(); assert.equal(s.player.equipment[type], item); assert.equal(s.player.equipment.armor.value, 3);
        assert.equal(h.EquipmentSystem.stats().defense, 5); assert.equal(s.moves, 1);
    }
});
test('recoger exige hueco libre, toma solo la selección y cuesta exactamente una acción', () => {
    const h = arena(), s = h.GameState, item = armor(), other = armor({ value: 2 }); fullBag(s); s.entities.items = [item, other];
    h.GroundSystem.open(item); assert.equal(h.GroundSystem.pickup(), false); assert.equal(s.moves, 0);
    s.player.inventory.pop(); assert.equal(h.GroundSystem.pickup(), true);
    assert.equal(s.player.inventory.length, 8); assert.equal(s.player.inventory[7], item); assert.equal(s.entities.items[0], other);
    assert.equal(s.moves, 1); assert.equal(h.GroundSystem.pickup(), false);
});
test('el alcance no permite recoger tras paredes, cofres cerrados, huecos o enemigos', () => {
    for (const obstacle of ['corner', 'chest', 'hole', 'enemy', 'hidden']) {
        const h = arena(), s = h.GameState, item = armor({ x: 21, y: 13 }); s.entities.items = [item];
        if (obstacle === 'corner') s.map[12][21] = '#';
        if (obstacle === 'chest') s.entities.chests = [{ x: 21, y: 13, isOpen: false }];
        if (obstacle === 'hole') h.FloorSystem.isHole = () => true;
        if (obstacle === 'enemy') s.entities.enemies = [{ x: 21, y: 13 }];
        if (obstacle === 'hidden') s.visible[13][21] = false;
        assert.equal(h.GroundSystem.canReach(item), false, obstacle);
    }
});
test('una selección retirada o una acción fuera del inspector nunca duplica equipo', () => {
    const h = arena(), s = h.GameState, item = armor(); s.entities.items = [item];
    assert.equal(h.GroundSystem.equip(), false); h.GroundSystem.open(item); s.entities.items = [];
    assert.equal(h.GroundSystem.equip(), false); assert.equal(h.GroundSystem.pickup(), false); assert.equal(s.moves, 0);
});
test('el cambio de equipo permite la respuesta enemiga y respeta una muerte inmediata', () => {
    const h = arena(), s = h.GameState, item = armor(); s.entities.items = [item]; s.player.hp = 1;
    s.entities.enemies = [{ x: 19, y: 12, hp: 100, maxHp: 100, atk: 100, speed: 1, energy: 0, name: 'Verdugo', isSleeping: false, behavior: 'DUEL' }];
    h.GroundSystem.open(item); assert.equal(h.GroundSystem.equip(), true);
    assert.equal(s.current, 'GAMEOVER'); assert.equal(s.ui.groundItem, null); assert.equal(s.player.equipment.armor, item);
    assert.equal(h.DOM.menus.ground.classList.contains('hidden'), true);
});
test('sin objetos se muestra un estado vacío y no se puede ejecutar una acción', () => {
    const h = arena(); h.GroundSystem.open();
    assert.match(h.elements.get('ground-detail').textContent, /No hay objetos visibles/);
    assert.equal(h.GroundSystem.pickup(), false); assert.equal(h.GroundSystem.equip(), false); assert.equal(h.GameState.moves, 0);
});
test('el intercambio de objetos recuperables persiste al cambiar de planta sin duplicarse', () => {
    const h = harness(), s = h.GameState; h.GameLogic.init(917); s.current = 'PLAYING';
    const item = h.FloorSystem.storeDrop(armor({ name: 'Nueva' }), s.player);
    s.player.equipment.armor = armor({ name: 'Anterior', value: 2 }); fullBag(s);
    h.GroundSystem.open(item); h.GroundSystem.equip();
    assert.equal(s.recoveryDrops[1].length, 1); assert.equal(s.recoveryDrops[1][0].name, 'Anterior');
    s.level = 2; h.MapSystem.initLevel(); s.level = 1; h.MapSystem.initLevel();
    assert.equal(s.entities.items.filter(item => item.name === 'Anterior').length, 1);
    assert.equal(s.entities.items.some(item => item.name === 'Nueva'), false);
    assert.equal(s.player.equipment.armor.name, 'Nueva');
});
test('equipar un hallazgo normal lo marca recogido y no lo regenera al volver', () => {
    const h = harness(), s = h.GameState; h.GameLogic.init(918); s.level = 2; h.MapSystem.initLevel(); s.current = 'PLAYING';
    const item = s.entities.items.find(item => item.type === 'armor'); assert.ok(item);
    s.player.x = item.x; s.player.y = item.y; s.entities.enemies = []; h.MapSystem.updateFog(); fullBag(s);
    h.GroundSystem.open(item); assert.equal(h.GroundSystem.equip(), true); assert.equal(h.MapSystem.isTaken(item.x, item.y), true);
    s.level = 1; h.MapSystem.initLevel(); s.level = 2; h.MapSystem.initLevel();
    assert.equal(s.entities.items.some(other => other.type === 'armor' && other.x === item.x && other.y === item.y), false);
    assert.equal(s.player.equipment.armor, item);
});
test('el clic inspecciona al jugar, pero sigue disparando durante el apuntado del dardo', () => {
    const h = arena(), s = h.GameState, item = armor(); s.entities.items = [item];
    const cell = { dataset: { mapX: '21', mapY: '12' } }; const target = { closest: () => cell };
    h.DOM.container.contains = candidate => candidate === cell;
    h.emit('click', undefined, { target }); assert.equal(s.current, 'INSPECT'); assert.equal(s.ui.groundItem, item);
    h.GroundSystem.close(); s.current = 'TARGETING'; s.player.combat.pendingAttack = 'ranged';
    let shots = 0; h.CombatSystem.fireRanged = (x, y) => { shots++; assert.equal(x, 21); assert.equal(y, 12); };
    h.emit('click', undefined, { target }); assert.equal(shots, 1); assert.equal(s.current, 'TARGETING');
});
test('abrir inspección detiene el movimiento mantenido y cerrarla no lo reanuda', async () => {
    const h = arena(); h.GameLogic.movePlayer = async () => true;
    h.emit('keydown', 'd'); await h.flush(); assert.equal(h.timers.size, 1);
    h.emit('keydown', 'g'); assert.equal(h.timers.size, 0); assert.equal(h.GameState.current, 'INSPECT');
    h.emit('keydown', 'g'); assert.equal(h.GameState.current, 'PLAYING'); assert.equal(h.timers.size, 0);
});
test('se puede consultar desde la mochila y volver; los avisos y ataques impiden abrir otro diálogo', () => {
    const h = arena(), s = h.GameState; h.StateController.change('INVENTORY'); h.emit('keydown', 'g');
    assert.equal(s.current, 'INSPECT'); h.emit('keydown', 'Escape'); assert.equal(s.current, 'INVENTORY');
    for (const state of ['TARGETING', 'GAMEOVER', 'CHARACTER', 'SHOP']) { s.current = state; assert.equal(h.GroundSystem.open(), false); }
    s.current = 'PLAYING'; s.ui.floorWarningOpen = true; assert.equal(h.GroundSystem.open(), false);
    s.ui.floorWarningOpen = false; s.ui.movementLocked = true; assert.equal(h.GroundSystem.open(), false);
});
test('los descubrimientos nuevos van arriba; repetir uno no lo duplica ni cambia el orden', () => {
    const h = arena();
    for (const [type, id] of [['item','FOOD_DROP'], ['item','ARMOR_DROP'], ['monster','GOBLIN'], ['monster','BAT']]) h.Renderer.recordDiscovery(type, id, { name: id, symbol: '!', color: '#fff' });
    const items = h.elements.get('legend-items'), monsters = h.elements.get('legend-monsters');
    assert.match(items.children[0].innerHTML, /ARMOR_DROP/); assert.match(monsters.children[0].innerHTML, /BAT/);
    h.Renderer.recordDiscovery('item', 'FOOD_DROP', { name: 'Repetido' }); assert.equal(items.children.length, 2);
    assert.equal(items.scrollTop, 0); assert.equal(h.UISystem.discoveredCreatures()[0].id, 'BAT');
    assert.equal(h.UISystem.discoveredCreatures()[1].id, 'GOBLIN');
    h.StateController.change('BESTIARY'); assert.equal(h.GameState.ui.bestiaryId, 'BAT');
    h.emit('keydown', 'ArrowDown'); assert.equal(h.GameState.ui.bestiaryId, 'GOBLIN');
});
test('las flechas de escaleras tienen un elemento propio mayor sin revelar bajadas desconocidas', () => {
    const h = arena(), s = h.GameState; s.seen[20][60] = false; h.UISystem.renderStairs();
    const markers = h.elements.get('stair-compass').children; assert.equal(markers.length, 1);
    assert.equal(markers[0].children[1].className, 'stair-direction'); assert.equal(markers[0].children[1].textContent, '↖');
    assert.match(markers[0].textContent, /Subida.*18 casillas/);
});
test('los tres porcentajes pertenecen a la cabecera del recurso y conservan barras y vida absoluta', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const id of ['hp-percent', 'food-val', 'water-val']) assert.match(html, new RegExp(`class="resource-heading"[^\\n]*id="${id}"[^\\n]*class="resource-meter"`));
    assert.match(html, /id="hp-val"/); assert.match(html, /ground-inspection-1/);
});
(async () => {
    let failures = 0;
    for (const { name, fn } of tests) try { await fn(); console.log(`✓ ${name}`); } catch (error) { failures++; console.error(`✗ ${name}\n${error.stack}`); }
    console.log(`\n${tests.length - failures}/${tests.length} pruebas de inspección completadas.`);
    if (failures) process.exitCode = 1;
})();
