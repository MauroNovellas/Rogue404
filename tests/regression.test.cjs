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
    `${source}\n;globalThis.__ROGUE__ = { CONFIG, STATE_ENUM, GameState, DOM, Utils, VisualFX, FloorSystem, Network, MapSystem, EntityFactory, GameLogic, CombatSystem, InventorySystem, ShopSystem, UISystem, StateController };`,
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
    ShopSystem,
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

test('el Murciélago puede hacer un picado desde dos casillas en una sola acción', () => {
    freshGame(2101);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    GameState.player.equipment.armor = null;

    const bat = {
        x: 12, y: 10, typeId: 'BAT', behavior: 'DIVER', diveChance: 1,
        name: 'Murciélago', symbol: 'M', color: '#a64dff',
        hp: 5, maxHp: 5, atk: 4, xp: 10, speed: 1, energy: 0,
        isSleeping: false, tookDamage: false
    };
    GameState.entities.enemies = [bat];

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        assert.equal(GameLogic.performBatDive(bat), true);
        assert.equal(Math.max(Math.abs(GameState.player.x - bat.x), Math.abs(GameState.player.y - bat.y)), 1);
        assert.equal(GameState.player.hp, 96);
    } finally {
        Utils.random = originalRandom;
    }
});

test('Rápido corta el turno de picado del Murciélago', () => {
    freshGame(2102);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    GameState.player.equipment.armor = null;

    const bat = {
        x: 12, y: 10, typeId: 'BAT', behavior: 'DIVER', diveChance: 1,
        name: 'Murciélago', symbol: 'M', color: '#a64dff',
        hp: 5, maxHp: 5, atk: 4, xp: 10, speed: 1, energy: 0,
        isSleeping: false, tookDamage: false, _rogueQuickStaggerPending: true
    };
    GameState.entities.enemies = [bat];

    GameLogic.updateEnemies();
    assert.equal(GameState.player.hp, 100);
    assert.equal(bat.x, 12);
    assert.equal(bat.y, 10);
});

test('el Goblin es un saqueador con codicia y ruta de escape', () => {
    const goblin = CONFIG.ENTITIES.enemies.find(enemy => enemy.id === 'GOBLIN');
    assert.ok(goblin);
    assert.equal(goblin.behavior, 'THIEF');
    assert.equal(goblin.stealGold, 20);
    assert.equal(goblin.greedRange, 6);
    assert.equal(goblin.role, 'Saqueador de las profundidades');
});

test('el Goblin prioriza oro cercano y se lo guarda antes de huir', () => {
    freshGame(2201);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.persistence[GameState.level] = [];
    GameState.player.x = 20;
    GameState.player.y = 20;
    const goblin = {
        x: 10, y: 10, typeId: 'GOBLIN', behavior: 'THIEF', greedRange: 6, stealGold: 20,
        name: 'Goblin', symbol: 'G', color: '#00ff00', hp: 15, maxHp: 15, atk: 5,
        xp: 25, speed: 1, energy: 0, isSleeping: false, tookDamage: false, stolenGold: 0
    };
    GameState.entities = {
        enemies: [goblin],
        items: [{ x: 11, y: 10, type: 'GOLD', value: 10, name: 'Oro', symbol: '$', color: '#ffd700' }],
        chests: [], shops: []
    };

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        assert.equal(GameLogic.moveGoblinTowardGold(goblin), true);
        assert.equal(goblin.x, 11);
        assert.equal(goblin.y, 10);
        assert.equal(goblin.stolenGold, 10);
        assert.equal(GameState.entities.items.length, 0);
        assert.equal(MapSystem.isTaken(11, 10), true);
    } finally {
        Utils.random = originalRandom;
    }
});

test('un golpe del Goblin roba oro solo si consigue herir', () => {
    freshGame(2202);
    GameState.score = 50;
    GameState.player.hp = 100;
    GameState.player.equipment.armor = null;
    const goblin = { behavior: 'THIEF', stealGold: 20, stolenGold: 0, name: 'Goblin', atk: 5, energy: 0 };

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        CombatSystem.enemyAttack(goblin);
        assert.equal(GameState.player.hp, 95);
        assert.equal(GameState.score, 30);
        assert.equal(goblin.stolenGold, 20);

        const blocked = { behavior: 'THIEF', stealGold: 20, stolenGold: 0, name: 'Goblin', atk: 5, energy: 0 };
        GameState.score = 50;
        GameState.player.hp = 100;
        GameState.player.equipment.armor = { value: 99 };
        CombatSystem.enemyAttack(blocked);
        assert.equal(GameState.score, 50);
        assert.equal(blocked.stolenGold, 0);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el Goblin con botín desaparece al alcanzar una escalera', () => {
    freshGame(2203);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.stairs.up = { x: 5, y: 5 };
    GameState.stairs.down = { x: 30, y: 15 };
    GameState.player.x = 20;
    GameState.player.y = 20;
    GameState.entities = {
        enemies: [{
            x: 5, y: 5, typeId: 'GOBLIN', behavior: 'THIEF', greedRange: 6, stealGold: 20,
            name: 'Goblin', symbol: 'G', color: '#00ff00', hp: 15, maxHp: 15, atk: 5,
            xp: 25, speed: 1, energy: 0, isSleeping: false, tookDamage: false, stolenGold: 20
        }],
        items: [], chests: [], shops: []
    };

    GameLogic.updateEnemies();
    assert.equal(GameState.entities.enemies.length, 0);
});

