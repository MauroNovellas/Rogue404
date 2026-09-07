const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('autoplayer-navigation.js', 'utf8');
const rows = 5;
const cols = 5;
const seen = () => Array.from({ length: rows }, () => Array(cols).fill(false));

let stepHook = async () => ({ type: 'WANDER' });

const player = {
    running: true,
    memory: null,
    reset: () => {
        player.memory = {
            attemptedUnknown: new Set(),
            actions: 0
        };
        return player;
    },
    isSeen: (x, y) => Boolean(context.GameState.seen[y] && context.GameState.seen[y][x]),
    isKnownWalkable: (x, y) => Boolean(
        x >= 0 && y >= 0 && x < cols && y < rows &&
        context.GameState.seen[y] && context.GameState.seen[y][x]
    ),
    step: async () => stepHook()
};

const context = {
    console,
    window: { AutoPlayer: player },
    AutoPlayer: player,
    CONFIG: { GRID: { cols, rows } },
    GameState: {
        level: 1,
        seen: seen(),
        player: { x: 1, y: 1 }
    }
};
context.window.window = context.window;

vm.createContext(context);
vm.runInContext(source, context, { filename: 'autoplayer-navigation.js' });

const markSeen = (x, y) => { context.GameState.seen[y][x] = true; };
const transition = (x, y, nx, ny) => `${x},${y}->${nx},${ny}`;
const dirs = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1]
];

(async () => {
    // 1) Una casilla no sigue siendo frontera si todas sus salidas desconocidas
    // ya fueron probadas y fallaron.
    context.GameState.seen = seen();
    context.GameState.level = 1;
    context.GameState.player.x = 1;
    context.GameState.player.y = 1;
    markSeen(1, 1);
    markSeen(2, 1);
    player.reset();

    for (const [dx, dy] of dirs) {
        const nx = 1 + dx;
        const ny = 1 + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!player.isSeen(nx, ny)) player.memory.attemptedUnknown.add(transition(1, 1, nx, ny));
    }

    const frontiers = player.frontierTiles().map(tile => `${tile.x},${tile.y}`);
    assert.equal(frontiers.includes('1,1'), false);
    assert.equal(frontiers.includes('2,1'), true);

    // 2) Cambiar de planta limpia los intentos locales para que una pared del -1
    // no invalide una salida equivalente del -2.
    player.memory.attemptedUnknown.add('2,1->3,1');
    stepHook = async () => {
        context.GameState.level = 2;
        return { type: 'DESCEND' };
    };
    await player.step();
    assert.equal(player.memory.attemptedUnknown.size, 0);
    assert.equal(player.memory.navigationLevel, 2);

    // 3) Si ya no existe ninguna frontera accionable, un ping-pong no puede
    // prolongarse indefinidamente: se declara STUCK y se detiene el espectador.
    context.GameState.seen = Array.from({ length: rows }, () => Array(cols).fill(true));
    context.GameState.level = 3;
    context.GameState.player.x = 1;
    context.GameState.player.y = 1;
    player.running = true;
    player.reset();
    let toggle = false;
    stepHook = async () => {
        toggle = !toggle;
        context.GameState.player.x = toggle ? 2 : 1;
        return { type: 'WANDER' };
    };

    let decision = null;
    for (let i = 0; i < 12; i++) {
        decision = await player.step();
        if (decision && decision.type === 'STUCK') break;
    }
    assert.equal(decision.type, 'STUCK');
    assert.equal(decision.reason, 'sin_fronteras_accionables');
    assert.equal(player.running, false);
    assert.ok(player.memory.loopBreaks >= 1);

    console.log('✓ navegación AutoPlayer evita fronteras fantasma y bucles sin progreso');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
