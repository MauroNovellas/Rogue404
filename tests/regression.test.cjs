const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'game.js');
const source = fs.readFileSync(sourcePath, 'utf8');

class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...names) { names.forEach(name => this.values.add(name)); }
    remove(...names) { names.forEach(name => this.values.delete(name)); }
    contains(name) { return this.values.has(name); }
}

class FakeElement {
    constructor(tagName = 'DIV', id = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.classList = new FakeClassList();
        this.style = {};
        this.children = [];
        this.parentNode = null;
        this.innerHTML = '';
        this.innerText = '';
        this.textContent = '';
        this.value = '';
        this.className = '';
        this.onclick = null;
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    prepend(child) {
        child.parentNode = this;
        this.children.unshift(child);
        return child;
    }
    remove() {
        if (!this.parentNode) return;
        const index = this.parentNode.children.indexOf(this);
        if (index >= 0) this.parentNode.children.splice(index, 1);
        this.parentNode = null;
    }
    focus() {}
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
}

const elements = new Map();
const listeners = new Map();
const fetchCalls = [];
let confirmAnswer = true;

function elementFor(id) {
    if (!elements.has(id)) {
        const inputIds = new Set(['seed-input', 'player-name', 'winner-name']);
        elements.set(id, new FakeElement(inputIds.has(id) ? 'INPUT' : 'DIV', id));
    }
    return elements.get(id);
}

const document = {
    head: new FakeElement('HEAD', 'head'),
    body: new FakeElement('BODY', 'body'),
    getElementById: elementFor,
    createElement: tagName => new FakeElement(tagName),
    addEventListener: (type, handler) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
    }
};

const context = {
    console,
    document,
    alert: () => {},
    confirm: () => confirmAnswer,
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: async (url, options = {}) => {
        fetchCalls.push({ url, options });
        return { ok: true, json: async () => [] };
    }
};
context.window = context;
context.globalThis = context;
context.window.confirm = () => confirmAnswer;

vm.createContext(context);
vm.runInContext(
    `${source}\n;globalThis.__ROGUE__ = { CONFIG, STATE_ENUM, GameState, DOM, Utils, VisualFX, FloorSystem, Network, MapSystem, EntityFactory, GameLogic, CombatSystem, InventorySystem, UISystem, StateController };`,
    context,
    { filename: 'game.js' }
);

const {
    CONFIG,
    STATE_ENUM,
    GameState,
    DOM,
    Utils,
    FloorSystem,
    Network,
    MapSystem,
    EntityFactory,
    GameLogic,
    CombatSystem,
    InventorySystem,
    UISystem,
    StateController
} = context.__ROGUE__;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function eventFor(key, target = document.body, repeat = false) {
    return {
        key,
        target,
        repeat,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        stopImmediatePropagation() {}
    };
}

function keydown(key, target = document.body, repeat = false) {
    const handlers = listeners.get('keydown') || [];
    assert.equal(handlers.length, 1, 'Debe existir un único listener keydown');
    const event = eventFor(key, target, repeat);
    handlers[0](event);
    return event;
}

function freshGame(seed = 12345) {
    GameLogic.init(seed);
    StateController.change(STATE_ENUM.PLAYING);
    Network.isSaving = false;
    return GameState;
}

