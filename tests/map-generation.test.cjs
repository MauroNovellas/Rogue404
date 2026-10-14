const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Ejercita el generador y los spawns reales sin dibujar ni abrir menús.
const element = () => ({
    style: {}, classList: { add() {}, remove() {}, contains: () => false }, focus() {}
});
const context = {
    document: { getElementById: element, addEventListener() {} },
    console, setTimeout: () => 0, clearTimeout() {}
};
context.window = context;
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8')
    .replace(/GameLogic\.init\(\);\s*$/, '');
vm.runInContext(`${source}\n;globalThis.core = { CONFIG, GameState, Utils, MapSystem, FloorSystem, EntityFactory };\nRenderer.draw = () => {}; UISystem.updateHUD = () => {}; Utils.log = () => {}; MapSystem.updateFog = () => {};`, context);
const { CONFIG, GameState, Utils, MapSystem, FloorSystem } = context.core;

function freshMap() {
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => Array(CONFIG.GRID.cols).fill('#'));
}

function reachableFrom(start) {
    assert.equal(GameState.map[start.y][start.x], '.', 'El punto de entrada debe ser transitable');
    const visited = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    for (let index = 0; index < queue.length; index++) {
        const { x, y } = queue[index];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            const key = `${nx},${ny}`;
            if (GameState.map[ny]?.[nx] !== '.' || visited.has(key)) continue;
            visited.add(key);
            queue.push({ x: nx, y: ny });
        }
    }
    return visited;
}

function floorCount() {
    return GameState.map.reduce((total, row) => total + row.filter(tile => tile === '.').length, 0);
}

for (const shape of CONFIG.MAP.roomShapes) {
    for (let w = CONFIG.MAP.minRoomSize; w <= CONFIG.MAP.maxRoomSize; w++) {
        for (let h = CONFIG.MAP.minRoomSize; h <= CONFIG.MAP.maxRoomSize; h++) {
            for (let orientation = 0; orientation < 4; orientation++) {
                freshMap();
                const room = { x: 2, y: 2, w, h, shape, orientation, center: { x: 2 + Math.floor(w / 2), y: 2 + Math.floor(h / 2) } };
                MapSystem.carveRoom(room);
                const area = floorCount();
                assert.equal(reachableFrom(room.center).size, area, `${shape} ${w}×${h}: no puede tener suelo aislado`);
                assert.ok(area >= w * h * 0.55, 'La sala debe conservar espacio suficiente para moverse');
                if (shape !== 'RECTANGLE') assert.ok(area < w * h, `${shape} debe tener una silueta distinta`);
            }
        }
    }
}
console.log('✓ las cinco formas son transitables en todos los tamaños y orientaciones');

const silhouettes = new Set();
for (const shape of CONFIG.MAP.roomShapes) {
    freshMap();
    MapSystem.carveRoom({ x: 2, y: 2, w: 10, h: 11, shape, orientation: 3 });
    silhouettes.add(JSON.stringify(GameState.map));
}
assert.equal(silhouettes.size, CONFIG.MAP.roomShapes.length, 'Las salas ovaladas y achaflanadas deben distinguirse visualmente');
console.log('✓ las cinco siluetas se distinguen a igual tamaño');

// Un corredor previamente conectado nunca desaparece al tallar la sala.
freshMap();
MapSystem.carveHCorridor(1, 18, 4);
MapSystem.carveRoom({ x: 2, y: 2, w: 12, h: 12, shape: 'PILLARED', orientation: 0 });
for (let x = 1; x <= 18; x++) assert.equal(GameState.map[4][x], '.');
console.log('✓ los pilares y recortes respetan los corredores existentes');

const shapeCounts = new Map();
let generated = 0;
for (let seed = 1; seed <= 250; seed++) {
    for (const level of [1, 3, 6, 9]) {
        GameState.seed = seed;
        GameState.level = level;
        GameState.entryMethod = 'descending';
        GameState.persistence = {};
        GameState.recoveryDrops = {};
        MapSystem.initLevel();
        FloorSystem.closeWarning();
        const reached = reachableFrom(GameState.stairs.up);
        const label = `semilla ${seed}, planta ${level}`;
        assert.equal(reached.size, floorCount(), `${label}: todo el suelo debe estar conectado`);
        assert.ok(reached.has(`${GameState.stairs.down.x},${GameState.stairs.down.y}`), `${label}: la bajada debe ser accesible`);
        const roomShapes = new Set(GameState.rooms.map(room => room.shape));
        assert.ok(roomShapes.size >= Math.min(GameState.rooms.length, CONFIG.MAP.roomShapes.length), `${label}: variedad de salas`);
        for (const room of GameState.rooms) shapeCounts.set(room.shape, (shapeCounts.get(room.shape) || 0) + 1);
        for (const group of Object.values(GameState.entities)) {
            for (const entity of group) assert.ok(reached.has(`${entity.x},${entity.y}`), `${label}: entidad en suelo accesible`);
        }
        if (GameState.floor.riskZone) {
            const specialChest = GameState.entities.chests.find(chest => chest.specialId);
            assert.ok(specialChest, `${label}: la zona especial debe conservar su recompensa`);
            assert.ok(reached.has(`${specialChest.x},${specialChest.y}`));
        }
        assert.ok(GameState.map[0].every(tile => tile === '#'));
        assert.ok(GameState.map[CONFIG.GRID.rows - 1].every(tile => tile === '#'));
        assert.ok(GameState.map.every(row => row[0] === '#' && row[CONFIG.GRID.cols - 1] === '#'));
        generated++;
    }
}
assert.equal(shapeCounts.size, CONFIG.MAP.roomShapes.length);
console.log(`✓ ${generated} mazmorras: escaleras, suelo, botín y zonas especiales accesibles`);

GameState.seed = 777;
GameState.level = 6;
GameState.persistence = {};
MapSystem.initLevel();
const snapshot = JSON.stringify({ map: GameState.map, rooms: GameState.rooms, stairs: GameState.stairs, zone: GameState.floor.riskZone });
const chest = GameState.entities.chests[0];
assert.ok(chest);
MapSystem.markTaken(`CHEST_${chest.x},${chest.y}`);
GameState.entryMethod = 'ascending';
MapSystem.initLevel();
assert.equal(JSON.stringify({ map: GameState.map, rooms: GameState.rooms, stairs: GameState.stairs, zone: GameState.floor.riskZone }), snapshot);
assert.ok(GameState.entities.chests.some(entry => entry.x === chest.x && entry.y === chest.y && entry.isOpen));
console.log('✓ volver a una planta conserva formas, escaleras y cofres abiertos');

// Las formas no deben consumir la secuencia que decide tamaños y conexiones.
const originalShapes = [...CONFIG.MAP.roomShapes];
function layoutWithShapes(shapes) {
    CONFIG.MAP.roomShapes = shapes;
    GameState.seed = 1234;
    GameState.level = 1;
    GameState.rooms = [];
    freshMap();
    GameState.rng = Utils.mulberry32(GameState.seed + GameState.level);
    MapSystem.generateDungeon();
    return JSON.stringify(GameState.rooms.map(({ x, y, w, h, center }) => ({ x, y, w, h, center })));
}
assert.equal(layoutWithShapes(originalShapes), layoutWithShapes(['RECTANGLE']));
CONFIG.MAP.roomShapes = originalShapes;
console.log('✓ la arquitectura no altera el sorteo de tamaños y ubicaciones');
