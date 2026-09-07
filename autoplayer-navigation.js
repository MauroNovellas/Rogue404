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
    const localKey = (x, y) => `${x},${y}`;
    const transitionKey = (x, y, nx, ny) => `${x},${y}->${nx},${ny}`;

    const safeClone = (value) => {
        if (value === null || value === undefined) return value ?? null;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return String(value);
        }
    };

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
        if (!Object.prototype.hasOwnProperty.call(AutoPlayer.memory, 'escapeTarget')) AutoPlayer.memory.escapeTarget = null;
        if (!Number.isFinite(AutoPlayer.memory.escapeSteps)) AutoPlayer.memory.escapeSteps = 0;
        if (!Number.isFinite(AutoPlayer.memory.escapeFailures)) AutoPlayer.memory.escapeFailures = 0;
        if (!(AutoPlayer.memory.blockedEscapeTargets instanceof Set)) AutoPlayer.memory.blockedEscapeTargets = new Set();
        if (!(AutoPlayer.memory.loopFingerprints instanceof Map)) AutoPlayer.memory.loopFingerprints = new Map();
        if (!(AutoPlayer.memory.loopEscapeTargets instanceof Map)) AutoPlayer.memory.loopEscapeTargets = new Map();
        if (!Array.isArray(AutoPlayer.memory.decisionTrace)) AutoPlayer.memory.decisionTrace = [];
    };

    const recordPosition = () => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory) return;
        const key = posKey(GameState.player.x, GameState.player.y);
        AutoPlayer.memory.visitCounts.set(key, (AutoPlayer.memory.visitCounts.get(key) || 0) + 1);
        AutoPlayer.memory.recentPositions.push(key);
        if (AutoPlayer.memory.recentPositions.length > 12) AutoPlayer.memory.recentPositions.shift();
    };

    const recordTrace = (decision, before, after, extra = {}) => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory) return;
        AutoPlayer.memory.decisionTrace.push({
            action: Number(AutoPlayer.memory.actions) || 0,
            phase: AutoPlayer.phase || null,
            level: GameState.level,
            before,
            after,
            decision: safeClone(decision),
            ...safeClone(extra)
        });
        if (AutoPlayer.memory.decisionTrace.length > 16) AutoPlayer.memory.decisionTrace.shift();
    };

    const resetFloorNavigation = () => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory) return;
        if (AutoPlayer.memory.attemptedUnknown && typeof AutoPlayer.memory.attemptedUnknown.clear === 'function') {
            AutoPlayer.memory.attemptedUnknown.clear();
        }
        AutoPlayer.memory.visitCounts.clear();
        AutoPlayer.memory.recentPositions = [];
        AutoPlayer.memory.stagnantSteps = 0;
        AutoPlayer.memory.lastSeenCount = seenCount();
        AutoPlayer.memory.navigationLevel = GameState.level;
        AutoPlayer.memory.escapeTarget = null;
        AutoPlayer.memory.escapeSteps = 0;
        AutoPlayer.memory.escapeFailures = 0;
        AutoPlayer.memory.blockedEscapeTargets.clear();
        AutoPlayer.memory.loopFingerprints.clear();
        AutoPlayer.memory.loopEscapeTargets.clear();
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
        AutoPlayer.memory.escapeTarget = null;
        AutoPlayer.memory.escapeSteps = 0;
        AutoPlayer.memory.escapeFailures = 0;
        AutoPlayer.memory.blockedEscapeTargets.clear();
        AutoPlayer.memory.loopFingerprints.clear();
        AutoPlayer.memory.loopEscapeTargets.clear();
        AutoPlayer.memory.decisionTrace = [];
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

    const allActionableFrontiers = () => {
        const candidates = [];
        for (let y = 0; y < CONFIG.GRID.rows; y++) {
            for (let x = 0; x < CONFIG.GRID.cols; x++) {
                if (!AutoPlayer.isKnownWalkable(x, y)) continue;
                if (!AutoPlayer.hasActionableUnknown(x, y)) continue;
                candidates.push({ x, y });
            }
        }
        return candidates;
    };

    AutoPlayer.frontierTiles = () => {
        ensureNavigationMemory();
        const candidates = allActionableFrontiers();
        if (candidates.length <= 1 || !AutoPlayer.memory) return candidates;

        const recent = new Set(AutoPlayer.memory.recentPositions.slice(-6));
        const fresh = candidates.filter(tile => !recent.has(posKey(tile.x, tile.y)));
        const pool = fresh.length > 0 ? fresh : candidates;
        return pool.sort((a, b) => {
            const visitsA = AutoPlayer.memory.visitCounts.get(posKey(a.x, a.y)) || 0;
            const visitsB = AutoPlayer.memory.visitCounts.get(posKey(b.x, b.y)) || 0;
            return visitsA - visitsB;
        });
    };

    const pathTo = (target) => {
        if (!target || typeof AutoPlayer.findPathToTargets !== 'function') return null;
        try {
            return AutoPlayer.findPathToTargets([target]);
        } catch (_) {
            return null;
        }
    };

    const reachableCandidate = (candidates) => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory) return null;
        const recent = new Set(AutoPlayer.memory.recentPositions.slice(-8));
        const blocked = AutoPlayer.memory.blockedEscapeTargets;
        const current = localKey(GameState.player.x, GameState.player.y);
        const scored = [];

        for (const tile of candidates || []) {
            if (!tile) continue;
            const key = localKey(tile.x, tile.y);
            if (key === current || recent.has(posKey(tile.x, tile.y)) || blocked.has(key)) continue;
            const path = pathTo(tile);
            if (!path || path.length === 0) continue;
            scored.push({
                x: tile.x,
                y: tile.y,
                key,
                pathLength: path.length,
                visits: AutoPlayer.memory.visitCounts.get(posKey(tile.x, tile.y)) || 0
            });
        }

        scored.sort((a, b) => (a.visits - b.visits) || (b.pathLength - a.pathLength) || a.key.localeCompare(b.key));
        return scored[0] || null;
    };

    const missionTarget = () => {
        if (!GameState.stairs || !AutoPlayer.phase) return null;
        const stair = AutoPlayer.phase === 'ASCEND' ? GameState.stairs.up : GameState.stairs.down;
        if (!stair || !AutoPlayer.isSeen(stair.x, stair.y)) return null;
        return stair;
    };

    const chooseEscapeTarget = () => {
        const frontier = reachableCandidate(allActionableFrontiers());
        if (frontier) return { ...frontier, reason: 'frontera_alternativa' };

        const stair = missionTarget();
        const mission = reachableCandidate(stair ? [stair] : []);
        if (mission) return { ...mission, reason: AutoPlayer.phase === 'ASCEND' ? 'escalera_arriba' : 'escalera_abajo' };

        return null;
    };

    const loopFingerprint = () => {
        if (!AutoPlayer.memory) return null;
        const recent = AutoPlayer.memory.recentPositions.slice(-8);
        if (recent.length < 6) return null;
        const unique = [...new Set(recent)];
        if (unique.length > 3) return null;
        return `${GameState.level}|${unique.sort().join('|')}`;
    };

    const markStuck = (reason, extra = {}) => {
        AutoPlayer.lastDecision = {
            type: 'STUCK',
            reason,
            phase: AutoPlayer.phase || null,
            ...extra
        };
        AutoPlayer.running = false;
        return AutoPlayer.lastDecision;
    };

    const activateEscape = (fingerprint, previousDecision) => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory) return markStuck('sin_memoria_navegacion');

        const occurrences = (AutoPlayer.memory.loopFingerprints.get(fingerprint) || 0) + 1;
        AutoPlayer.memory.loopFingerprints.set(fingerprint, occurrences);

        const previousTarget = AutoPlayer.memory.loopEscapeTargets.get(fingerprint);
        if (previousTarget) AutoPlayer.memory.blockedEscapeTargets.add(previousTarget);

        const target = chooseEscapeTarget();
        if (!target) {
            return markStuck(
                occurrences > 1 ? 'bucle_reincidente_sin_salida' : 'sin_salida_alternativa',
                { fingerprint, occurrences, previous: safeClone(previousDecision) }
            );
        }

        AutoPlayer.memory.escapeTarget = {
            x: target.x,
            y: target.y,
            key: target.key,
            reason: target.reason,
            fingerprint
        };
        AutoPlayer.memory.escapeSteps = 0;
        AutoPlayer.memory.loopBreaks++;
        AutoPlayer.memory.stagnantSteps = 0;
        AutoPlayer.memory.loopEscapeTargets.set(fingerprint, target.key);

        AutoPlayer.lastDecision = {
            type: 'BREAK_LOOP',
            reason: 'escape_comprometido',
            fingerprint,
            occurrences,
            escapeTarget: { x: target.x, y: target.y, reason: target.reason },
            previous: safeClone(previousDecision)
        };
        return AutoPlayer.lastDecision;
    };

    const runEscapeStep = async () => {
        ensureNavigationMemory();
        if (!AutoPlayer.memory || !AutoPlayer.memory.escapeTarget) return null;

        let attempts = 0;
        while (attempts < 3 && AutoPlayer.memory.escapeTarget) {
            const target = AutoPlayer.memory.escapeTarget;
            if (GameState.player.x === target.x && GameState.player.y === target.y) {
                AutoPlayer.memory.escapeTarget = null;
                AutoPlayer.memory.escapeSteps = 0;
                AutoPlayer.memory.stagnantSteps = 0;
                return null;
            }

            const path = pathTo(target);
            if (path && path.length > 0 && typeof AutoPlayer.stepAlong === 'function') {
                const moved = await AutoPlayer.stepAlong(path, 'escape_bucle');
                if (moved) {
                    AutoPlayer.memory.escapeSteps++;
                    AutoPlayer.lastDecision = {
                        type: 'ESCAPE_MOVE',
                        target: { x: target.x, y: target.y },
                        reason: target.reason,
                        fingerprint: target.fingerprint,
                        step: AutoPlayer.memory.escapeSteps
                    };
                    return AutoPlayer.lastDecision;
                }
            }

            AutoPlayer.memory.blockedEscapeTargets.add(target.key);
            AutoPlayer.memory.escapeFailures++;
            AutoPlayer.memory.escapeTarget = null;
            attempts++;

            const replacement = chooseEscapeTarget();
            if (replacement) {
                AutoPlayer.memory.escapeTarget = {
                    x: replacement.x,
                    y: replacement.y,
                    key: replacement.key,
                    reason: replacement.reason,
                    fingerprint: target.fingerprint
                };
                AutoPlayer.memory.loopEscapeTargets.set(target.fingerprint, replacement.key);
            }
        }

        if (!AutoPlayer.memory.escapeTarget) {
            return markStuck('escape_sin_ruta', {
                escapeFailures: AutoPlayer.memory.escapeFailures,
                blockedTargets: AutoPlayer.memory.blockedEscapeTargets.size
            });
        }
        return null;
    };

    const baseStep = AutoPlayer.step.bind(AutoPlayer);
    AutoPlayer.step = async () => {
        ensureNavigationMemory();

        if (AutoPlayer.memory && AutoPlayer.memory.navigationLevel !== GameState.level) {
            resetFloorNavigation();
        }

        const beforeLevel = GameState.level;
        const beforeSeen = seenCount();
        const beforePos = posKey(GameState.player.x, GameState.player.y);

        let decision = await runEscapeStep();
        if (!decision) decision = await baseStep();

        ensureNavigationMemory();
        if (!AutoPlayer.memory) return decision;

        const afterSeen = seenCount();
        const afterPos = posKey(GameState.player.x, GameState.player.y);

        if (GameState.level !== beforeLevel || AutoPlayer.memory.navigationLevel !== GameState.level) {
            recordTrace(decision, beforePos, afterPos, { floorTransition: true });
            resetFloorNavigation();
            return decision;
        }

        recordPosition();

        if (decision && decision.type === 'STUCK') {
            recordTrace(decision, beforePos, afterPos);
            return decision;
        }

        if (decision && decision.type === 'ESCAPE_MOVE') {
            AutoPlayer.memory.stagnantSteps = 0;
            AutoPlayer.memory.lastSeenCount = afterSeen;
            recordTrace(decision, beforePos, afterPos, { escapeActive: true });
            return decision;
        }

        const moved = beforePos !== afterPos;
        const discovered = afterSeen > beforeSeen;
        const meaningful = decision && !['MOVE', 'WANDER', 'EXPLORE_UNKNOWN', 'RETREAT'].includes(decision.type);

        if (discovered || meaningful) {
            AutoPlayer.memory.stagnantSteps = 0;
            AutoPlayer.memory.lastSeenCount = afterSeen;
            recordTrace(decision, beforePos, afterPos, { discovered });
            return decision;
        }

        if (moved) AutoPlayer.memory.stagnantSteps++;
        else AutoPlayer.memory.stagnantSteps += 2;

        const recent = AutoPlayer.memory.recentPositions.slice(-8);
        const uniqueRecent = new Set(recent).size;
        const shortLoop = recent.length >= 6 && uniqueRecent <= 3 && AutoPlayer.memory.stagnantSteps >= 6;

        if (shortLoop) {
            const fingerprint = loopFingerprint();
            if (fingerprint) {
                const breakDecision = activateEscape(fingerprint, decision);
                recordTrace(breakDecision, beforePos, afterPos, {
                    detectedLoop: true,
                    actionableFrontiers: allActionableFrontiers().length
                });
                return breakDecision;
            }
        }

        recordTrace(decision, beforePos, afterPos, { discovered: false });
        return decision;
    };

    const objectiveFromDecision = (decision) => {
        if (!decision || typeof decision !== 'object') return null;
        return {
            type: decision.type || null,
            target: safeClone(decision.target || decision.escapeTarget || null),
            reason: decision.reason || null
        };
    };

    AutoPlayer.navigationDiagnostics = () => {
        ensureNavigationMemory();
        const memory = AutoPlayer.memory;
        const fingerprints = memory
            ? [...memory.loopFingerprints.entries()]
                .map(([fingerprint, count]) => ({ fingerprint, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 6)
            : [];

        return {
            level: GameState.level,
            phase: AutoPlayer.phase || null,
            stagnantSteps: memory ? memory.stagnantSteps : 0,
            loopBreaks: memory ? memory.loopBreaks : 0,
            escapeTarget: memory ? safeClone(memory.escapeTarget) : null,
            escapeSteps: memory ? memory.escapeSteps : 0,
            escapeFailures: memory ? memory.escapeFailures : 0,
            blockedEscapeTargets: memory ? memory.blockedEscapeTargets.size : 0,
            recentPositions: memory ? [...memory.recentPositions] : [],
            actionableFrontiers: allActionableFrontiers().length,
            currentObjective: objectiveFromDecision(AutoPlayer.lastDecision),
            loopFingerprints: fingerprints,
            decisionTrace: memory ? safeClone(memory.decisionTrace.slice(-12)) : []
        };
    };

    window.rogueAutoNav = () => AutoPlayer.navigationDiagnostics();
})();