test('el núcleo no contiene capas runtime ni listeners duplicados', () => {
    assert.equal((source.match(/document\.addEventListener\('keydown'/g) || []).length, 1);
    assert.equal(source.includes('VALIDATED RUNTIME STABILIZATION'), false);
    assert.equal(source.trimEnd().endsWith('GameLogic.init();'), true);
});

test('una partida nueva empieza en las escaleras de superficie', () => {
    GameState.entryMethod = 'descending';
    GameLogic.init(777);
    assert.equal(GameState.entryMethod, 'start');
    assert.equal(GameState.level, 1);
    assert.equal(GameState.player.x, GameState.stairs.up.x);
    assert.equal(GameState.player.y, GameState.stairs.up.y);
    assert.equal(GameState.current, STATE_ENUM.CONTROLS);
});

test('el nivel 3 activa Frozen Depths, el aviso y el equipo polar', () => {
    freshGame(1304);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();

    assert.equal(GameState.floor.type, 'FROZEN');
    assert.equal(DOM.container.classList.contains('floor-frozen'), true);
    assert.equal(GameState.ui.floorWarningOpen, true);
    assert.equal(GameState.entities.items.some(item => item.specialId === 'FROZEN_CRAMPONS'), true);
    FloorSystem.closeWarning();
});

test('el frío impide curarse al descansar salvo con equipo polar', () => {
    freshGame(1305);
    GameState.floor = { type: 'FROZEN' };
    GameState.entities.chests = [];
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.food = 100;
    GameState.player.water = 100;
    GameState.player.hp = 50;

    const originalEndTurn = GameLogic.endTurn;
    GameLogic.endTurn = () => {};
    try {
        GameState.player.equipment.armor = null;
        GameLogic.interactAction();
        assert.equal(GameState.player.hp, 50);

        GameState.player.equipment.armor = { value: 1, traits: { slipResist: 0.75, frozenRestHeal: 1 } };
        GameLogic.interactAction();
        assert.equal(GameState.player.hp, 51);
    } finally {
        GameLogic.endTurn = originalEndTurn;
    }
});

test('un resbalón dibuja cada casilla intermedia y consume una sola acción', async () => {
    freshGame(1306);
    GameState.floor = { type: 'FROZEN' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.equipment.armor = null;

    const originalRandom = Utils.random;
    const originalEndTurn = GameLogic.endTurn;
    const originalWaitSlipFrame = FloorSystem.waitSlipFrame;
    let turns = 0;
    const frames = [];
    const rolls = [0, 0.5, 0.99];
    Utils.random = () => rolls.length ? rolls.shift() : 0.5;
    GameLogic.endTurn = () => { turns++; };
    FloorSystem.waitSlipFrame = async () => {
        frames.push([GameState.player.x, GameState.player.y]);
    };
    try {
        const movement = GameLogic.movePlayer(1, 0);
        assert.equal(GameState.ui.movementLocked, true);
        await movement;
        assert.deepEqual(frames, [[11, 10], [12, 10], [13, 10]]);
        assert.equal(GameState.player.x, 13);
        assert.equal(GameState.player.y, 10);
        assert.equal(turns, 1);
        assert.equal(GameState.ui.movementLocked, false);
    } finally {
        Utils.random = originalRandom;
        GameLogic.endTurn = originalEndTurn;
        FloorSystem.waitSlipFrame = originalWaitSlipFrame;
    }
});

test('los crampones reducen un 75% la probabilidad de resbalón', () => {
    freshGame(1307);
    GameState.floor = { type: 'FROZEN' };
    const originalRandom = Utils.random;
    Utils.random = () => 0.2;
    try {
        GameState.player.equipment.armor = null;
        assert.equal(FloorSystem.shouldSlip(), true);
        GameState.player.equipment.armor = { traits: { slipResist: 0.75 } };
        assert.equal(FloorSystem.shouldSlip(), false);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el nivel 6 activa Magma, su aviso y la malla térmica', () => {
    freshGame(1604);
    GameState.level = 6;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();

    assert.equal(GameState.floor.type, 'MAGMA');
    assert.equal(DOM.container.classList.contains('floor-magma'), true);
    assert.equal(GameState.ui.floorWarningOpen, true);
    assert.equal(DOM.floorWarning.classList.contains('floor-warning-magma'), true);
    assert.equal(GameState.entities.items.some(item => item.specialId === 'MAGMA_THERMAL'), true);
    FloorSystem.closeWarning();
});

test('el magma duplica la presión de sed y la malla térmica la reduce', () => {
    freshGame(1605);
    GameState.floor = { type: 'MAGMA' };

    GameState.player.equipment.armor = null;
    assert.equal(FloorSystem.thirstRate(), 3);

    GameState.player.equipment.armor = { value: 1, traits: { thirstResist: 0.6, heatResist: 0.6, magmaRestHeal: 1 } };
    assert.equal(FloorSystem.thirstRate(), 4);
});

test('la sed del magma se aplica durante la supervivencia', () => {
    freshGame(1606);
    GameState.floor = { type: 'MAGMA' };
    GameState.player.equipment.armor = null;
    GameState.player.food = 100;
    GameState.player.water = 10;
    GameState.moves = 2;

    GameLogic.processSurvival();
    assert.equal(GameState.moves, 3);
    assert.equal(GameState.player.water, 9);
});

test('el calor impide curarse al descansar salvo con malla térmica', () => {
    freshGame(1607);
    GameState.floor = { type: 'MAGMA' };
    GameState.entities.chests = [];
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.food = 100;
    GameState.player.water = 100;
    GameState.player.hp = 50;

    const originalEndTurn = GameLogic.endTurn;
    GameLogic.endTurn = () => {};
    try {
        GameState.player.equipment.armor = null;
        GameLogic.interactAction();
        assert.equal(GameState.player.hp, 50);

        GameState.player.equipment.armor = { value: 1, traits: { thirstResist: 0.6, heatResist: 0.6, magmaRestHeal: 1 } };
        GameLogic.interactAction();
        assert.equal(GameState.player.hp, 51);
    } finally {
        GameLogic.endTurn = originalEndTurn;
    }
});

test('el nivel 9 activa suelo inestable, aviso y arnés ligero', () => {
    freshGame(1904);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();

    assert.equal(GameState.floor.type, 'UNSTABLE');
    assert.equal(DOM.container.classList.contains('floor-unstable'), true);
    assert.equal(GameState.ui.floorWarningOpen, true);
    assert.equal(DOM.floorWarning.classList.contains('floor-warning-unstable'), true);
    assert.equal(GameState.entities.items.some(item => item.specialId === 'UNSTABLE_HARNESS'), true);
    FloorSystem.closeWarning();
});

test('el suelo se agrieta al abandonarlo y retroceder provoca caída con pérdida de equipo', async () => {
    freshGame(1905);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.seen = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(true));
    GameState.visible = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(true));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    GameState.player.inventory = [{ type: 'food', name: 'Ración', value: 10, symbol: '%', color: '#ffaa00' }];
    GameState.player.equipment.weapon = { type: 'weapon', name: 'Espada prueba', value: 2, symbol: '!', color: '#ff00ff' };
    GameState.player.equipment.armor = { type: 'armor', name: 'Malla prueba', value: 2, symbol: ']', color: '#4682b4' };

    const originalEndTurn = GameLogic.endTurn;
    const originalTimeout = context.setTimeout;
    GameLogic.endTurn = () => {};
    context.setTimeout = (fn) => { fn(); return 1; };
    context.window.setTimeout = context.setTimeout;
    try {
        await GameLogic.movePlayer(1, 0);
        assert.equal(FloorSystem.isCracked(10, 10), true);
        assert.equal(GameState.level, 9);

        await GameLogic.movePlayer(-1, 0);
        assert.equal(GameState.level, 10);
        assert.equal(GameState.player.hp, 25);
        assert.equal(GameState.player.inventory.length, 0);
        assert.equal(GameState.player.equipment.weapon, null);
        assert.equal(GameState.player.equipment.armor, null);
        assert.equal(GameState.recoveryDrops[10].length, 3);
        assert.equal(GameState.entities.items.filter(item => item.recoveryDropId).length, 3);
        assert.equal(GameState.persistence[9].includes('HOLE_10,10'), true);
    } finally {
        GameLogic.endTurn = originalEndTurn;
        context.setTimeout = originalTimeout;
        context.window.setTimeout = originalTimeout;
    }
});

test('la resistencia a caída se calcula antes de soltar una armadura no retenida', () => {
    freshGame(19055);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.player.hp = 100;
    GameState.player.inventory = [];
    GameState.player.equipment.weapon = null;
    GameState.player.equipment.armor = {
        type: 'armor', name: 'Protección de prueba', value: 1, symbol: ']', color: '#aaa',
        traits: { fallDamageResist: 0.5, retainEquippedOnFall: false }
    };

    FloorSystem.fallPlayer();

    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 63);
    assert.equal(GameState.player.equipment.armor, null);
    assert.equal(GameState.recoveryDrops[10].length, 1);
});

