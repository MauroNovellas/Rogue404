// Rogue404 - Audit 1.2: persistent navigation event reporting
(() => {
    'use strict';

    if (!window.RogueAudit) return;

    const RogueAudit = window.RogueAudit;
    const VERSION = '1.2';
    const baseRun = RogueAudit.run.bind(RogueAudit);

    const compactEvent = (event) => ({
        t: event.type || null,
        a: event.action ?? null,
        p: event.phase || null,
        l: event.level ?? null,
        pos: event.position || null,
        reason: event.reason || null,
        fp: event.fingerprint || null,
        target: event.escapeTarget || null
    });

    const appendNavigationEvents = (audit) => {
        if (!audit || !audit.results) return audit;
        audit.version = VERSION;

        const original = String(audit.report || '').replace(/Audit version: 1\.1/, `Audit version: ${VERSION}`);
        const lines = [original, '', '=== NAVIGATION EVENTS 1.2 ==='];
        const incidents = [];

        (audit.profiles || []).forEach(profile => {
            (audit.results[profile] || []).forEach(run => {
                const events = Array.isArray(run.navigationEvents) ? run.navigationEvents : [];
                const relevant = events.filter(event => ['BREAK_LOOP', 'SEARCH_RESET', 'STUCK', 'MISSION_LOCK'].includes(event.type));
                if (relevant.length === 0 && !(Number(run.searchRecoveries) > 0)) return;
                incidents.push({
                    seed: run.seed,
                    profile,
                    success: run.success,
                    actions: run.actions,
                    searchRecoveries: Number(run.searchRecoveries) || 0,
                    events: relevant.slice(-12)
                });
            });
        });

        incidents.sort((a, b) => {
            const aBad = a.success ? 0 : 1;
            const bBad = b.success ? 0 : 1;
            return (bBad - aBad) || (b.events.length - a.events.length) || (a.seed - b.seed) || a.profile.localeCompare(b.profile);
        });

        if (incidents.length === 0) lines.push('NAV EVENTS: none');
        else incidents.slice(0, 30).forEach(entry => {
            lines.push(`NAV seed=${entry.seed} profile=${entry.profile} success=${entry.success} actions=${entry.actions} search_recoveries=${entry.searchRecoveries}`);
            lines.push(`  EVENTS ${JSON.stringify(entry.events.map(compactEvent))}`);
        });

        const totalRecoveries = (audit.profiles || []).reduce((sum, profile) =>
            sum + (audit.results[profile] || []).reduce((inner, run) => inner + (Number(run.searchRecoveries) || 0), 0), 0);
        lines.push(`SEARCH RECOVERIES TOTAL: ${totalRecoveries}`);

        audit.report = lines.join('\n');
        return audit;
    };

    RogueAudit.run = async (options = {}) => appendNavigationEvents(await baseRun(options));
    RogueAudit.version = VERSION;
})();