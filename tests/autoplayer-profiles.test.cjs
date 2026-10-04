const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('autoplayer-profiles.js', 'utf8');
let currentItems = [];
let currentChests = [];
let recordedRuns = [];
let baseResetOptions = null;
let activeFloor = 'NORMAL';

const aggregate = (runs) => {
    const count = runs.length;
    const sum = (field) => runs.reduce((total, run) => total + (Number(run[field]) || 0), 0);
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
        causes: {}
    };
};

const context = {
    console: { table: () => {} },
    setTimeout,
    clearTimeout,
    window: {
        setTimeout,
        clearTimeout
    },
    FloorSystem: {
        is: (type) => activeFloor === type
    },
    GameState: {
        player: { hp: 100, maxHp: 100, x: 0, y: 0 }
    },
    GameLogic: {
        movePlayer: async () => true
    },
    CombatSystem: {
        startTargeting: () => {},
        executeAttack: () => {}
    },
    AutoPlayer: {
        profileName: 'explorer',
        lastDecision: null,
        reset: (options = {}) => {
            baseResetOptions = options;
            context.AutoPlayer.profileName = 'explorer';
            context.AutoPlayer.memory = {};
            return context.AutoPlayer;
        },
        profile: () => ({ environmentalGearWeight: 1 }),
        itemGearScore: (item) => item ? (Number(item.value) || 0) : -Infinity,
        knownItemTargets: () => currentItems,
        knownChestTargets: () => currentChests,
        adjacentEnemies: () => [],
        saferRetreat: () => null,
        handleCombat: async () => false
    },
    AutoSimulation: {
        fastMode: () => () => {},
        runInternal: async ({ seed, profile, goalDepth, maxActions }) => {
            recordedRuns.push({ seed, profile, goalDepth, maxActions });
            return {
                seed,
                profile,
                success: profile === 'prudent',
                maxDepth: profile === 'aggressive' ? 5 : 4,
                actions: seed,
                score: profile === 'aggressive' ? 30 : 20,
                kills: profile === 'aggressive' ? 3 : 1,
                hp: 50,
                food: 40,
                water: 35,
                cause: 'test'
            };
        },
        aggregate
    }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'autoplayer-profiles.js' });

(async () => {
    const definitions = context.AutoPlayer.profileDefinitions();
    assert.equal(
        definitions.map(profile => profile.id).join(','),
        'prudent,explorer,greedy,aggressive,novice'
    );

    context.AutoPlayer.reset({ profile: 'novice', goalDepth: 6 });
    assert.equal(context.AutoPlayer.profileName, 'novice');
    assert.equal(context.AutoPlayer.profile().label, 'Novato');
    assert.equal(baseResetOptions.profile, 'explorer');
    assert.equal(baseResetOptions.goalDepth, 6);

    currentItems = [
        { type: 'GOLD', name: 'Oro', value: 20 },
        { type: 'water', name: 'Agua', value: 25 },
        { type: 'weapon', name: 'Espada', value: 3 }
    ];

    context.AutoPlayer.reset({ profile: 'prudent' });
    assert.equal(context.AutoPlayer.knownItemTargets().map(item => item.type).join(','), 'water');

    context.AutoPlayer.reset({ profile: 'greedy' });
    assert.equal(context.AutoPlayer.knownItemTargets().map(item => item.type).join(','), 'GOLD');

    context.AutoPlayer.reset({ profile: 'aggressive' });
    assert.equal(context.AutoPlayer.knownItemTargets().map(item => item.type).join(','), 'weapon');

    currentChests = [
        { specialId: 'FROZEN_VAULT_CHEST', name: 'Cofre de Escarcha' },
        { specialId: null, name: 'Cofre normal' }
    ];

    context.AutoPlayer.reset({ profile: 'prudent' });
    assert.equal(context.AutoPlayer.knownChestTargets().map(chest => chest.name).join(','), 'Cofre normal');

    context.AutoPlayer.reset({ profile: 'greedy' });
    assert.equal(context.AutoPlayer.knownChestTargets().length, 2);

    activeFloor = 'FROZEN';
    const polar = { type: 'armor', value: 1, traits: { slipResist: 0.75, frozenRestHeal: 1 } };
    context.AutoPlayer.reset({ profile: 'prudent' });
    const prudentScore = context.AutoPlayer.itemGearScore(polar);
    context.AutoPlayer.reset({ profile: 'novice' });
    const noviceScore = context.AutoPlayer.itemGearScore(polar);
    assert.ok(prudentScore > noviceScore);

    recordedRuns = [];
    const comparison = await context.AutoSimulation.runProfiles({
        profiles: ['prudent', 'aggressive'],
        runs: 2,
        startSeed: 7,
        goalDepth: 9,
        maxActions: 123
    });

    assert.equal(
        recordedRuns.map(run => `${run.seed}:${run.profile}`).join(','),
        '7:prudent,7:aggressive,8:prudent,8:aggressive'
    );
    assert.equal(comparison.summaries.prudent.runs, 2);
    assert.equal(comparison.summaries.aggressive.runs, 2);
    assert.equal(comparison.table.length, 2);
    assert.equal(comparison.table[0].perfil, 'Prudente');

    console.log('✓ perfiles AutoPlayer y comparación por seeds');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
