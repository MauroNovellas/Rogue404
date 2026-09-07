const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('autoplayer-navigation.js', 'utf8');
const rows = 5;
const cols = 5;
const seen = () => Array.from({ length: rows }, () => Array(cols).fill(false));
const dirs = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1]
];

let stepHook = async () => ({ type: 'WANDER' });

const key = (x, y) => `${x},${y}`;
const player = {
    running: true,
    memory: null,
    lastDecision: null,
    phase: 'DESCEND',
    reset: () => {
        player.memory = {
            attemptedUnknown: new Set(),
            actions: 0
        };
        player.lastDecision = null;
        return player;
    },
    isSeen: (x, y) => Boolean(context.GameState.seen[y] && context.GameState.seen[y][x]),
    isKnownWalkable: (x, y) => Boolean(
        x >= 0 && y >= 0 && x < cols && y < rows &&
        context.GameState.seen[y] && context.GameState.seen[y][x]
    ),
    findPathToTargets: targets => {
        const targetKeys = new Set((targets || []).map(target => key(target.x, target.y)));
        const start = { x: context.GameState.player.x, y: context.GameState.player.y };
        const startKey = key(start.x, start.y);
        if (targetKeys.has(startKey)) return [];
        const queue = [start];
        const parent = new Map([[startKey, null]]);
        let found = null;
        while (queue.length && !found) {
            const current = queue.shift();
            for (const [dx, dy] of dirs) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                const nextKey = key(nx, ny);
                if (parent.has(nextKey) || !player.isKnownWalkable(nx, ny)) continue;
                parent.set(nextKey, key(current.x, current.y));
                if (targetKeys.has(nextKey)) {
                    found = nextKey;
                    break;
                }
                queue.push({ x: nx, y: ny });
            }
        }
        if (!found) return null;
        const path = [];
        let cursor = found;
        while (cursor && cursor !== startKey) {
            const [x, y] = cursor.split(',').map(Number);
            path.push({ x, y });
            cursor = parent.get(cursor);
        }
        path.reverse();
        return path;
    },
    stepAlong: async (path, label) => {
        if (!path || path.length === 0) return false;
        const next = path[0];
        context.GameState.player.x = next.x;
        context.GameState.player.y = next.y;
        player.lastDecision = { type: 'MOVE', target: label };
        return true;
    },
    step: async () => {
        player.memory.actions++;
        const decision = await stepHook();
        player.lastDecision = decision;
        return decision;
    }
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
const exhaustUnknownAround = (x, y) => {
    for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!player.isSeen(nx, ny)) player.memory.attemptedUnknown.add(transition(x, y, nx, ny));
    }
};

(async () => {
    // 1) Una casilla deja de ser frontera si todas sus salidas desconocidas ya fallaron.
    context.GameState.seen = seen();
    context.GameState.level = 1;
    context.GameState.player.x = 1;
    context.GameState.player.y = 1;
    markSeen(1, 1);
    markSeen(2, 1);
    player.reset();
    exhaustUnknownAround(1, 1);

    const frontiers = player.frontierTiles().map(tile => `${tile.x},${tile.y}`);
    assert.equal(frontiers.includes('1,1'), false);
    assert.equal(frontiers.includes('2,1'), true);

    // 2) Cambiar de planta limpia conocimiento local de navegación.
    player.memory.attemptedUnknown.add('2,1->3,1');
    stepHook = async () => {
        context.GameState.level = 2;
        return { type: 'DESCEND' };
    };
    await player.step();
    assert.equal(player.memory.attemptedUnknown.size, 0);
    assert.equal(player.memory.navigationLevel, 2);

    // 3) Un ping-pong con una frontera alternativa crea un escape persistente
    // y el siguiente turno sigue ese destino en vez de volver al azar.
    context.GameState.seen = seen();
    context.GameState.level = 3;
    context.GameState.player.x = 1;
    context.GameState.player.y = 1;
    markSeen(1, 1);
    markSeen(2, 1);
    markSeen(3, 1);
    player.running = true;
    player.reset();
    exhaustUnknownAround(1, 1);
    exhaustUnknownAround(2, 1);

    let toggle = false;
    stepHook = async () => {
        toggle = !toggle;
        context.GameState.player.x = toggle ? 2 : 1;
        context.GameState.player.y = 1;
        return { type: 'WANDER', target: 'azar' };
    };

    let decision = null;
    for (let i = 0; i < 12; i++) {
        decision = await player.step();
        if (decision && decision.type === 'BREAK_LOOP') break;
    }
    assert.equal(decision.type, 'BREAK_LOOP');
    assert.equal(player.memory.loopBreaks, 1);
    assert.equal(player.memory.escapeTarget.x, 3);
    assert.equal(player.memory.escapeTarget.y, 1);

    stepHook = async () => ({ type: 'WANDER', target: 'no_deberia_usarse' });
    decision = await player.step();
    assert.equal(decision.type, 'ESCAPE_MOVE');
    assert.equal(context.GameState.player.x, 3);
    assert.equal(context.GameState.player.y, 1);
    assert.equal(player.memory.escapeTarget.x, 3);

    const diagnostic = player.navigationDiagnostics();
    assert.equal(diagnostic.loopBreaks, 1);
    assert.ok(Array.isArray(diagnostic.decisionTrace));
    assert.ok(diagnostic.decisionTrace.some(entry => entry.decision && entry.decision.type === 'BREAK_LOOP'));
    assert.equal(diagnostic.currentObjective.type, 'ESCAPE_MOVE');

    // 4) Sin frontera ni misión alcanzable, el mismo ping-pong termina STUCK
    // rápidamente en vez de acumular cientos de falsas rupturas.
    context.GameState.seen = Array.from({ length: rows }, () => Array(cols).fill(true));
    context.GameState.level = 4;
    context.GameState.player.x = 1;
    context.GameState.player.y = 1;
    player.running = true;
    player.reset();
    toggle = false;
    stepHook = async () => {
        toggle = !toggle;
        context.GameState.player.x = toggle ? 2 : 1;
        context.GameState.player.y = 1;
        return { type: 'WANDER' };
    };

    decision = null;
    for (let i = 0; i < 12; i++) {
        decision = await player.step();
        if (decision && decision.type === 'STUCK') break;
    }
    assert.equal(decision.type, 'STUCK');
    assert.equal(decision.reason, 'sin_salida_alternativa');
    assert.equal(player.running, false);
    assert.ok(player.memory.loopBreaks <= 1);

    console.log('✓ navegación AutoPlayer 2.0 compromete escapes y corta bucles reincidentes');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});