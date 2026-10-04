// Rogue404 - AutoPlayer y laboratorio de simulación
(() => {
    'use strict';

    const REAL_SET_TIMEOUT = window.setTimeout.bind(window);
    const DIRS = [
        [0, -1], [1, 0], [0, 1], [-1, 0],
        [1, -1], [1, 1], [-1, 1], [-1, -1]
    ];

    const keyFor = (x, y) => `${x},${y}`;
    const inBounds = (x, y) => x >= 0 && y >= 0 && x < CONFIG.GRID.cols && y < CONFIG.GRID.rows;
    const chebyshev = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    const killCount = () => Object.values(GameState.player.stats.kills || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

    const PROFILES = {
        explorer: {
            foodAt: 45,
            waterAt: 50,
            restHp: 0.55,
            stopRestHp: 0.78,
            retreatHp: 0.30,
            shopResourceAt: 60,
            riskAppetite: 0.45
        }
    };

    const AutoPlayer = {
        running: false,
        timer: null,
        lastDecision: null,
        profileName: 'explorer',
        goalDepth: 9,
        phase: 'DESCEND',
        memory: null,

        reset: ({ profile = 'explorer', goalDepth = 9 } = {}) => {
            AutoPlayer.profileName = PROFILES[profile] ? profile : 'explorer';
            AutoPlayer.goalDepth = Math.max(1, Number(goalDepth) || 9);
            AutoPlayer.phase = GameState.level >= AutoPlayer.goalDepth ? 'ASCEND' : 'DESCEND';
            AutoPlayer.memory = {
                attemptedUnknown: new Set(),
                shopsDone: new Set(),
                actions: 0,
                visitedRisk: new Set()
            };
            AutoPlayer.lastDecision = null;
        },

        profile: () => PROFILES[AutoPlayer.profileName] || PROFILES.explorer,

        isSeen: (x, y) => Boolean(inBounds(x, y) && GameState.seen[y] && GameState.seen[y][x]),
        isVisible: (x, y) => Boolean(inBounds(x, y) && GameState.visible[y] && GameState.visible[y][x]),

        isKnownWalkable: (x, y) => {
            if (!AutoPlayer.isSeen(x, y)) return false;
            if (!GameState.map[y] || GameState.map[y][x] === '#') return false;
            if (FloorSystem.isHole(x, y)) return false;
            if (FloorSystem.shouldCollapseOnEntry(x, y)) return false;
            if (GameState.entities.chests.some(chest => chest.x === x && chest.y === y)) return false;
            if (GameState.entities.shops.some(shop => shop.x === x && shop.y === y)) return false;
            if (GameState.entities.enemies.some(enemy => enemy.x === x && enemy.y === y)) return false;
            return true;
        },

        visibleEnemies: () => GameState.entities.enemies.filter(enemy => AutoPlayer.isVisible(enemy.x, enemy.y)),
        adjacentEnemies: () => AutoPlayer.visibleEnemies().filter(enemy => chebyshev(GameState.player.x, GameState.player.y, enemy.x, enemy.y) <= 1),

        findPathToTargets: (targets) => {
            const normalized = (targets || []).filter(target => target && AutoPlayer.isSeen(target.x, target.y));
            if (normalized.length === 0) return null;

            const targetKeys = new Set(normalized.map(target => keyFor(target.x, target.y)));
            const start = { x: GameState.player.x, y: GameState.player.y };
            const startKey = keyFor(start.x, start.y);
            if (targetKeys.has(startKey)) return [];

            const queue = [start];
            const parent = new Map([[startKey, null]]);
            let foundKey = null;

            while (queue.length > 0 && !foundKey) {
                const current = queue.shift();
                for (const [dx, dy] of DIRS) {
                    const nx = current.x + dx;
                    const ny = current.y + dy;
                    const nextKey = keyFor(nx, ny);
                    if (parent.has(nextKey) || !AutoPlayer.isKnownWalkable(nx, ny)) continue;
                    parent.set(nextKey, keyFor(current.x, current.y));
                    if (targetKeys.has(nextKey)) {
                        foundKey = nextKey;
                        break;
                    }
                    queue.push({ x: nx, y: ny });
                }
            }

            if (!foundKey) return null;
            const path = [];
            let cursor = foundKey;
            while (cursor && cursor !== startKey) {
                const [x, y] = cursor.split(',').map(Number);
                path.push({ x, y });
                cursor = parent.get(cursor);
            }
            path.reverse();
            return path;
        },

        pathTowardEntity: (entity) => {
            if (!entity || !AutoPlayer.isSeen(entity.x, entity.y)) return null;
            const neighbors = DIRS
                .map(([dx, dy]) => ({ x: entity.x + dx, y: entity.y + dy }))
                .filter(pos => AutoPlayer.isKnownWalkable(pos.x, pos.y));
            if (chebyshev(GameState.player.x, GameState.player.y, entity.x, entity.y) <= 1) return [];
            return AutoPlayer.findPathToTargets(neighbors);
        },

        frontierTiles: () => {
            const result = [];
            for (let y = 0; y < CONFIG.GRID.rows; y++) {
                for (let x = 0; x < CONFIG.GRID.cols; x++) {
                    if (!AutoPlayer.isKnownWalkable(x, y)) continue;
                    const hasUnknown = DIRS.some(([dx, dy]) => {
                        const nx = x + dx;
                        const ny = y + dy;
                        return inBounds(nx, ny) && !AutoPlayer.isSeen(nx, ny);
                    });
                    if (hasUnknown) result.push({ x, y });
                }
            }
            return result;
        },

        unknownMovesHere: () => DIRS
            .map(([dx, dy]) => ({ dx, dy, x: GameState.player.x + dx, y: GameState.player.y + dy }))
            .filter(move => inBounds(move.x, move.y) && !AutoPlayer.isSeen(move.x, move.y))
            .filter(move => !AutoPlayer.memory.attemptedUnknown.has(`${GameState.player.x},${GameState.player.y}->${move.x},${move.y}`)),

        itemGearScore: (item) => {
            if (!item || (item.type !== 'weapon' && item.type !== 'armor')) return -Infinity;
            let score = Number(item.value) || 0;
            const traits = item.traits || {};
            if (item.type === 'armor') {
                if (FloorSystem.is('FROZEN')) score += (Number(traits.slipResist) || 0) * 20 + (Number(traits.frozenRestHeal) || 0) * 4;
                if (FloorSystem.is('MAGMA')) score += (Number(traits.heatResist) || 0) * 12 + (Number(traits.thirstResist) || 0) * 12 + (Number(traits.magmaRestHeal) || 0) * 4;
                if (FloorSystem.is('UNSTABLE')) score += (Number(traits.fallDamageResist) || 0) * 18 + (traits.retainEquippedOnFall ? 8 : 0);
            }
            return score;
        },

        maybeUseResource: () => {
            const profile = AutoPlayer.profile();
            let type = null;
            if (GameState.player.water <= profile.waterAt) type = 'water';
            else if (GameState.player.food <= profile.foodAt) type = 'food';
            if (!type) return false;

            let bestIndex = -1;
            let bestValue = -1;
            GameState.player.inventory.forEach((item, index) => {
                if (item.type !== type) return;
                const value = Number(item.value) || 0;
                if (value > bestValue) { bestValue = value; bestIndex = index; }
            });
            if (bestIndex === -1) return false;

            const item = GameState.player.inventory[bestIndex];
            AutoPlayer.lastDecision = { type: 'USE', item: item.name, reason: type === 'water' ? 'sed' : 'hambre' };
            InventorySystem.useItem(bestIndex);
            return true;
        },

        maybeEquipUpgrade: () => {
            let bestIndex = -1;
            let bestGain = 0.01;
            GameState.player.inventory.forEach((item, index) => {
                if (item.type !== 'weapon' && item.type !== 'armor') return;
                const current = GameState.player.equipment[item.type];
                const gain = AutoPlayer.itemGearScore(item) - AutoPlayer.itemGearScore(current);
                if (gain > bestGain) { bestGain = gain; bestIndex = index; }
            });
            if (bestIndex === -1) return false;

            const item = GameState.player.inventory[bestIndex];
            AutoPlayer.lastDecision = { type: 'EQUIP', item: item.name, gain: bestGain };
            InventorySystem.useItem(bestIndex);
            return true;
        },

        saferRetreat: (enemies) => {
            const currentMin = Math.min(...enemies.map(enemy => chebyshev(GameState.player.x, GameState.player.y, enemy.x, enemy.y)));
            const options = DIRS
                .map(([dx, dy]) => ({ dx, dy, x: GameState.player.x + dx, y: GameState.player.y + dy }))
                .filter(move => AutoPlayer.isKnownWalkable(move.x, move.y))
                .map(move => ({
                    ...move,
                    minDist: Math.min(...enemies.map(enemy => chebyshev(move.x, move.y, enemy.x, enemy.y)))
                }))
                .filter(move => move.minDist > currentMin)
                .sort((a, b) => b.minDist - a.minDist);
            return options[0] || null;
        },

        handleCombat: async () => {
            const adjacent = AutoPlayer.adjacentEnemies();
            if (adjacent.length === 0) return false;

            const hpRatio = GameState.player.hp / Math.max(1, GameState.player.maxHp);
            const primedTroll = adjacent.find(enemy => enemy.behavior === 'WARDEN' && enemy._trollPressurePrimed);
            if (primedTroll) {
                AutoPlayer.lastDecision = { type: 'DEFEND', reason: 'aplastar_inminente', enemy: primedTroll.name };
                CombatSystem.performDefend();
                return true;
            }

            if (hpRatio <= AutoPlayer.profile().retreatHp) {
                const retreat = AutoPlayer.saferRetreat(adjacent);
                if (retreat) {
                    AutoPlayer.lastDecision = { type: 'RETREAT', dx: retreat.dx, dy: retreat.dy };
                    await GameLogic.movePlayer(retreat.dx, retreat.dy);
                    return true;
                }
            }

            if (adjacent.length >= 2 && GameState.player.combat.cooldowns.area === 0) {
                AutoPlayer.lastDecision = { type: 'SWEEP', targets: adjacent.length };
                CombatSystem.performAreaAttack();
                return true;
            }

            const target = adjacent.slice().sort((a, b) => a.hp - b.hp)[0];
            const dx = Math.sign(target.x - GameState.player.x);
            const dy = Math.sign(target.y - GameState.player.y);

            if (target.behavior === 'DIVER') {
                AutoPlayer.lastDecision = { type: 'QUICK', enemy: target.name };
                CombatSystem.startTargeting('quick');
                CombatSystem.executeAttack(dx, dy);
                return true;
            }

            AutoPlayer.lastDecision = { type: 'BUMP', enemy: target.name };
            await GameLogic.movePlayer(dx, dy);
            return true;
        },

        maybeRest: () => {
            const profile = AutoPlayer.profile();
            const hpRatio = GameState.player.hp / Math.max(1, GameState.player.maxHp);
            if (hpRatio > profile.restHp || GameState.player.food <= 30 || GameState.player.water <= 30) return false;
            if (FloorSystem.restHealing() <= 0) return false;
            const nearby = AutoPlayer.visibleEnemies().some(enemy => chebyshev(GameState.player.x, GameState.player.y, enemy.x, enemy.y) <= 4);
            if (nearby) return false;

            AutoPlayer.lastDecision = { type: 'REST', hpRatio };
            GameLogic.interactAction();
            return true;
        },

        handleShop: () => {
            const profile = AutoPlayer.profile();
            const stock = ShopSystem.getStock();
            if (!stock || stock.length === 0) {
                AutoPlayer.memory.shopsDone.add(GameState.level);
                StateController.change(STATE_ENUM.PLAYING);
                return true;
            }

            const affordable = (item) => item && item.price <= GameState.score && GameState.player.inventory.length < CONFIG.PLAYER.inventorySize;
            let index = -1;

            if (GameState.player.water < profile.shopResourceAt) index = stock.findIndex(item => item.type === 'water' && affordable(item));
            if (index === -1 && GameState.player.food < profile.shopResourceAt) index = stock.findIndex(item => item.type === 'food' && affordable(item));

            if (index === -1) {
                let bestGain = 0.5;
                stock.forEach((item, itemIndex) => {
                    if (!affordable(item) || (item.type !== 'weapon' && item.type !== 'armor')) return;
                    const current = GameState.player.equipment[item.type];
                    const gain = AutoPlayer.itemGearScore(item) - AutoPlayer.itemGearScore(current);
                    if (gain > bestGain) { bestGain = gain; index = itemIndex; }
                });
            }

            if (index !== -1) {
                const item = stock[index];
                AutoPlayer.lastDecision = { type: 'BUY', item: item.name, price: item.price };
                ShopSystem.buy(index);
                return true;
            }

            AutoPlayer.memory.shopsDone.add(GameState.level);
            StateController.change(STATE_ENUM.PLAYING);
            AutoPlayer.lastDecision = { type: 'LEAVE_SHOP' };
            return true;
        },

        knownChestTargets: () => GameState.entities.chests.filter(chest => !chest.isOpen && AutoPlayer.isSeen(chest.x, chest.y)),
        knownItemTargets: () => GameState.entities.items.filter(item => AutoPlayer.isSeen(item.x, item.y)),
        knownShopTargets: () => GameState.entities.shops.filter(shop => AutoPlayer.isSeen(shop.x, shop.y) && !AutoPlayer.memory.shopsDone.has(GameState.level)),

        stepAlong: async (path, label) => {
            if (!path || path.length === 0) return false;
            const next = path[0];
            const dx = Math.sign(next.x - GameState.player.x);
            const dy = Math.sign(next.y - GameState.player.y);
            AutoPlayer.lastDecision = { type: 'MOVE', target: label, dx, dy };
            await GameLogic.movePlayer(dx, dy);
            return true;
        },

        isExpeditionComplete: () => AutoPlayer.phase === 'ASCEND' && GameState.level === 1 &&
            GameState.player.x === GameState.stairs.up.x && GameState.player.y === GameState.stairs.up.y,

        step: async () => {
            if (!AutoPlayer.memory) AutoPlayer.reset();
            AutoPlayer.memory.actions++;

            if (GameState.current === STATE_ENUM.GAMEOVER) {
                AutoPlayer.lastDecision = { type: 'DONE', reason: GameState.deathCause };
                return AutoPlayer.lastDecision;
            }

            if (GameState.ui.floorWarningOpen) FloorSystem.closeWarning();
            if (GameState.current === STATE_ENUM.CONTROLS || GameState.current === STATE_ENUM.MENU || GameState.current === STATE_ENUM.INVENTORY || GameState.current === STATE_ENUM.TARGETING) {
                StateController.change(STATE_ENUM.PLAYING);
            }
            if (GameState.current === STATE_ENUM.SHOP) {
                AutoPlayer.handleShop();
                return AutoPlayer.lastDecision;
            }

            if (GameState.level >= AutoPlayer.goalDepth) AutoPlayer.phase = 'ASCEND';
            if (AutoPlayer.isExpeditionComplete()) {
                AutoPlayer.lastDecision = { type: 'SUCCESS', depth: AutoPlayer.goalDepth };
                return AutoPlayer.lastDecision;
            }

            if (AutoPlayer.maybeUseResource()) return AutoPlayer.lastDecision;
            if (AutoPlayer.maybeEquipUpgrade()) return AutoPlayer.lastDecision;
            if (await AutoPlayer.handleCombat()) return AutoPlayer.lastDecision;

            const adjacentChest = AutoPlayer.knownChestTargets().find(chest =>
                Math.abs(chest.x - GameState.player.x) + Math.abs(chest.y - GameState.player.y) === 1
            );
            if (adjacentChest) {
                AutoPlayer.lastDecision = { type: 'OPEN_CHEST', chest: adjacentChest.specialId || 'normal' };
                GameLogic.interactAction();
                return AutoPlayer.lastDecision;
            }

            if (AutoPlayer.maybeRest()) return AutoPlayer.lastDecision;

            const stair = AutoPlayer.phase === 'DESCEND' ? GameState.stairs.down : GameState.stairs.up;
            if (AutoPlayer.isSeen(stair.x, stair.y) && GameState.player.x === stair.x && GameState.player.y === stair.y) {
                if (AutoPlayer.phase === 'ASCEND' && GameState.level === 1) {
                    AutoPlayer.lastDecision = { type: 'SUCCESS', depth: AutoPlayer.goalDepth };
                    return AutoPlayer.lastDecision;
                }
                AutoPlayer.lastDecision = { type: AutoPlayer.phase === 'DESCEND' ? 'DESCEND' : 'ASCEND', level: GameState.level };
                GameLogic.interactAction();
                if (GameState.ui.floorWarningOpen) FloorSystem.closeWarning();
                return AutoPlayer.lastDecision;
            }

            const visibleGoblinWithLoot = AutoPlayer.visibleEnemies().find(enemy => enemy.behavior === 'THIEF' && (enemy.stolenGold || 0) > 0);
            if (visibleGoblinWithLoot) {
                const path = AutoPlayer.pathTowardEntity(visibleGoblinWithLoot);
                if (await AutoPlayer.stepAlong(path, 'goblin_con_botin')) return AutoPlayer.lastDecision;
            }

            const shop = AutoPlayer.knownShopTargets()[0];
            if (shop) {
                const path = AutoPlayer.pathTowardEntity(shop);
                if (path && path.length === 0) {
                    const dx = Math.sign(shop.x - GameState.player.x);
                    const dy = Math.sign(shop.y - GameState.player.y);
                    AutoPlayer.lastDecision = { type: 'ENTER_SHOP' };
                    await GameLogic.movePlayer(dx, dy);
                    return AutoPlayer.lastDecision;
                }
                if (await AutoPlayer.stepAlong(path, 'mercader')) return AutoPlayer.lastDecision;
            }

            const items = AutoPlayer.knownItemTargets();
            const itemPath = AutoPlayer.findPathToTargets(items);
            if (await AutoPlayer.stepAlong(itemPath, 'objeto')) return AutoPlayer.lastDecision;

            const chests = AutoPlayer.knownChestTargets();
            let bestChestPath = null;
            for (const chest of chests) {
                const path = AutoPlayer.pathTowardEntity(chest);
                if (path && (!bestChestPath || path.length < bestChestPath.length)) bestChestPath = path;
            }
            if (await AutoPlayer.stepAlong(bestChestPath, 'cofre')) return AutoPlayer.lastDecision;

            if (AutoPlayer.isSeen(stair.x, stair.y)) {
                const stairPath = AutoPlayer.findPathToTargets([stair]);
                if (await AutoPlayer.stepAlong(stairPath, AutoPlayer.phase === 'DESCEND' ? 'escalera_abajo' : 'escalera_arriba')) return AutoPlayer.lastDecision;
            }

            const unknownHere = AutoPlayer.unknownMovesHere();
            if (unknownHere.length > 0) {
                const move = unknownHere[Math.floor(Utils.random() * unknownHere.length)];
                const attemptKey = `${GameState.player.x},${GameState.player.y}->${move.x},${move.y}`;
                const before = { x: GameState.player.x, y: GameState.player.y };
                AutoPlayer.lastDecision = { type: 'EXPLORE_UNKNOWN', dx: move.dx, dy: move.dy };
                const moved = await GameLogic.movePlayer(move.dx, move.dy);
                if (!moved && before.x === GameState.player.x && before.y === GameState.player.y) AutoPlayer.memory.attemptedUnknown.add(attemptKey);
                return AutoPlayer.lastDecision;
            }

            const frontierPath = AutoPlayer.findPathToTargets(AutoPlayer.frontierTiles());
            if (await AutoPlayer.stepAlong(frontierPath, 'frontera')) return AutoPlayer.lastDecision;

            const fallback = DIRS
                .map(([dx, dy]) => ({ dx, dy, x: GameState.player.x + dx, y: GameState.player.y + dy }))
                .filter(move => AutoPlayer.isKnownWalkable(move.x, move.y));
            if (fallback.length > 0) {
                const move = fallback[Math.floor(Utils.random() * fallback.length)];
                AutoPlayer.lastDecision = { type: 'WANDER', dx: move.dx, dy: move.dy };
                await GameLogic.movePlayer(move.dx, move.dy);
                return AutoPlayer.lastDecision;
            }

            AutoPlayer.lastDecision = { type: 'STUCK', level: GameState.level };
            return AutoPlayer.lastDecision;
        },

        stopVisible: () => {
            AutoPlayer.running = false;
            if (AutoPlayer.timer !== null) window.clearTimeout(AutoPlayer.timer);
            AutoPlayer.timer = null;
        },

        startVisible: ({ seed = null, goalDepth = 9, profile = 'explorer', delay = 140, newGame = true } = {}) => {
            AutoPlayer.stopVisible();
            if (newGame) GameLogic.init(seed === null ? Math.floor(Math.random() * 999999) : seed);
            if (Object.prototype.hasOwnProperty.call(GameState.ui, 'testMode')) GameState.ui.testMode = true;
            StateController.change(STATE_ENUM.PLAYING);
            FloorSystem.closeWarning();
            AutoPlayer.reset({ profile, goalDepth });
            AutoPlayer.running = true;
            Utils.log(`AUTÓMATA: objetivo profundidad -${AutoPlayer.goalDepth} y regreso.`, '#33ff00');

            const loop = async () => {
                if (!AutoPlayer.running) return;
                if (GameState.current === STATE_ENUM.GAMEOVER || AutoPlayer.isExpeditionComplete()) {
                    AutoPlayer.running = false;
                    if (AutoPlayer.isExpeditionComplete()) Utils.log('AUTÓMATA: expedición completada.', '#33ff00');
                    return;
                }
                await AutoPlayer.step();
                AutoPlayer.timer = REAL_SET_TIMEOUT(loop, Math.max(30, Number(delay) || 140));
            };
            loop();
            return AutoPlayer;
        }
    };

    const AutoSimulation = {
        fastMode: () => {
            const originals = {
                draw: Renderer.draw,
                updateHUD: UISystem.updateHUD,
                fillEndGameStats: UISystem.fillEndGameStats,
                floatText: VisualFX.floatText,
                log: Utils.log,
                fetchScores: Network.fetchScores,
                waitSlipFrame: FloorSystem.waitSlipFrame,
                setTimeout: window.setTimeout
            };

            Renderer.draw = () => {};
            UISystem.updateHUD = () => {};
            UISystem.fillEndGameStats = () => {};
            VisualFX.floatText = () => {};
            Utils.log = () => {};
            Network.fetchScores = async () => [];
            FloorSystem.waitSlipFrame = () => Promise.resolve();
            window.setTimeout = (fn) => { fn(); return 0; };

            return () => {
                Renderer.draw = originals.draw;
                UISystem.updateHUD = originals.updateHUD;
                UISystem.fillEndGameStats = originals.fillEndGameStats;
                VisualFX.floatText = originals.floatText;
                Utils.log = originals.log;
                Network.fetchScores = originals.fetchScores;
                FloorSystem.waitSlipFrame = originals.waitSlipFrame;
                window.setTimeout = originals.setTimeout;
            };
        },

        runInternal: async ({ seed, goalDepth = 9, profile = 'explorer', maxActions = 5000 } = {}) => {
            GameLogic.init(seed);
            if (Object.prototype.hasOwnProperty.call(GameState.ui, 'testMode')) GameState.ui.testMode = true;
            StateController.change(STATE_ENUM.PLAYING);
            FloorSystem.closeWarning();
            AutoPlayer.reset({ profile, goalDepth });

            let actions = 0;
            let success = false;
            let stuck = false;
            while (actions < maxActions && GameState.current !== STATE_ENUM.GAMEOVER) {
                if (AutoPlayer.isExpeditionComplete()) { success = true; break; }
                const decision = await AutoPlayer.step();
                actions++;
                if (decision && decision.type === 'SUCCESS') { success = true; break; }
                if (decision && decision.type === 'STUCK') { stuck = true; break; }
            }

            return {
                seed,
                profile,
                goalDepth,
                success,
                stuck,
                actions,
                maxDepth: GameState.maxLevel,
                finalLevel: GameState.level,
                hp: GameState.player.hp,
                maxHp: GameState.player.maxHp,
                food: GameState.player.food,
                water: GameState.player.water,
                score: GameState.score,
                kills: killCount(),
                cause: success ? 'Regreso a superficie' : (GameState.current === STATE_ENUM.GAMEOVER ? GameState.deathCause : (stuck ? 'Atascado' : 'Límite de acciones'))
            };
        },

        aggregate: (runs) => {
            const count = runs.length;
            const sum = (field) => runs.reduce((total, run) => total + (Number(run[field]) || 0), 0);
            const causes = {};
            runs.forEach(run => { causes[run.cause] = (causes[run.cause] || 0) + 1; });
            const successes = runs.filter(run => run.success).length;
            return {
                runs: count,
                successes,
                successRate: count ? successes / count : 0,
                avgMaxDepth: count ? sum('maxDepth') / count : 0,
                avgActions: count ? sum('actions') / count : 0,
                avgScore: count ? sum('score') / count : 0,
                avgKills: count ? sum('kills') / count : 0,
                avgHp: count ? sum('hp') / count : 0,
                avgFood: count ? sum('food') / count : 0,
                avgWater: count ? sum('water') / count : 0,
                causes
            };
        },

        runOne: async (options = {}) => {
            const restore = AutoSimulation.fastMode();
            try {
                return await AutoSimulation.runInternal({ seed: options.seed ?? 1, ...options });
            } finally {
                restore();
            }
        },

        runBatch: async ({ runs = 100, startSeed = 1, goalDepth = 9, profile = 'explorer', maxActions = 5000 } = {}) => {
            const totalRuns = Math.max(1, Math.floor(Number(runs) || 1));
            const restore = AutoSimulation.fastMode();
            const results = [];
            try {
                for (let index = 0; index < totalRuns; index++) {
                    results.push(await AutoSimulation.runInternal({
                        seed: (Number(startSeed) || 1) + index,
                        goalDepth,
                        profile,
                        maxActions
                    }));
                    if ((index + 1) % 20 === 0) await new Promise(resolve => REAL_SET_TIMEOUT(resolve, 0));
                }
            } finally {
                restore();
            }

            const summary = AutoSimulation.aggregate(results);
            console.table({
                partidas: summary.runs,
                exitos: summary.successes,
                exito_pct: `${(summary.successRate * 100).toFixed(1)}%`,
                profundidad_media: summary.avgMaxDepth.toFixed(2),
                acciones_medias: summary.avgActions.toFixed(1),
                oro_medio: summary.avgScore.toFixed(1),
                bajas_medias: summary.avgKills.toFixed(2)
            });
            console.table(summary.causes);
            return { summary, results };
        }
    };

    window.AutoPlayer = AutoPlayer;
    window.AutoSimulation = AutoSimulation;
    window.startRogueSpectator = (options = {}) => AutoPlayer.startVisible(options);
    window.stopRogueSpectator = () => AutoPlayer.stopVisible();
    window.runRogueSimulation = (options = {}) => AutoSimulation.runBatch(options);
})();