test('el arnés ligero reduce la caída y conserva el equipo puesto', () => {
    freshGame(1906);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.player.hp = 100;
    const weapon = { type: 'weapon', name: 'Pico', value: 3, symbol: '!', color: '#ff00ff' };
    const harness = { type: 'armor', specialId: 'UNSTABLE_HARNESS', name: 'Arnés ligero', value: 1, symbol: ']', color: '#d7a56d', traits: { fallDamageResist: 0.5, retainEquippedOnFall: true } };
    GameState.player.equipment.weapon = weapon;
    GameState.player.equipment.armor = harness;
    GameState.player.inventory = [{ type: 'water', name: 'Agua', value: 20, symbol: '~', color: '#00ffff' }];

    FloorSystem.fallPlayer();

    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 63);
    assert.equal(GameState.player.equipment.weapon.name, 'Pico');
    assert.equal(GameState.player.equipment.armor.specialId, 'UNSTABLE_HARNESS');
    assert.equal(GameState.player.inventory.length, 0);
    assert.equal(GameState.recoveryDrops[10].length, 1);
});

test('los objetos dispersados por una caída persisten hasta recuperarlos', () => {
    freshGame(1907);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.player.inventory = [{ type: 'food', name: 'Ración perdida', value: 20, symbol: '%', color: '#ffaa00' }];
    GameState.player.equipment.weapon = null;
    GameState.player.equipment.armor = null;
    FloorSystem.fallPlayer();

    const saved = GameState.recoveryDrops[10][0];
    assert.ok(saved);
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    const restored = GameState.entities.items.find(item => item.recoveryDropId === saved.recoveryDropId);
    assert.ok(restored);

    const idx = GameState.entities.items.indexOf(restored);
    InventorySystem.pickup(restored, idx, restored.x, restored.y);
    assert.equal((GameState.recoveryDrops[10] || []).some(item => item.recoveryDropId === saved.recoveryDropId), false);
});

