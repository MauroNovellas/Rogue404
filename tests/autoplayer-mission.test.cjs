const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('autoplayer-mission.js', 'utf8');
const rows = 4;
const cols = 4;
let baseCalls = 0;
let hook = async () => ({ type: 'MOVE', target: 'base' });

const player = {
    memory: null,
    running: true,
    phase: 'DESCEND',
    goalDepth: 3,
    lastDecision: null,
    reset: () => {
        player.memory = {
            attemptedUnknown: new Set(),
            actions: 0,
            recentPositions: [],
            visitCounts: new Map(),
            decisionTrace: []
        };
        player.lastDecision = null;
        return player;
    },
    knownChestTargets: () => [{ id: 'chest' }],
    knownItemTargets: () => [{ id: 'item' }],
    knownShopTargets: () => [{ id: 'shop' }],
    pathTowardEntity: () => [{ x: 2, y: 1 }],
    isSeen: (x, y) => Boolean(context.GameState.seen[y] && context.GameState.seen[y][x]),
    isKnownWalkable: (x, y) => Boolean(x >= 0 && y >= 0 && x < cols && y < rows && context.GameState.seen[y] && context.GameState.seen[y][x]),
    unknownMovesHere: () => player.memory.attemptedUnknown.size > 0 ? [] : [{ dx: 1, dy: 0, x: 2, y: 1 }],
    frontierTiles: () => [],
    findPathToTargets: targets => targets && targets.length ? [{ x: targets[0].x, y: targets[0].y }] : null,
    stepAlong: async path => {
        if (!path || !path.length) return false;
        context.GameState.player.x = path[0].x;
        context.GameState.player.y = path[0].y;
        player.lastDecision = { type: 'MOVE' };
        return true;
    },
    maybeUseResource: () => false,
    maybeEquipUpgrade: () => false,
    handleCombat: async () => false,
    maybeRest: () => false,
    navigationDiagnostics: () => ({ loopBreaks: 0, decisionTrace: player.memory ? player.memory.decisionTrace : [] }),
    step: async () => {
        baseCalls++;
        const decision = await hook();
        if (!decision || decision.type !== 'ESCAPE_MOVE') player.memory.actions++;
        player.lastDecision = decision;
        return decision;
    }
};

const AutoSimulation = {
    runInternal: async options => ({ seed: options.seed || 1, success: true, actions: 10 })
};

const context = {
    console,
    CONFIG: { GRID: { cols, rows } },
    STATE_ENUM: { PLAYING: 'PLAYING' },
    GameState: {
        current: 'PLAYING',
        level: 1,
        seen: Array.from({ length: rows }, () => Array(cols).fill(false)),
        player: { x: 1, y: 1 },
        stairs: { up: { x: 3, y: 3 } }
    },
    AutoPlayer: player,
    AutoSimulation,
    window: { AutoPlayer: player, AutoSimulation }
};
context.window.window = context.window;

vm.createContext(context);
vm.runInContext(source, context, { filename: 'autoplayer-mission.js' });

(async () => {
    // 1) ASCEND bloquea objetivos opcionales y no persigue al Goblin con botin.
    player.reset();
    player.phase = 'ASCEND';
    assert.equal(player.knownItemTargets().length, 0);
    assert.equal(player.knownChestTargets().length, 0);
    assert.equal(player.knownShopTargets().length, 0);
    assert.equal(player.pathTowardEntity({ behavior: 'THIEF', stolenGold: 20 }), null);

    // 2) Si la busqueda se agota, reabre una sola vez los intentos desconocidos
    // y vuelve a la exploracion legal en vez de WANDER.
    context.GameState.level = 2;
    context.GameState.player.x = 1;
    context.GameState.player.y = 1;
    context.GameState.seen = Array.from({ length: rows }, () => Array(cols).fill(false));
    context.GameState.seen[1][1] = true;
    player.reset();
    player.phase = 'ASCEND';
    player.memory.attemptedUnknown.add('agotado');
    hook = async () => ({ type: player.memory.attemptedUnknown.size === 0 ? 'EXPLORE_UNKNOWN' : 'WANDER' });
    const decisionReset = await player.step();
    assert.equal(decisionReset.type, 'EXPLORE_UNKNOWN');
    assert.equal(player.memory.searchRecoveries, 1);
    assert.equal(player.memory.searchResetUsed, true);
    assert.ok(player.memory.navigationEvents.some(event => event.type === 'SEARCH_RESET'));

    // 3) Si tras reabrir no aparece frontera, usa cobertura conocida menos visitada
    // en lugar del fallback aleatorio.
    context.GameState.level = 2;
    context.GameState.player.x = 1;
    context.GameState.player.y = 1;
    context.GameState.seen = Array.from({ length: rows }, () => Array(cols).fill(true));
    player.reset();
    player.phase = 'ASCEND';
    player.memory.searchResetUsed = true;
    player.unknownMovesHere = () => [];
    player.frontierTiles = () => [];
    player.memory.recentPositions = ['2:1,1'];
    player.memory.visitCounts.set('2:2,1', 0);
    const callsBeforeRecovery = baseCalls;
    const decisionRecovery = await player.step();
    assert.equal(decisionRecovery.type, 'SEARCH_MOVE');
    assert.equal(baseCalls, callsBeforeRecovery);
    assert.equal(player.memory.searchRecoverySteps, 1);
    assert.equal(player.memory.actions, 1);

    // 4) Un ESCAPE_MOVE que evita el baseStep incrementa igualmente el contador
    // para que la caja negra no repita el mismo numero de accion.
    context.GameState.level = 2;
    player.reset();
    player.phase = 'DESCEND';
    hook = async () => ({ type: 'ESCAPE_MOVE', target: { x: 2, y: 1 } });
    const escape = await player.step();
    assert.equal(escape.type, 'ESCAPE_MOVE');
    assert.equal(player.memory.actions, 1);

    // 5) Los BREAK_LOOP quedan en un registro persistente independiente de la traza corta.
    hook = async () => ({ type: 'BREAK_LOOP', fingerprint: '2|A|B', occurrences: 1, escapeTarget: { x: 3, y: 1 } });
    await player.step();
    const diagnostic = player.navigationDiagnostics();
    assert.ok(diagnostic.navigationEvents.some(event => event.type === 'BREAK_LOOP' && event.fingerprint === '2|A|B'));
    assert.equal(diagnostic.missionLock, false);

    const enriched = await context.window.AutoSimulation.runInternal({ seed: 7 });
    assert.ok(Array.isArray(enriched.navigationEvents));

    console.log('✓ Navigation 2.1 bloquea botin al volver, recupera busqueda y conserva eventos reales');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});