test('matar al Goblin hace caer exactamente el oro que llevaba', () => {
    freshGame(2204);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.baseAtk = 100;
    const goblin = {
        x: 11, y: 10, typeId: 'GOBLIN', behavior: 'THIEF', stolenGold: 20,
        name: 'Goblin', symbol: 'G', color: '#00ff00', hp: 1, maxHp: 15, atk: 5,
        xp: 25, speed: 1, energy: 0, isSleeping: false, tookDamage: false
    };
    GameState.entities = { enemies: [goblin], items: [], chests: [], shops: [] };

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        CombatSystem.bumpAttack(goblin);
        assert.equal(GameState.entities.enemies.length, 0);
        const bag = GameState.entities.items.find(item => item.stolenFromGoblin);
        assert.ok(bag);
        assert.equal(bag.type, 'GOLD');
        assert.equal(bag.value, 20);
        assert.equal(bag.x, 11);
        assert.equal(bag.y, 10);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el Trasgo es un guardián territorial con APLASTAR anunciado', () => {
    const troll = CONFIG.ENTITIES.enemies.find(enemy => enemy.id === 'TROLL');
    assert.ok(troll);
    assert.equal(troll.behavior, 'WARDEN');
    assert.equal(troll.territoryRadius, 5);
    assert.equal(troll.pressureRange, 2);
    assert.equal(troll.smashMult, 1.5);
    assert.equal(troll.role, 'Guardián territorial');
});

test('el Trasgo ruge al entrar en presión y no aplasta sin aviso previo', () => {
    freshGame(2301);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 12;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    const troll = {
        x: 10, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: false,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 40, maxHp: 40
    };
    GameState.entities.enemies = [troll];

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        GameLogic.handleTrollAction(troll);
        assert.equal(troll._trollPressurePrimed, true);
        assert.equal(GameState.player.hp, 100);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el Trasgo APLASTA con +50% si sigues adyacente tras el rugido', () => {
    freshGame(2302);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 11;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    GameState.player.equipment.armor = null;
    const troll = {
        x: 10, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: true,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 40, maxHp: 40, energy: 0
    };
    GameState.entities.enemies = [troll];

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        assert.equal(GameLogic.handleTrollAction(troll), true);
        assert.equal(GameState.player.hp, 85);
        assert.equal(troll._trollPressurePrimed, false);
        assert.equal(troll.atk, 10);
    } finally {
        Utils.random = originalRandom;
    }
});

