const assert = require('node:assert/strict');
const harness = require('./helpers/game-harness.cjs');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function arena(options) {
    const h = harness(options);
    h.GameState.map = Array.from({ length: 24 }, () => Array(70).fill('.'));
    h.GameState.seen = Array.from({ length: 24 }, () => Array(70).fill(true));
    h.GameState.visible = Array.from({ length: 24 }, () => Array(70).fill(true));
    h.GameState.persistence = { 1: [] };
    h.GameState.rng = () => 0.5;
    return h;
}
function relic(h, id) {
    h.EntityFactory.createRelicItem({ x: 1, y: 1 }, id);
    return h.GameState.entities.items.pop();
}
function accessory(h, id) {
    return h.EntityFactory.createAccessoryItem(h.CONFIG.ACCESSORIES.find(item => item.id === id));
}
function enemy(x = 21, y = 12, extra = {}) {
    return { x, y, name: 'Objetivo', symbol: 'M', color: '#fff', hp: 100, maxHp: 100, atk: 10, xp: 0, speed: 1, energy: 0, isSleeping: false, ...extra };
}
const panelText = element => [element.textContent, ...element.children.map(panelText)].join(' ');

test('el cáliz cura, paga costes exactos y se consume una sola vez', () => {
    const h = arena(); const p = h.GameState.player; p.hp = 20;
    p.inventory = [relic(h, 'BLOOD_CHALICE')];
    h.InventorySystem.useItem(0);
    assert.equal(p.hp, 55); assert.equal(p.food, 88); assert.equal(p.water, 92);
    assert.equal(p.inventory.length, 0); assert.equal(h.GameState.moves, 1);
    h.InventorySystem.useItem(0); assert.equal(h.GameState.moves, 1);
});
test('el cáliz escala con la vida máxima y no excede el máximo', () => {
    const h = arena(); const p = h.GameState.player;
    p.maxHp = 300; p.hp = 250;
    const item = relic(h, 'BLOOD_CHALICE');
    assert.equal(h.InventorySystem.relicPreview(item).heal, 105);
    assert.equal(h.InventorySystem.useRelic(item), true); assert.equal(p.hp, 300);
});
test('curación innecesaria y costes impagables no consumen objeto ni turno', () => {
    for (const change of [p => {}, p => { p.hp = 10; p.food = 11; }, p => { p.hp = 10; p.water = 7; }]) {
        const h = arena(); const p = h.GameState.player; change(p);
        p.inventory = [relic(h, 'BLOOD_CHALICE')];
        const before = JSON.stringify([p.hp, p.food, p.water]);
        h.InventorySystem.useItem(0);
        assert.equal(JSON.stringify([p.hp, p.food, p.water]), before);
        assert.equal(p.inventory.length, 1); assert.equal(h.GameState.moves, 0);
    }
});
test('la campana sin blancos no se pierde, tampoco mediante Enter', () => {
    const h = arena(); h.GameState.player.inventory = [relic(h, 'ECHO_BELL')];
    h.InventorySystem.openActionMenu(); h.InventorySystem.executeAction();
    assert.equal(h.GameState.ui.currentActions[0].disabled, true);
    assert.equal(h.GameState.player.inventory.length, 1); assert.equal(h.GameState.moves, 0);
    h.InventorySystem.useItem(0); assert.equal(h.GameState.player.inventory.length, 1);
});
test('la campana cancela dos respuestas incluso a enemigos rápidos; no despierta a los ocultos', () => {
    const h = arena(); const visible = enemy(21, 12, { speed: 5, _trollPressurePrimed: true });
    const hidden = enemy(30, 12, { isSleeping: true });
    h.GameState.visible[12][30] = false;
    h.GameState.entities.enemies = [visible, hidden];
    h.GameState.player.inventory = [relic(h, 'ECHO_BELL')];
    h.InventorySystem.useItem(0);
    assert.equal(visible.relicStun, 1); assert.equal(visible.energy, 0);
    assert.equal(visible._trollPressurePrimed, false); assert.equal(hidden.isSleeping, true);
    h.GameLogic.endTurn(); assert.equal(h.GameState.player.hp, 100); assert.equal(visible.relicStun, 0);
    h.GameLogic.endTurn(); assert.equal(h.GameState.player.hp, 50);
});
test('la piedra cubre la invocación y dos respuestas más, sin depender de Defender', () => {
    const h = arena(); const p = h.GameState.player;
    h.GameState.entities.enemies = [enemy()]; p.inventory = [relic(h, 'WARD_STONE')];
    h.InventorySystem.useItem(0);
    assert.equal(p.hp, 93); assert.equal(p.water, 90); assert.equal(p.combat.wardTurns, 2);
    h.GameLogic.endTurn(); assert.equal(p.hp, 86);
    h.GameLogic.endTurn(); assert.equal(p.hp, 79); assert.equal(p.combat.wardTurns, 0);
    h.GameLogic.endTurn(); assert.equal(p.hp, 69);
    assert.equal(p.combat.wardStrike, 2);
});
test('la campana también impide el contraataque salvaje en la acción libre', () => {
    const h = arena(); const target = enemy(); h.GameState.entities.enemies = [target];
    h.GameState.player.inventory = [relic(h, 'ECHO_BELL')]; h.InventorySystem.useItem(0);
    h.GameState.player.combat.pendingAttack = 'savage'; h.CombatSystem.executeAttack(1, 0);
    assert.equal(h.GameState.player.hp, 100);
    assert.equal(target._rogueSavageCounterPending, false); assert.equal(target.relicStun, 0);
});
test('la piedra no se desperdicia ni permite acumular cargas', () => {
    const h = arena(); const item = relic(h, 'WARD_STONE');
    h.GameState.player.water = 9;
    assert.equal(h.InventorySystem.useRelic(item), false);
    h.GameState.player.water = 100;
    assert.equal(h.InventorySystem.useRelic(item), true);
    assert.equal(h.InventorySystem.useRelic(item), false);
    h.GameState.player.combat.wardTurns = 0;
    assert.equal(h.InventorySystem.useRelic(item), false);
    assert.equal(h.GameState.player.water, 90);
});
test('caminar, fallar y barrer en vacío no borran el golpe de la piedra', () => {
    const h = arena(); const p = h.GameState.player;
    h.InventorySystem.useRelic(relic(h, 'WARD_STONE'));
    h.GameLogic.enterPlayerTile(20, 13); assert.equal(p.combat.wardStrike, 2);
    p.combat.pendingAttack = 'quick'; h.CombatSystem.executeAttack(1, 0);
    assert.equal(p.combat.wardStrike, 2);
    h.CombatSystem.performAreaAttack(); assert.equal(p.combat.wardStrike, 2);
    const target = enemy(21, 13); h.GameState.entities.enemies = [target];
    h.CombatSystem.bumpAttack(target);
    assert.equal(target.hp, 94); assert.equal(p.combat.wardStrike, 0);
});
test('rápido y dardo consumen la carga solo al acertar; el barrido potencia todos sus impactos', () => {
    for (const type of ['quick', 'ranged', 'area']) {
        const h = arena(); const p = h.GameState.player;
        p.combat.wardStrike = 2; p.talents.ranged = 1;
        const target = enemy(); h.GameState.entities.enemies = [target];
        if (type === 'area') {
            const other = enemy(20, 13); h.GameState.entities.enemies.push(other);
            h.CombatSystem.performAreaAttack(); assert.equal(other.hp, 98);
        } else if (type === 'quick') { p.combat.pendingAttack = 'quick'; h.CombatSystem.executeAttack(1, 0); }
        else { h.CombatSystem.startTargeting('ranged'); h.CombatSystem.fireRanged(); }
        assert.equal(p.combat.wardStrike, 0);
        assert.equal(target.hp, type === 'area' ? 98 : type === 'quick' ? 96 : 93);
    }
});
test('cuatro huecos independientes; cambiar botas con mochila llena devuelve el par anterior', () => {
    const h = arena(); const p = h.GameState.player;
    const old = accessory(h, 'ROCK_BOOTS'); const next = accessory(h, 'LIGHT_BOOTS');
    const armor = { type: 'armor', name: 'Malla', value: 4 };
    p.equipment = { weapon: null, armor, boots: old, ring: accessory(h, 'GUARD_RING') };
    p.inventory = [next, ...Array.from({ length: 5 }, () => ({ type: 'food', value: 20 }))];
    h.InventorySystem.useItem(0);
    assert.equal(p.equipment.armor, armor); assert.equal(p.equipment.boots, next);
    assert.equal(p.equipment.ring.gearId, 'GUARD_RING');
    assert.equal(p.inventory.length, 6); assert.equal(p.inventory[5], old);
    assert.equal(h.GameState.moves, 1);
});
test('los accesorios afectan iniciativa, ataque, defensa y dardo sin duplicar bonos', () => {
    const h = arena(); const p = h.GameState.player;
    p.equipment.weapon = { value: 4 }; p.equipment.armor = { value: 3 };
    p.equipment.boots = accessory(h, 'LIGHT_BOOTS'); p.equipment.ring = accessory(h, 'FORCE_RING');
    p.talents.speed = 2; p.talents.resilience = 2; p.talents.ranged = 1;
    assert.equal(h.EquipmentSystem.stats().attack, 8);
    assert.equal(h.ProgressionSystem.rangedDamage(), 6);
    assert.ok(Math.abs(h.ProgressionSystem.speedMultiplier() - 1.4) < 1e-9);
    p.equipment.ring = accessory(h, 'GUARD_RING');
    assert.equal(h.EquipmentSystem.stats().attack, 7); assert.equal(h.EquipmentSystem.stats().defense, 6);
    p.equipment.ring = accessory(h, 'ECHO_RING');
    assert.equal(h.ProgressionSystem.rangedDamage(), 7); assert.equal(h.EquipmentSystem.stats().defense, 5);
});
test('el anillo arcano no desbloquea el dardo y su ficha explica el requisito', () => {
    const h = arena(); h.GameState.player.equipment.ring = accessory(h, 'ECHO_RING');
    assert.equal(h.ProgressionSystem.rangedRange(), 0);
    assert.match(h.UISystem.traitSummary(h.GameState.player.equipment.ring), /requiere aprenderlo/);
    h.CombatSystem.startTargeting('ranged'); assert.equal(h.GameState.current, 'PLAYING');
});
test('el anillo de fuerza mejora el daño real y el guardián bloquea daño real', () => {
    const h = arena(); const target = enemy();
    h.GameState.player.equipment.ring = accessory(h, 'FORCE_RING');
    h.CombatSystem.bumpAttack(target); assert.equal(target.hp, 95);
    h.GameState.player.equipment.ring = accessory(h, 'GUARD_RING');
    h.CombatSystem.enemyAttack(target); assert.equal(h.GameState.player.hp, 91);
});
test('la iniciativa de las botas retrasa la primera respuesta enemiga', () => {
    const h = arena(); h.GameState.player.equipment.boots = accessory(h, 'LIGHT_BOOTS');
    h.GameState.entities.enemies = [enemy()];
    h.GameLogic.endTurn(); assert.equal(h.GameState.player.hp, 100);
    h.GameLogic.endTurn(); assert.equal(h.GameState.player.hp, 90);
});
test('las botas de ceniza reducen de verdad los costes de magma tras el redondeo', () => {
    const h = arena(); h.GameState.floor = { type: 'MAGMA', riskZone: { type: 'MAGMA_FUMAROLE', x1: 18, x2: 22, y1: 10, y2: 14 } };
    assert.equal(h.FloorSystem.thirstRate(), 3); assert.equal(h.FloorSystem.magmaRiskWaterCost(), 2);
    h.GameState.player.equipment.boots = accessory(h, 'ASH_BOOTS');
    assert.equal(h.FloorSystem.thirstRate(), 4); assert.equal(h.FloorSystem.magmaRiskWaterCost(), 1);
});
test('las resistencias se multiplican y el descanso conserva la mejor protección', () => {
    const h = arena(); const p = h.GameState.player;
    p.equipment.armor = { traits: { fallDamageResist: 0.5, slipResist: 0.5, frozenRestHeal: 1 } };
    p.equipment.boots = { traits: { fallDamageResist: 0.25, slipResist: 0.75, frozenRestHeal: 1 } };
    const traits = h.EquipmentSystem.traits();
    assert.equal(traits.fallDamageResist, 0.625); assert.equal(traits.slipResist, 0.875);
    assert.equal(traits.frozenRestHeal, 1);
    h.GameState.floor = { type: 'FROZEN' };
    assert.equal(h.FloorSystem.slipChance(), 0.35 * 0.125);
    assert.equal(h.FloorSystem.restHealing(), 1);
});
test('una caída dispersa los cuatro huecos salvo que el arnés los conserve', () => {
    for (const retain of [false, true]) {
        const h = arena(); const p = h.GameState.player;
        h.GameState.floor = { type: 'UNSTABLE' };
        p.equipment = { weapon: { type: 'weapon' }, armor: { type: 'armor', traits: { fallDamageResist: 0.5, retainEquippedOnFall: retain } }, boots: accessory(h, 'ROCK_BOOTS'), ring: accessory(h, 'GUARD_RING') };
        p.inventory = [{ type: 'food' }]; let scattered;
        h.MapSystem.initLevel = () => { h.GameState.persistence[h.GameState.level] = []; }; h.FloorSystem.scatterRecovery = items => { scattered = items; };
        h.FloorSystem.fallPlayer();
        assert.equal(p.hp, 72); assert.equal(scattered.length, retain ? 1 : 5);
        assert.equal(p.inventory.length, 0);
        assert.equal(h.EquipmentSystem.slots().filter(slot => p.equipment[slot]).length, retain ? 4 : 0);
    }
});
test('quitar equipo requiere un hueco, retira el efecto y cuesta un turno', () => {
    const h = arena(); const p = h.GameState.player;
    p.equipment.ring = accessory(h, 'FORCE_RING'); h.GameState.current = 'EQUIPMENT';
    p.inventory = Array(6).fill({ type: 'food' });
    assert.equal(h.InventorySystem.unequip('ring'), false); assert.equal(h.GameState.moves, 0);
    p.inventory.pop(); assert.equal(h.InventorySystem.unequip('ring'), true);
    assert.equal(p.equipment.ring, null); assert.equal(p.inventory.length, 6);
    assert.equal(h.EquipmentSystem.stats().attack, 3); assert.equal(h.GameState.moves, 1);
});
test('los hallazgos distinguen cada reliquia, cada accesorio y los crampones', () => {
    const h = arena();
    const ids = h.CONFIG.ENTITIES.relics.map(def => h.Renderer.itemDiscovery(relic(h, def.id)).id);
    assert.equal(new Set(ids).size, 3);
    for (const def of h.CONFIG.ACCESSORIES) {
        const discovery = h.Renderer.itemDiscovery(accessory(h, def.id));
        assert.equal(discovery.id, def.id); assert.equal(discovery.data.symbol, def.symbol);
    }
    h.GameState.floor = { type: 'FROZEN' }; h.EntityFactory.getEmptyPos = () => ({ x: 10, y: 10 });
    h.EntityFactory.spawnFloorSpecial(); const boots = h.GameState.entities.items.pop();
    assert.equal(boots.type, 'boots'); assert.equal(h.Renderer.itemDiscovery(boots).data.symbol, '}');
});
test('cada planta ofrece un accesorio reproducible y recogerlo impide que reaparezca', () => {
    const h = harness(); h.GameState.seed = 614;
    for (const level of [1, 2, 3, 4, 6, 9]) {
        h.GameState.level = level; h.MapSystem.initLevel();
        const item = h.GameState.entities.items.find(item => item.gearId);
        assert.ok(item); assert.equal(item.type, level % 2 ? 'boots' : 'ring');
        const before = JSON.stringify(item);
        h.MapSystem.initLevel();
        assert.equal(JSON.stringify(h.GameState.entities.items.find(item => item.gearId)), before);
        h.MapSystem.markTaken(item.x, item.y); h.MapSystem.initLevel();
        assert.equal(h.GameState.entities.items.some(candidate => candidate.gearId), false);
    }
});
test('comprar accesorios conserva propiedades; vender reliquias y botas tiene valor', () => {
    const h = arena(); h.GameState.level = 3; h.GameState.score = 1000;
    const stock = h.ShopSystem.getStock();
    assert.equal(stock.length, 6);
    const index = stock.findIndex(item => item.type === 'boots');
    const expected = JSON.stringify(stock[index].traits);
    h.ShopSystem.buy(index);
    const bought = h.GameState.player.inventory[0];
    assert.equal(JSON.stringify(bought.traits), expected); assert.ok(bought.gearId);
    assert.ok(h.ShopSystem.sellPrice(bought) > 0);
    assert.equal(h.ShopSystem.sellPrice(relic(h, 'ECHO_BELL')), 40);
});
test('la ficha muestra comparación, costes y bloqueos; seleccionar por ratón actualiza el detalle', () => {
    const h = arena({ renderInventory: true });
    h.GameState.player.inventory = [relic(h, 'BLOOD_CHALICE'), accessory(h, 'LIGHT_BOOTS')];
    h.UISystem.renderInventory();
    assert.match(panelText(h.elements.get('inv-item-detail')), /12 comida.*8 agua/);
    assert.match(panelText(h.elements.get('inv-item-detail')), /Ya tienes toda la vida/);
    h.elements.get('inv-grid').children[1].onclick();
    assert.equal(h.GameState.ui.inventoryIndex, 1);
    assert.match(panelText(h.elements.get('inv-item-detail')), /Iniciativa: 100% → 110%/);
    h.UISystem.renderEquipment(); assert.equal(h.elements.get('equipment-grid').children.length, 4);
    assert.match(h.UISystem.expeditionGear(), /Botas al finalizar.*Anillo al finalizar/);
});
test('una planta nueva borra protección y carga temporales, pero conserva accesorios', () => {
    const h = harness(); h.GameState.seed = 615;
    h.GameState.player.equipment.ring = accessory(h, 'FORCE_RING');
    Object.assign(h.GameState.player.combat, { wardTurns: 2, wardStrike: 2, wardDefense: 3 });
    h.GameState.level = 2; h.MapSystem.initLevel();
    assert.equal(h.GameState.player.combat.wardTurns, 0);
    assert.equal(h.GameState.player.combat.wardStrike, 0);
    assert.equal(h.GameState.player.equipment.ring.gearId, 'FORCE_RING');
});
test('los cofres entregan exactamente el accesorio o reliquia que anuncian', () => {
    const kinds = new Set(), relicIds = new Set();
    for (let seed = 1; seed <= 80; seed++) {
        const h = arena(); h.GameState.rng = h.Utils.mulberry32(seed);
        const options = h.GameLogic.buildChestRewardOptions();
        assert.equal(options.length, 2); assert.notEqual(options[0].kind, options[1].kind);
        for (const option of options.filter(option => ['boots', 'ring', 'relic'].includes(option.kind))) {
            h.GameState.player.inventory = []; h.GameState.ui.rewardChoice = { options: [option], index: 0 };
            h.GameState.current = 'REWARD_CHOICE'; h.GameLogic.chooseChestReward(0);
            const item = h.GameState.player.inventory[0];
            assert.equal(item.name, option.name); kinds.add(item.type);
            if (option.kind === 'relic') { assert.equal(item.relicId, option.relicId); relicIds.add(item.relicId); }
            else { assert.equal(item.gearId, option.gearId); assert.ok(Object.keys(item.traits).length); }
        }
    }
    assert.equal(kinds.size, 3); assert.equal(relicIds.size, 3);
});
test('abrir Equipo desde las acciones no deja la mochila atrapada en un submenú invisible', () => {
    const h = arena({ renderInventory: true }); h.GameState.player.inventory = [accessory(h, 'LIGHT_BOOTS')];
    h.StateController.change('INVENTORY'); h.InventorySystem.openActionMenu();
    h.emit('keydown', 'o'); assert.equal(h.GameState.current, 'EQUIPMENT');
    h.emit('keydown', 'Escape'); assert.equal(h.GameState.current, 'INVENTORY');
    assert.equal(h.GameState.ui.actionMenuOpen, false);
    h.elements.get('inv-grid').children[0].onclick(); h.InventorySystem.openActionMenu();
    assert.equal(h.GameState.ui.actionMenuOpen, true);
});

(async () => {
    for (const { name, fn } of tests) { await fn(); console.log(`✓ ${name}`); }
    console.log(`\n${tests.length}/${tests.length} pruebas de reliquias y accesorios completadas.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
