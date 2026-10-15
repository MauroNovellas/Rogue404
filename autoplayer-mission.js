// Rogue404 - Navigation 2.1: mission lock, search recovery and persistent navigation events
(() => {
    'use strict';

    if (!window.AutoPlayer || !window.AutoSimulation) return;

    const AutoPlayer = window.AutoPlayer;
    const AutoSimulation = window.AutoSimulation;
    const DIRS = [
        [0, -1], [1, 0], [0, 1], [-1, 0],
        [1, -1], [1, 1], [-1, 1], [-1, -1]
    ];

    const safeClone = (value) => {
        if (value === null || value === undefined) return value ?? null;
        try { return JSON.parse(JSON.stringify(value)); }
        catch (_) { return String(value); }
    };

    const seenCount = () => {
        let total = 0;
        for (let y = 0; y < CONFIG.GRID.rows; y++) {
            const row = GameState.seen[y] || [];
            for (let x = 0; x < CONFIG.GRID.cols; x++) if (row[x]) total++;
        }
        return total;
    };

    const ensureMissionMemory = () => {
        if (!AutoPlayer.memory) return;
        if (!Array.isArray(AutoPlayer.memory.navigationEvents)) AutoPlayer.memory.navigationEvents = [];
        if (!Number.isFinite(AutoPlayer.memory.missionSearchLevel)) AutoPlayer.memory.missionSearchLevel = GameState.level;
        if (typeof AutoPlayer.memory.missionSearchPhase !== 'string') AutoPlayer.memory.missionSearchPhase = AutoPlayer.phase || 'DESCEND';
        if (typeof AutoPlayer.memory.searchResetUsed !== 'boolean') AutoPlayer.memory.searchResetUsed = false;
        if (!Number.isFinite(AutoPlayer.memory.searchRecoveries)) AutoPlayer.memory.searchRecoveries = 0;
        if (!Number.isFinite(AutoPlayer.memory.searchRecoverySteps)) AutoPlayer.memory.searchRecoverySteps = 0;
        if (!Number.isFinite(AutoPlayer.memory.searchLastSeenCount)) AutoPlayer.memory.searchLastSeenCount = seenCount();
    };

    const recordEvent = (type, extra = {}) => {
        ensureMissionMemory();
        if (!AutoPlayer.memory) return;
        AutoPlayer.memory.navigationEvents.push({
            type,
            action: Number(AutoPlayer.memory.actions) || 0,
            phase: AutoPlayer.phase || null,
            level: GameState.level,
            position: `${GameState.level}:${GameState.player.x},${GameState.player.y}`,
            ...safeClone(extra)
        });
        if (AutoPlayer.memory.navigationEvents.length > 40) AutoPlayer.memory.navigationEvents.shift();
    };

    const resetMissionFloor = () => {
        ensureMissionMemory();
        if (!AutoPlayer.memory) return;
        AutoPlayer.memory.missionSearchLevel = GameState.level;
        AutoPlayer.memory.missionSearchPhase = AutoPlayer.phase || 'DESCEND';
        AutoPlayer.memory.searchResetUsed = false;
        AutoPlayer.memory.searchRecoverySteps = 0;
        AutoPlayer.memory.searchLastSeenCount = seenCount();
    };

    const baseReset = AutoPlayer.reset.bind(AutoPlayer);
    AutoPlayer.reset = (options = {}) => {
        const result = baseReset(options);
        ensureMissionMemory();
        AutoPlayer.memory.navigationEvents = [];
        AutoPlayer.memory.searchRecoveries = 0;
        resetMissionFloor();
        return result;
    };

    // During the return trip, optional loot must never outrank the mission.
    const baseKnownChestTargets = AutoPlayer.knownChestTargets.bind(AutoPlayer);
    const baseKnownItemTargets = AutoPlayer.knownItemTargets.bind(AutoPlayer);
    const baseKnownShopTargets = AutoPlayer.knownShopTargets.bind(AutoPlayer);
    const basePathTowardEntity = AutoPlayer.pathTowardEntity.bind(AutoPlayer);

    AutoPlayer.knownChestTargets = () => AutoPlayer.phase === 'ASCEND' ? [] : baseKnownChestTargets();
    AutoPlayer.knownItemTargets = () => AutoPlayer.phase === 'ASCEND' ? [] : baseKnownItemTargets();
    AutoPlayer.knownShopTargets = () => AutoPlayer.phase === 'ASCEND' ? [] : baseKnownShopTargets();
    AutoPlayer.pathTowardEntity = (entity) => {
        if (AutoPlayer.phase === 'ASCEND' && entity && entity.behavior === 'THIEF' && (entity.stolenGold || 0) > 0) return null;
        return basePathTowardEntity(entity);
    };

    const activeUpStair = () => GameState.stairs && GameState.stairs.up ? GameState.stairs.up : null;
    const stairIsSeen = () => {
        const stair = activeUpStair();
        return Boolean(stair && AutoPlayer.isSeen(stair.x, stair.y));
    };

    const explorationLeadExists = () => {
        const unknown = typeof AutoPlayer.unknownMovesHere === 'function' ? AutoPlayer.unknownMovesHere() : [];
        if (unknown && unknown.length > 0) return true;
        const frontiers = typeof AutoPlayer.frontierTiles === 'function' ? AutoPlayer.frontierTiles() : [];
        return Boolean(frontiers && frontiers.length > 0);
    };

    const recoveryPath = () => {
        if (!AutoPlayer.memory || typeof AutoPlayer.findPathToTargets !== 'function') return null;
        const recent = new Set((AutoPlayer.memory.recentPositions || []).slice(-10));
        const candidates = [];
        let minVisits = Infinity;

        for (let y = 0; y < CONFIG.GRID.rows; y++) {
            for (let x = 0; x < CONFIG.GRID.cols; x++) {
                if (!AutoPlayer.isKnownWalkable(x, y)) continue;
                if (x === GameState.player.x && y === GameState.player.y) continue;
                const key = `${GameState.level}:${x},${y}`;
                if (recent.has(key)) continue;
                const visits = AutoPlayer.memory.visitCounts instanceof Map
                    ? (AutoPlayer.memory.visitCounts.get(key) || 0)
                    : 0;
                minVisits = Math.min(minVisits, visits);
                candidates.push({ x, y, visits });
            }
        }

        if (candidates.length === 0) return null;
        const leastVisited = candidates.filter(tile => tile.visits === minVisits).map(({ x, y }) => ({ x, y }));
        return AutoPlayer.findPathToTargets(leastVisited);
    };

    const performRecoveryPrelude = async () => {
        if (typeof AutoPlayer.maybeUseResource === 'function' && AutoPlayer.maybeUseResource()) return AutoPlayer.lastDecision;
        if (typeof AutoPlayer.maybeEquipUpgrade === 'function' && AutoPlayer.maybeEquipUpgrade()) return AutoPlayer.lastDecision;
        if (typeof AutoPlayer.handleCombat === 'function' && await AutoPlayer.handleCombat()) return AutoPlayer.lastDecision;
        if (typeof AutoPlayer.maybeRest === 'function' && AutoPlayer.maybeRest()) return AutoPlayer.lastDecision;
        return null;
    };

    const runAscendRecovery = async () => {
        ensureMissionMemory();
        if (!AutoPlayer.memory || AutoPlayer.phase !== 'ASCEND') return null;
        if (GameState.current !== STATE_ENUM.PLAYING) return null;
        if (stairIsSeen() || explorationLeadExists()) return null;

        const prelude = await performRecoveryPrelude();
        if (prelude) return prelude;

        if (!AutoPlayer.memory.searchResetUsed) {
            if (AutoPlayer.memory.attemptedUnknown && typeof AutoPlayer.memory.attemptedUnknown.clear === 'function') {
                AutoPlayer.memory.attemptedUnknown.clear();
            }
            AutoPlayer.memory.searchResetUsed = true;
            AutoPlayer.memory.searchRecoveries++;
            recordEvent('SEARCH_RESET', { reason: 'sin_escalera_ni_fronteras' });
            if (explorationLeadExists()) return null;
        }

        if (AutoPlayer.memory.searchRecoverySteps >= 48) {
            AutoPlayer.lastDecision = {
                type: 'STUCK',
                reason: 'busqueda_regreso_agotada',
                phase: 'ASCEND',
                searchRecoverySteps: AutoPlayer.memory.searchRecoverySteps
            };
            AutoPlayer.running = false;
            return AutoPlayer.lastDecision;
        }

        const path = recoveryPath();
        if (path && path.length > 0 && typeof AutoPlayer.stepAlong === 'function') {
            const moved = await AutoPlayer.stepAlong(path, 'busqueda_regreso');
            if (moved) {
                AutoPlayer.memory.searchRecoverySteps++;
                AutoPlayer.lastDecision = {
                    type: 'SEARCH_MOVE',
                    reason: 'cobertura_menos_visitada',
                    step: AutoPlayer.memory.searchRecoverySteps,
                    dx: Math.sign(path[0].x - GameState.player.x),
                    dy: Math.sign(path[0].y - GameState.player.y)
                };
                return AutoPlayer.lastDecision;
            }
        }

        AutoPlayer.lastDecision = {
            type: 'STUCK',
            reason: 'sin_ruta_busqueda_regreso',
            phase: 'ASCEND'
        };
        AutoPlayer.running = false;
        return AutoPlayer.lastDecision;
    };

    const baseStep = AutoPlayer.step.bind(AutoPlayer);
    AutoPlayer.step = async () => {
        ensureMissionMemory();
        if (GameState.level >= AutoPlayer.goalDepth) AutoPlayer.phase = 'ASCEND';

        if (AutoPlayer.memory && (
            AutoPlayer.memory.missionSearchLevel !== GameState.level ||
            AutoPlayer.memory.missionSearchPhase !== AutoPlayer.phase
        )) {
            resetMissionFloor();
            if (AutoPlayer.phase === 'ASCEND') recordEvent('MISSION_LOCK', { reason: 'regreso_prioritario' });
        }

        const beforeActions = AutoPlayer.memory ? Number(AutoPlayer.memory.actions) || 0 : 0;
        const beforeSeen = seenCount();

        let decision = await runAscendRecovery();
        if (!decision) decision = await baseStep();

        ensureMissionMemory();
        if (!AutoPlayer.memory) return decision;

        const afterActions = Number(AutoPlayer.memory.actions) || 0;
        if (decision && afterActions === beforeActions && ['ESCAPE_MOVE', 'SEARCH_MOVE', 'STUCK'].includes(decision.type)) {
            AutoPlayer.memory.actions++;
            const trace = AutoPlayer.memory.decisionTrace;
            if (Array.isArray(trace) && trace.length > 0) {
                const last = trace[trace.length - 1];
                if (last && last.decision && last.decision.type === decision.type) last.action = AutoPlayer.memory.actions;
            }
        }

        const afterSeen = seenCount();
        if (afterSeen > beforeSeen) {
            AutoPlayer.memory.searchRecoverySteps = 0;
            AutoPlayer.memory.searchLastSeenCount = afterSeen;
        }

        if (decision && decision.type === 'BREAK_LOOP') {
            recordEvent('BREAK_LOOP', {
                fingerprint: decision.fingerprint || null,
                occurrences: decision.occurrences || 1,
                escapeTarget: safeClone(decision.escapeTarget),
                previous: safeClone(decision.previous)
            });
        } else if (decision && decision.type === 'STUCK') {
            recordEvent('STUCK', { reason: decision.reason || 'desconocido', decision: safeClone(decision) });
        }

        return decision;
    };

    const baseDiagnostics = typeof AutoPlayer.navigationDiagnostics === 'function'
        ? AutoPlayer.navigationDiagnostics.bind(AutoPlayer)
        : () => ({});

    AutoPlayer.navigationDiagnostics = () => {
        ensureMissionMemory();
        const base = baseDiagnostics();
        return {
            ...base,
            missionLock: AutoPlayer.phase === 'ASCEND',
            searchResetUsed: AutoPlayer.memory ? AutoPlayer.memory.searchResetUsed : false,
            searchRecoveries: AutoPlayer.memory ? AutoPlayer.memory.searchRecoveries : 0,
            searchRecoverySteps: AutoPlayer.memory ? AutoPlayer.memory.searchRecoverySteps : 0,
            navigationEvents: AutoPlayer.memory ? safeClone(AutoPlayer.memory.navigationEvents.slice(-24)) : []
        };
    };

    const baseRunInternal = AutoSimulation.runInternal.bind(AutoSimulation);
    AutoSimulation.runInternal = async (options = {}) => {
        const result = await baseRunInternal(options);
        const nav = AutoPlayer.navigationDiagnostics();
        return {
            ...result,
            missionLock: Boolean(nav.missionLock),
            searchRecoveries: Number(nav.searchRecoveries) || 0,
            searchRecoverySteps: Number(nav.searchRecoverySteps) || 0,
            navigationEvents: safeClone(nav.navigationEvents || [])
        };
    };
})();