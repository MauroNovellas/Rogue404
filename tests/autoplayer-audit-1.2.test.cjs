const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('autoplayer-audit-1.2.js', 'utf8');

const audit = {
    version: '1.1',
    profiles: ['explorer'],
    results: {
        explorer: [{
            seed: 10,
            profile: 'explorer',
            success: false,
            actions: 900,
            searchRecoveries: 1,
            navigationEvents: [
                { type: 'MISSION_LOCK', action: 300, phase: 'ASCEND', level: 3, position: '3:5,5', reason: 'regreso_prioritario' },
                { type: 'BREAK_LOOP', action: 420, phase: 'ASCEND', level: 2, position: '2:8,8', fingerprint: '2|A|B', escapeTarget: { x: 10, y: 8 } },
                { type: 'SEARCH_RESET', action: 700, phase: 'ASCEND', level: 1, position: '1:4,4', reason: 'sin_escalera_ni_fronteras' }
            ]
        }]
    },
    report: 'ROGUE404 AUDIT\nAudit version: 1.1\nMode: SMOKE'
};

const RogueAudit = {
    version: '1.1',
    last: null,
    run: async () => {
        RogueAudit.last = audit;
        return audit;
    }
};

const context = {
    console,
    window: { RogueAudit }
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'autoplayer-audit-1.2.js' });

(async () => {
    assert.equal(context.window.RogueAudit.version, '1.2');
    const result = await context.window.RogueAudit.run({ mode: 'smoke' });
    assert.equal(result.version, '1.2');
    assert.ok(result.report.includes('Audit version: 1.2'));
    assert.ok(result.report.includes('=== NAVIGATION EVENTS 1.2 ==='));
    assert.ok(result.report.includes('NAV seed=10 profile=explorer'));
    assert.ok(result.report.includes('BREAK_LOOP'));
    assert.ok(result.report.includes('SEARCH_RESET'));
    assert.ok(result.report.includes('SEARCH RECOVERIES TOTAL: 1'));
    console.log('✓ Audit 1.2 conserva y reporta eventos reales de navegacion entre plantas');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});