// Rogue404 - perfiles de jugador y comparador de simulaciones
(() => {
    'use strict';

    const REAL_SET_TIMEOUT = window.setTimeout.bind(window);
    const PROFILE_ORDER = ['prudent', 'explorer', 'greedy', 'aggressive', 'novice'];
    const PROFILES = {
        prudent: {
            label: 'Prudente',
            foodAt: 60,
            waterAt: 65,
            restHp: 0.72,
            stopRestHp: 0.86,
            retreatHp: 0.45,
            shopResourceAt: 75,
            riskAppetite: 0.20,
            environmentalGearWeight: 1.35,
            itemFocus: 'resources',
            combatStyle: 'tactical'
        },
        explorer: {
            label: 'Explorador',
            foodAt: 45,
            waterAt: 50,
            restHp: 0.55,
            stopRestHp: 0.78,
            retreatHp: 0.30,
            shopResourceAt: 60,
            riskAppetite: 0.65,
            environmentalGearWeight: 1.00,
            itemFocus: 'all',
            combatStyle: 'tactical'
        },
        greedy: {
            label: 'Codicioso',
            foodAt: 35,
            waterAt: 40,
            restHp: 0.45,
            stopRestHp: 0.68,
            retreatHp: 0.18,
            shopResourceAt: 45,
            riskAppetite: 0.95,
            environmentalGearWeight: 0.85,
            itemFocus: 'gold',
            combatStyle: 'tactical'
        },
        aggressive: {
            label: 'Agresivo',
            foodAt: 35,
            waterAt: 40,
            restHp: 0.35,
            stopRestHp: 0.58,
            retreatHp: 0.08,
            shopResourceAt: 40,
            riskAppetite: 0.75,
            environmentalGearWeight: 0.70,
            itemFocus: 'gear',
            combatStyle: 'aggressive'
        },
        novice: {
            label: 'Novato',
            foodAt: 20,
            waterAt: 25,
            restHp: 0.30,
            stopRestHp: 0.50,
            retreatHp: 0.12,
            shopResourceAt: 30,
            riskAppetite: 0.55,
            environmentalGearWeight: 0.35,
            itemFocus: 'all',
            combatStyle: 'novice'
        }
    };

    const base = {
        reset: AutoPlayer.reset.bind(AutoPlayer),
        itemGearScore: AutoPlayer.itemGearScore.bind(AutoPlayer),
        knownItemTargets: AutoPlayer.knownItemTargets.bind(AutoPlayer),
        knownChestTargets: AutoPlayer.knownChestTargets.bind(AutoPlayer),
        handleCombat: AutoPlayer.handleCombat.bind(AutoPlayer)
    };

    const normalizeProfile = (name) => PROFILES[name] ? name : 'explorer';
    const isRiskChest = (chest) => Boolean(chest && [
        'FROZEN_VAULT_CHEST',
        'MAGMA_FUMAROLE_CHEST',
        'UNSTABLE_RIFT_CHEST'
    ].includes(chest.specialId));

    const environmentalBonus = (item) => {
        if (!item || item.type !== 'armor') return 0;
        const traits = item.traits || {};
        if (FloorSystem.is('FROZEN')) {
            return (Number(traits.slipResist) || 0) * 20 + (Number(traits.frozenRestHeal) || 0) * 4;
        }
        if (FloorSystem.is('MAGMA')) {
            return (Number(traits.heatResist) || 0) * 12 + (Number(traits.thirstResist) || 0) * 12 + (Number(traits.magmaRestHeal) || 0) * 4;
        }
        if (FloorSystem.is('UNSTABLE')) {
            return (Number(traits.fallDamageResist) || 0) * 18 + (traits.retainEquippedOnFall ? 8 : 0);
        }
        return 0;
    };

    AutoPlayer.reset = ({ profile = 'explorer', goalDepth = 9 } = {}) => {
        const selected = normalizeProfile(profile);
        base.reset({ profile: 'explorer', goalDepth });
        AutoPlayer.profileName = selected;
        return AutoPlayer;
    };

    AutoPlayer.profile = () => PROFILES[normalizeProfile(AutoPlayer.profileName)];
    AutoPlayer.profileDefinitions = () => PROFILE_ORDER.map(id => ({ id, ...PROFILES[id] }));

    AutoPlayer.itemGearScore = (item) => {
        const baseScore = base.itemGearScore(item);
        if (!Number.isFinite(baseScore)) return baseScore;
        const weight = Number(AutoPlayer.profile().environmentalGearWeight) || 1;
        return baseScore + environmentalBonus(item) * (weight - 1);
    };

    AutoPlayer.knownItemTargets = () => {
        const items = base.knownItemTargets();
        if (items.length === 0) return items;

        const focus = AutoPlayer.profile().itemFocus;
        let preferred = [];
        if (focus === 'gold') preferred = items.filter(item => item.type === 'GOLD');
        if (focus === 'resources') preferred = items.filter(item => item.type === 'food' || item.type === 'water');
        if (focus === 'gear') preferred = items.filter(item => item.type === 'weapon' || item.type === 'armor');
        return preferred.length > 0 ? preferred : items;
    };

    AutoPlayer.knownChestTargets = () => {
        const appetite = Number(AutoPlayer.profile().riskAppetite) || 0;
        return base.knownChestTargets().filter(chest => !isRiskChest(chest) || appetite >= 0.50);
    };

    AutoPlayer.handleCombat = async () => {
        const adjacent = AutoPlayer.adjacentEnemies();
        if (adjacent.length === 0) return false;

        const profile = AutoPlayer.profile();
        const hpRatio = GameState.player.hp / Math.max(1, GameState.player.maxHp);

        if (profile.combatStyle === 'novice') {
            if (hpRatio <= profile.retreatHp) {
                const retreat = AutoPlayer.saferRetreat(adjacent);
                if (retreat) {
                    AutoPlayer.lastDecision = { type: 'RETREAT', profile: 'novice', dx: retreat.dx, dy: retreat.dy };
                    await GameLogic.movePlayer(retreat.dx, retreat.dy);
                    return true;
                }
            }

            const target = adjacent.slice().sort((a, b) => a.hp - b.hp)[0];
            const dx = Math.sign(target.x - GameState.player.x);
            const dy = Math.sign(target.y - GameState.player.y);
            AutoPlayer.lastDecision = { type: 'BUMP', profile: 'novice', enemy: target.name };
            await GameLogic.movePlayer(dx, dy);
            return true;
        }

        if (profile.combatStyle === 'aggressive' && adjacent.length === 1 && hpRatio > 0.55) {
            const target = adjacent[0];
            const trollPrimed = target.behavior === 'WARDEN' && target._trollPressurePrimed;
            if (!trollPrimed && target.behavior !== 'DIVER') {
                const dx = Math.sign(target.x - GameState.player.x);
                const dy = Math.sign(target.y - GameState.player.y);
                AutoPlayer.lastDecision = { type: 'SAVAGE', profile: 'aggressive', enemy: target.name };
                CombatSystem.startTargeting('savage');
                CombatSystem.executeAttack(dx, dy);
                return true;
            }
        }

        return base.handleCombat();
    };

    const normalizeProfiles = (profiles) => {
        const requested = Array.isArray(profiles) && profiles.length > 0 ? profiles : PROFILE_ORDER;
        const unique = [];
        requested.forEach(name => {
            const normalized = normalizeProfile(name);
            if (!unique.includes(normalized)) unique.push(normalized);
        });
        return unique;
    };

    AutoSimulation.runProfiles = async ({
        profiles = PROFILE_ORDER,
        runs = 100,
        startSeed = 1,
        goalDepth = 9,
        maxActions = 5000
    } = {}) => {
        const selected = normalizeProfiles(profiles);
        const totalRuns = Math.max(1, Math.floor(Number(runs) || 1));
        const firstSeed = Number(startSeed) || 1;
        const restore = AutoSimulation.fastMode();
        const results = Object.fromEntries(selected.map(profile => [profile, []]));

        try {
            for (let index = 0; index < totalRuns; index++) {
                const seed = firstSeed + index;
                for (const profile of selected) {
                    results[profile].push(await AutoSimulation.runInternal({
                        seed,
                        goalDepth,
                        profile,
                        maxActions
                    }));
                }
                if ((index + 1) % 10 === 0) await new Promise(resolve => REAL_SET_TIMEOUT(resolve, 0));
            }
        } finally {
            restore();
        }

        const summaries = {};
        const table = selected.map(profile => {
            const summary = AutoSimulation.aggregate(results[profile]);
            summaries[profile] = summary;
            return {
                perfil: PROFILES[profile].label,
                partidas: summary.runs,
                exito_pct: `${(summary.successRate * 100).toFixed(1)}%`,
                profundidad_media: summary.avgMaxDepth.toFixed(2),
                acciones_medias: summary.avgActions.toFixed(1),
                oro_medio: summary.avgScore.toFixed(1),
                bajas_medias: summary.avgKills.toFixed(2),
                hp_medio: summary.avgHp.toFixed(1),
                comida_media: summary.avgFood.toFixed(1),
                agua_media: summary.avgWater.toFixed(1)
            };
        });

        console.table(table);
        return { profiles: selected, summaries, results, table };
    };

    window.ROGUE_AUTOPLAYER_PROFILES = PROFILES;
    window.listRogueProfiles = () => AutoPlayer.profileDefinitions();
    window.compareRogueProfiles = (options = {}) => AutoSimulation.runProfiles(options);
})();
