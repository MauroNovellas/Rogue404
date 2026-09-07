const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('autoplayer-audit.js', 'utf8');
const calls = [];
let currentNav = { loopBreaks: 0, stagnantSteps: 0, recentPositions: [], actionableFrontiers: 2 };

const AutoPlayer = {
    lastDecision: null,
    stopVisible: () => {},
    profileDefinitions: () => [
        { id: 'prudent', label: 'Prudente' },
        { id: 'explorer', label: 'Explorador' },
        { id: 'greedy', label: 'Codicioso' },
        { id: 'aggressive', label: 'Agresivo' },
        { id: 'novice', label: 'Novato' }
    ],
    navigationDiagnostics: () => currentNav
};

const aggregate = (runs) => {
    const count = runs.length;
    const sum = field => runs.reduce((total, run) => total + (Number(run[field]) || 0), 0);
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

const AutoSimulation = {
    fastMode: () => () => {},
    aggregate,
    runInternal: async ({ seed, profile, goalDepth, maxActions }) => {
        calls.push(`${seed}:${profile}:${goalDepth}:${maxActions}`);
        const stuck = seed === 2 && profile === 'novice';
        const loopHeavy = seed === 1 && profile === 'greedy';
        currentNav = {
            loopBreaks: loopHeavy ? 4 : (stuck ? 1 : 0),
            stagnantSteps: stuck ? 8 : 0,
            recentPositions: loopHeavy ? ['1:1,1', '1:2,1', '1:1,1'] : [],
            actionableFrontiers: stuck ? 0 : 2
        };
        AutoPlayer.lastDecision = stuck ? { type: 'STUCK', reason: 'test' } : { type: 'MOVE' };
        return {
            seed,
            profile,
            goalDepth,
            success: !stuck,
            stuck,
            actions: stuck ? maxActions : 20 + seed,
            maxDepth: stuck ? 1 : goalDepth,
            finalLevel: stuck ? 1 : 1,
            hp: stuck ? 10 : 60,
            food: 50,
            water: 50,
            score: 100,
            kills: 2,
            cause: stuck ? 'Atascado' : 'Regreso a superficie'
        };
    }
};

const context = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    navigator: {},
    AutoPlayer,
    AutoSimulation,
    window: {
        AutoPlayer,
        AutoSimulation,
        setTimeout,
        clearTimeout
    }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'autoplayer-audit.js' });

(async () => {
    assert.equal(context.window.RogueAudit.presets.smoke.runs, 10);
    assert.equal(context.window.RogueAudit.presets.balance.goalDepth, 6);
    assert.equal(context.window.RogueAudit.presets.deep.runs, 500);

    const progress = [];
    const audit = await context.window.runRogueAudit({
        mode: 'smoke',
        runs: 2,
        startSeed: 1,
        profiles: ['greedy', 'novice'],
        goalDepth: 3,
        maxActions: 100,
        onProgress: info => progress.push(`${info.completed}/${info.total}:${info.seed}:${info.profile}`)
    });

    assert.equal(JSON.stringify(calls), JSON.stringify([
        '1:greedy:3:100',
        '1:novice:3:100',
        '2:greedy:3:100',
        '2:novice:3:100'
    ]));
    assert.equal(progress.at(-1), '4/4:2:novice');
    assert.equal(audit.results.greedy[0].loopBreaks, 4);
    assert.equal(audit.analysis.loopHeavy.length, 1);
    assert.equal(audit.analysis.stuck.length, 1);
    assert.equal(audit.analysis.stuck[0].seed, 2);
    assert.equal(audit.summaries.novice.stuck, 1);
    assert.ok(audit.report.includes('ROGUE404 AUDIT'));
    assert.ok(audit.report.includes('STUCK seed=2 profile=novice'));
    assert.ok(audit.report.includes('LOOP seed=1 profile=greedy breaks=4'));
    assert.equal(context.window.rogueAuditReport(), audit.report);

    console.log('✓ auditoria AutoPlayer, incidentes e informe compacto');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