test('los enemigos tratan las grietas inestables como paredes', () => {
    freshGame(1909);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();

    const x = GameState.player.x + 1;
    const y = GameState.player.y;
    if (MapSystem.isBlocked(x, y)) return;

    FloorSystem.markCracked(x, y);
    assert.equal(FloorSystem.isCracked(x, y), true);
    assert.equal(GameLogic.isValidEnemyMove(x, y), false);
});

test('I/H alternan la ayuda sin duplicar acciones', () => {
    freshGame(101);
    keydown('i');
    assert.equal(GameState.current, STATE_ENUM.CONTROLS);
    keydown('h');
    assert.equal(GameState.current, STATE_ENUM.PLAYING);
});

test('Enter en seed reinicia la seed y no guarda puntuación', () => {
    freshGame(202);
    const seedInput = elementFor('seed-input');
    seedInput.value = '424242';
    const postsBefore = fetchCalls.filter(call => call.options && call.options.method === 'POST').length;
    keydown('Enter', seedInput);
    const postsAfter = fetchCalls.filter(call => call.options && call.options.method === 'POST').length;
    assert.equal(GameState.seed, 424242);
    assert.equal(GameState.current, STATE_ENUM.PLAYING);
    assert.equal(postsAfter, postsBefore);
});

test('T ejecuta Barrido una sola vez y las repeticiones se ignoran', () => {
    freshGame(303);
    const original = CombatSystem.performAreaAttack;
    let calls = 0;
    CombatSystem.performAreaAttack = () => { calls++; };
    try {
        keydown('t');
        keydown('t', document.body, true);
        assert.equal(calls, 1);
        assert.equal(GameState.current, STATE_ENUM.PLAYING);
    } finally {
        CombatSystem.performAreaAttack = original;
    }
});