test('salir del territorio rompe la presión y hace volver al Trasgo a casa', () => {
    freshGame(2303);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 20;
    GameState.player.y = 10;
    const troll = {
        x: 15, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: true,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 30, maxHp: 40
    };
    GameState.entities.enemies = [troll];

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        GameLogic.handleTrollAction(troll);
        assert.equal(troll._trollPressurePrimed, false);
        assert.ok(troll.x < 15);
        assert.equal(GameState.player.hp, 100);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el Trasgo se regenera únicamente al recuperar su guarida', () => {
    freshGame(2304);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 20;
    GameState.player.y = 20;
    const troll = {
        x: 10, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: false,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 30, maxHp: 40
    };
    GameState.entities.enemies = [troll];

    GameLogic.handleTrollAction(troll);
    assert.equal(troll.hp, 32);
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


test('el stock del mercader queda congelado tras la primera apertura', () => {
    freshGame(2401);
    GameState.level = 3;
    GameState.shopStocks = {};
    ShopSystem.open();
    const first = JSON.stringify(GameState.ui.shopStock.map(item => ({ name: item.name, value: item.value, price: item.price })));

    const originalRandom = Utils.random;
    Utils.random = () => 0.999;
    try {
        ShopSystem.open();
        const second = JSON.stringify(GameState.ui.shopStock.map(item => ({ name: item.name, value: item.value, price: item.price })));
        assert.equal(second, first);
    } finally {
        Utils.random = originalRandom;
    }
});

test('comprar elimina el objeto del stock persistente de esa planta', () => {
    freshGame(2402);
    GameState.level = 3;
    GameState.shopStocks = {};
    GameState.score = 99999;
    GameState.player.inventory = [];
    ShopSystem.open();

    const stock = ShopSystem.getStock();
    const before = stock.length;
    const bought = { ...stock[0] };
    ShopSystem.buy(0);

    assert.equal(ShopSystem.getStock().length, before - 1);
    assert.equal(GameState.player.inventory.length, 1);
    assert.equal(GameState.player.inventory[0].buyPrice, bought.price);
    ShopSystem.open();
    assert.equal(GameState.ui.shopStock.some(item => item.name === bought.name && item.price === bought.price), false);
});

test('vender devuelve el 50% del precio pagado y retira el objeto de la mochila', () => {
    freshGame(2403);
    GameState.level = 3;
    GameState.shopStocks = {};
    GameState.score = 10;
    GameState.player.inventory = [{
        type: 'weapon', name: 'Espada comprada', value: 3, symbol: '!', color: '#ff00ff', buyPrice: 200
    }];

    assert.equal(ShopSystem.sellPrice(GameState.player.inventory[0]), 100);
    ShopSystem.sell(0);
    assert.equal(GameState.score, 110);
    assert.equal(GameState.player.inventory.length, 0);
});

test('los objetos encontrados se valoran por tipo y potencia, no por profundidad actual', () => {
    freshGame(2404);
    GameState.level = 9;
    const found = { type: 'weapon', name: 'Arma encontrada', value: 3, symbol: '!', color: '#ff00ff' };
    assert.equal(ShopSystem.estimateValue(found), 200);
    assert.equal(ShopSystem.sellPrice(found), 100);
});

test('una partida nueva limpia todos los stocks persistentes de mercader', () => {
    freshGame(2405);
    GameState.level = 3;
    ShopSystem.open();
    assert.ok(Object.keys(GameState.shopStocks).length > 0);
    GameLogic.init(2406);
    assert.equal(Object.keys(GameState.shopStocks).length, 0);
});


test('Frozen genera una Cámara de Escarcha opcional con cofre especial', () => {
    freshGame(2501);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();

    const zone = GameState.floor.riskZone;
    assert.ok(zone);
    assert.equal(zone.type, 'FROZEN_VAULT');
    assert.equal(FloorSystem.isFrozenVaultTile(GameState.stairs.up.x, GameState.stairs.up.y), false);
    assert.equal(FloorSystem.isFrozenVaultTile(GameState.stairs.down.x, GameState.stairs.down.y), false);

    const chest = GameState.entities.chests.find(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(chest);
    assert.equal(FloorSystem.isFrozenVaultTile(chest.x, chest.y), true);
});

test('la Cámara de Escarcha duplica el riesgo de resbalón y respeta los crampones', () => {
    freshGame(2502);
    GameState.floor = { type: 'FROZEN', riskZone: { type: 'FROZEN_VAULT', x1: 10, y1: 10, x2: 15, y2: 15 } };
    GameState.player.equipment.armor = null;

    GameState.player.x = 5;
    GameState.player.y = 5;
    assert.equal(FloorSystem.slipChance(), 0.35);

    GameState.player.x = 12;
    GameState.player.y = 12;
    assert.equal(FloorSystem.slipChance(), 0.70);

    GameState.player.equipment.armor = { traits: { slipResist: 0.75 } };
    assert.equal(FloorSystem.slipChance(), 0.175);
});

test('el cofre de escarcha nunca usa la trampa normal y entrega equipo mejorado', () => {
    freshGame(2503);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.player.hp = 80;
    GameState.player.inventory = [];

    const chestIndex = GameState.entities.chests.findIndex(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(chestIndex >= 0);
    const originalRandom = Utils.random;
    Utils.random = () => 0;
    try {
        GameLogic.openChest(chestIndex);
        assert.equal(GameState.player.hp, 80);
        assert.equal(GameState.entities.chests[chestIndex].isOpen, true);
        assert.equal(GameState.player.inventory.length, 1);
        assert.ok(GameState.player.inventory[0].name.includes('escarcha'));
        assert.ok(['weapon', 'armor'].includes(GameState.player.inventory[0].type));
    } finally {
        Utils.random = originalRandom;
    }
});

test('el cofre de escarcha permanece abierto al volver a la planta', () => {
    freshGame(2504);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.player.inventory = [];

    let chestIndex = GameState.entities.chests.findIndex(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(chestIndex >= 0);
    const chest = GameState.entities.chests[chestIndex];
    const coords = [chest.x, chest.y];
    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        GameLogic.openChest(chestIndex);
    } finally {
        Utils.random = originalRandom;
    }

    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    const restored = GameState.entities.chests.find(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(restored);
    assert.deepEqual([restored.x, restored.y], coords);
    assert.equal(restored.isOpen, true);
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
