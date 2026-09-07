// Rogue404 - navegación robusta para AutoPlayer
(() => {
    'use strict';

    if (!window.AutoPlayer) return;

    const DIRS = [
        [0, -1], [1, 0], [0, 1], [-1, 0],
        [1, -1], [1, 1], [-1, 1], [-1, -1]
    ];
    const inBounds = (x, y) => x >= 0 && y >= 0 && x < CONFIG.GRID.cols && y < CONFIG.GRID.rows;
    const posKey = (x, y) => `${GameState.level}:${x},${y}`;
    const transitionKey = (x, y, nx, ny) => `${x},${y}->${nx},${ny}`;

    const seenCount = () => {
        let total = 0;
        for (let y = 0; y < CONFIG.GRID.rows; y++) {
            const row = GameState.seen[y] || [];
            for (let x = 0; x < CONFIG.GRID.cols; x++) if (row[x]) total++;
        }
        return total;
    };

    const ensureNavigationMemory = () => {
        if (!AutoPlayer.memory) return;
        if (!(AutoPlayer.memory.visitCounts instanceof Map)) AutoPlayer.memory.visitCounts = new Map();
        if (!Array.isArray(AutoPlayer.memory.recentPositions)) AutoPlayer.memory.recentPositions = [];
        if (!Number.isFinite(AutoPlayer.memory.stagnantSteps)) AutoPlayer.memory.stagnantSteps = 0;
        if (!Number.isFinite(AutoPlayer.memory.loopBreaks)) AutoPlayer.memory.loopBreaks = 0;
        if (!Number.isFinite(AutoPlayer.memory.lastSeenCount)) AutoPlayer.memory.lastSeenCount = seenCount();
        if (!Number.isFinite(AutoPlayer.memory.navigationLevel)) AutoPlayer.memory.navigationLevel = GameState.level;
    };

    const recordPosition = () => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory) return;
        const key = posKey(GameState.player.x, GameState.player.y);
        AutoPlayer.memory.visitCounts.set(key, (AutoPlayer.memory.visitCounts.get(key) || 0) + 1);
        AutoPlayer.memory.recentPositions.push(key);
        if (AutoPlayer.memory.recentPositions.length > 12) AutoPlayer.memory.recentPositions.shift();
    };

    const resetFloorNavigation = () => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory) return;
        // attemptedUnknown usa coordenadas locales al piso en el cerebro base. Si no
        // lo limpiamos al cambiar de nivel, una pared del -1 puede envenenar la
        // misma coordenada del -2 y dejar fronteras sin explorar.
        if (AutoPlayer.memory.attemptedUnknown && typeof AutoPlayer.memory.attemptedUnknown.clear === 'function') {
            AutoPlayer.memory.attemptedUnknown.clear();
        }
        AutoPlayer.memory.visitCounts.clear();
        AutoPlayer.memory.recentPositions = [];
        AutoPlayer.memory.stagnantSteps = 0;
        AutoPlayer.memory.lastSeenCount = seenCount();
        AutoPlayer.memory.navigationLevel = GameState.level;
        recordPosition();
    };

    const baseReset = AutoPlayer.reset.bind(AutoPlayer);
    AutoPlayer.reset = (options = {}) => {
        const result = baseReset(options);
        ensureNavigationMemory();
        AutoPlayer.memory.visitCounts.clear();
        AutoPlayer.memory.recentPositions = [];
        AutoPlayer.memory.stagnantSteps = 0;
        AutoPlayer.memory.loopBreaks = 0;
        AutoPlayer.memory.lastSeenCount = seenCount();
        AutoPlayer.memory.navigationLevel = GameState.level;
        recordPosition();
        return result;
    };

    AutoPlayer.hasActionableUnknown = (x, y) => DIRS.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny) || AutoPlayer.isSeen(nx, ny)) return false;
        const attempted = AutoPlayer.memory && AutoPlayer.memory.attemptedUnknown;
        return !(attempted && attempted.has(transitionKey(x, y, nx, ny)));
    });

    // El frontier original consideraba frontera cualquier casilla junto a niebla,
    // incluso cuando el bot ya había probado esa salida y sabía que era una pared.
    // En un cul-de-sac eso hacía que findPathToTargets devolviese [] para la casilla
    // actual y el fallback empezase a pasear aleatoriamente para siempre.
    AutoPlayer.frontierTiles = () => {
        ensureNavigationMemory();
        const candidates = [];
        for (let y = 0; y < CONFIG.GRID.rows; y++) {
            for (let x = 0; x < CONFIG.GRID.cols; x++) {
                if (!AutoPlayer.isKnownWalkable(x, y)) continue;
                if (!AutoPlayer.hasActionableUnknown(x, y)) continue;
                candidates.push({ x, y });
            }
        }

        if (candidates.length <= 1 || !AutoPlayer.memory) return candidates;

        const recent = new Set(AutoPlayer.memory.recentPositions.slice(-6));
        const fresh = candidates.filter(tile => !recent.has(posKey(tile.x, tile.y)));
        return fresh.length > 0 ? fresh : candidates;
    };

    const baseStep = AutoPlayer.step.bind(AutoPlayer);
    AutoPlayer.step = async () => {
        ensureNavigationMemory();
        const beforeLevel = GameState.level;
        const beforeSeen = seenCount();
        const beforePos = posKey(GameState.player.x, GameState.player.y);
        const decision = await baseStep();

        ensureNavigationMemory();
        if (!AutoPlayer.memory) return decision;

        if (GameState.level !== beforeLevel || AutoPlayer.memory.navigationLevel !== GameState.level) {
            resetFloorNavigation();
            return decision;
        }

        const afterSeen = seenCount();
        const afterPos = posKey(GameState.player.x, GameState.player.y);
        const moved = beforePos !== afterPos;
        const discovered = afterSeen > beforeSeen;

        recordPosition();

        const meaningful = decision && !['MOVE', 'WANDER', 'EXPLORE_UNKNOWN', 'RETREAT'].includes(decision.type);
        if (discovered || meaningful) {
            AutoPlayer.memory.stagnantSteps = 0;
            AutoPlayer.memory.lastSeenCount = afterSeen;
            return decision;
        }

        if (moved) AutoPlayer.memory.stagnantSteps++;
        else AutoPlayer.memory.stagnantSteps += 2;

        const recent = AutoPlayer.memory.recentPositions.slice(-8);
        const uniqueRecent = new Set(recent).size;
        const shortLoop = recent.length >= 6 && uniqueRecent <= 3 && AutoPlayer.memory.stagnantSteps >= 6;

        if (shortLoop) {
            AutoPlayer.memory.loopBreaks++;
            const frontiers = AutoPlayer.frontierTiles();

            // Si todavía hay una frontera legal, el siguiente ciclo irá a una que
            // no forme parte del bucle reciente gracias al filtro anterior.
            if (frontiers.length > 0) {
                AutoPlayer.lastDecision = {
                    type: 'BREAK_LOOP',
                    reason: 'rebuscar_frontera',
                    frontiers: frontiers.length,
                    loopBreaks: AutoPlayer.memory.loopBreaks
                };
                AutoPlayer.memory.stagnantSteps = 0;
                return AutoPlayer.lastDecision;
            }

            // Si no queda ninguna frontera accionable ni objetivo, vagar al azar no
            // aporta información y falsea las simulaciones. Declaramos el atasco.
            AutoPlayer.lastDecision = {
                type: 'STUCK',
                reason: 'sin_fronteras_accionables',
                loopBreaks: AutoPlayer.memory.loopBreaks
            };
            AutoPlayer.running = false;
            return AutoPlayer.lastDecision;
        }

        return decision;
    };

    AutoPlayer.navigationDiagnostics = () => {
        ensureNavigationMemory();
        return {
            level: GameState.level,
            stagnantSteps: AutoPlayer.memory ? AutoPlayer.memory.stagnantSteps : 0,
            loopBreaks: AutoPlayer.memory ? AutoPlayer.memory.loopBreaks : 0,
            recentPositions: AutoPlayer.memory ? [...AutoPlayer.memory.recentPositions] : [],
            actionableFrontiers: AutoPlayer.frontierTiles().length
        };
    };

    window.rogueAutoNav = () => AutoPlayer.navigationDiagnostics();
})();