test('Defender protege durante la respuesta enemiga y luego se limpia', () => {
    freshGame(404);
    const originalUpdateEnemies = GameLogic.updateEnemies;
    const originalSurvival = GameLogic.processSurvival;
    let defendingDuringEnemyTurn = false;
    GameLogic.updateEnemies = () => { defendingDuringEnemyTurn = GameState.player.combat.isDefending; };
    GameLogic.processSurvival = () => {};
    try {
        CombatSystem.performDefend();
        assert.equal(defendingDuringEnemyTurn, true);
        assert.equal(GameState.player.combat.isDefending, false);
    } finally {
        GameLogic.updateEnemies = originalUpdateEnemies;
        GameLogic.processSurvival = originalSurvival;
    }
});

test('Rápido aplica descoloque y no puede encadenarlo mientras hay inmunidad', () => {
    freshGame(505);
    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        const enemy = {
            x: GameState.player.x + 1,
            y: GameState.player.y,
            name: 'Dummy',
            hp: 100,
            maxHp: 100,
            atk: 1,
            xp: 0,
            speed: 0,
            energy: 0,
            behavior: 'ERRATIC',
            isSleeping: false,
            tookDamage: false
        };
        GameState.entities.enemies = [enemy];
        CombatSystem.applyDamage(0, 'quick', 0);
        assert.equal(enemy._rogueQuickStaggerPending, true);

        GameLogic.updateEnemies();
        assert.equal(enemy.energy, -1);
        assert.equal(enemy._rogueQuickStaggerPending, false);
        assert.equal(enemy._rogueQuickStaggerImmune, true);

        CombatSystem.applyDamage(0, 'quick', 0);
        assert.notEqual(enemy._rogueQuickStaggerPending, true);
        GameLogic.updateEnemies();
        assert.equal(enemy._rogueQuickStaggerImmune, false);
    } finally {
        Utils.random = originalRandom;
    }
});

test('Salvaje consume la acción normal tras su contraataque y GAMEOVER bloquea ataques', () => {
    freshGame(606);
    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        const enemy = { name: 'Dummy', atk: 10, energy: 0, _rogueSavageCounterPending: true };
        GameState.player.hp = 100;
        CombatSystem.enemyAttack(enemy);
        assert.equal(enemy._rogueSavageCounterPending, false);
        assert.equal(enemy.energy, -1);
        assert.equal(GameState.player.hp, 90);

        GameState.current = STATE_ENUM.GAMEOVER;
        const hpBefore = GameState.player.hp;
        CombatSystem.enemyAttack(enemy);
        assert.equal(GameState.player.hp, hpBefore);
    } finally {
        Utils.random = originalRandom;
    }
});

test('Barrido conserva cinco turnos de enfriamiento justo después de usarlo', () => {
    freshGame(707);
    const originalUpdateEnemies = GameLogic.updateEnemies;
    const originalSurvival = GameLogic.processSurvival;
    GameLogic.updateEnemies = () => {};
    GameLogic.processSurvival = () => {};
    GameState.entities.enemies = [];
    GameState.player.combat.cooldowns.area = 0;
    try {
        CombatSystem.performAreaAttack();
        assert.equal(GameState.player.combat.cooldowns.area, CONFIG.COMBAT.area.cooldown);
        assert.equal(GameState.player.combat.cooldowns.area, 5);
    } finally {
        GameLogic.updateEnemies = originalUpdateEnemies;
        GameLogic.processSurvival = originalSurvival;
    }
});

test('hambre y sed no pueden sobrescribir la primera causa de muerte', () => {
    freshGame(808);
    GameState.player.hp = CONFIG.PLAYER.survival.starvationDmg;
    GameState.player.food = 0;
    GameState.player.water = 0;
    GameLogic.processSurvival();
    assert.equal(GameState.current, STATE_ENUM.GAMEOVER);
    assert.equal(GameState.deathCause, 'Hambre');
    GameLogic.die('Sed');
    assert.equal(GameState.deathCause, 'Hambre');
});

test('tirar un objeto no reactiva un spawn persistente consumido', () => {
    freshGame(909);
    const key = `${GameState.player.x},${GameState.player.y}`;
    MapSystem.markTaken(GameState.player.x, GameState.player.y);
    GameState.player.inventory = [{ type: 'food', name: 'Ración', value: 10, symbol: '%', color: '#ffaa00' }];
    const originalEndTurn = GameLogic.endTurn;
    GameLogic.endTurn = () => {};
    try {
        InventorySystem.dropItem(0);
        assert.equal(GameState.persistence[GameState.level].includes(key), true);
        assert.equal(GameState.player.inventory.length, 0);
        assert.equal(GameState.entities.items.some(item => item.x === GameState.player.x && item.y === GameState.player.y), true);
    } finally {
        GameLogic.endTurn = originalEndTurn;
    }
});

test('un cofre abierto queda registrado con una clave estable', () => {
    freshGame(1001);
    const originalRandom = Utils.random;
    Utils.random = () => 0.99;
    try {
        const chest = { x: GameState.player.x + 2, y: GameState.player.y, name: 'Cofre', isOpen: false };
        GameState.entities.chests = [chest];
        GameLogic.openChest(0);
        const chestKey = `CHEST_${chest.x},${chest.y}`;
        assert.equal(chest.isOpen, true);
        assert.equal(MapSystem.isTaken(chestKey), true);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el ranking escapa contenido no confiable antes de insertarlo', () => {
    const target = elementFor('leaderboard-test');
    Network.renderLeaderboard([
        {
            name: '<img src=x onerror=alert(1)>',
            level: 3,
            score: 99,
            cause: '<b>boom</b>',
            date: '2026-09-06',
            equipment: '" onmouseover="boom',
            kills: '<script>x</script>'
        }
    ], 'leaderboard-test');
    assert.equal(target.innerHTML.includes('<img'), false);
    assert.equal(target.innerHTML.includes('<script>'), false);
    assert.equal(target.innerHTML.includes('&lt;img'), true);
    assert.equal(target.innerHTML.includes('&lt;b&gt;boom&lt;/b&gt;'), true);
});

test('guardar puntuación bloquea envíos POST duplicados', async () => {
    freshGame(1102);
    GameState.current = STATE_ENUM.GAMEOVER;
    DOM.menus.victory.classList.add('hidden');
    elementFor('player-name').value = 'TEST';
    Network.isSaving = false;
    const before = fetchCalls.filter(call => call.options && call.options.method === 'POST').length;
    await Promise.all([Network.saveScore(), Network.saveScore()]);
    const after = fetchCalls.filter(call => call.options && call.options.method === 'POST').length;
    assert.equal(after - before, 1);
    Network.isSaving = false;
});

test('salir por la superficie pide confirmación y cancelar mantiene la partida', () => {
    freshGame(1203);
    GameState.level = 1;
    GameState.player.x = GameState.stairs.up.x;
    GameState.player.y = GameState.stairs.up.y;
    confirmAnswer = false;
    GameLogic.win();
    assert.equal(GameState.current, STATE_ENUM.PLAYING);

    confirmAnswer = true;
    GameLogic.win();
    assert.equal(GameState.current, STATE_ENUM.GAMEOVER);
});

(async () => {
    let passed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            passed++;
            console.log(`✓ ${name}`);
        } catch (error) {
            console.error(`✗ ${name}`);
            console.error(error);
            process.exitCode = 1;
            break;
        }
    }

    if (!process.exitCode) {
        console.log(`\n${passed}/${tests.length} pruebas superadas.`);
    }
})();
