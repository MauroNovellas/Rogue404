// Rogue404 - auditoria automatica del AutoPlayer y panel de laboratorio
(() => {
    'use strict';

    if (!window.AutoPlayer || !window.AutoSimulation) return;

    const REAL_SET_TIMEOUT = window.setTimeout.bind(window);
    const AUDIT_VERSION = '1.0';
    const PROFILE_ORDER = ['prudent', 'explorer', 'greedy', 'aggressive', 'novice'];
    const PRESETS = {
        smoke: { label: 'SMOKE', runs: 10, goalDepth: 3, maxActions: 1800 },
        balance: { label: 'BALANCE', runs: 100, goalDepth: 6, maxActions: 3500 },
        deep: { label: 'DEEP', runs: 500, goalDepth: 9, maxActions: 6000 }
    };

    const profileLabel = (id) => {
        const definitions = typeof AutoPlayer.profileDefinitions === 'function' ? AutoPlayer.profileDefinitions() : [];
        const found = definitions.find(profile => profile.id === id);
        return found ? found.label : id;
    };

    const normalizeProfiles = (profiles) => {
        const available = new Set(
            typeof AutoPlayer.profileDefinitions === 'function'
                ? AutoPlayer.profileDefinitions().map(profile => profile.id)
                : PROFILE_ORDER
        );
        const requested = Array.isArray(profiles) && profiles.length > 0 ? profiles : PROFILE_ORDER;
        return [...new Set(requested.filter(profile => available.has(profile)))];
    };

    const navigationSnapshot = () => {
        if (typeof AutoPlayer.navigationDiagnostics !== 'function') {
            return { stagnantSteps: 0, loopBreaks: 0, recentPositions: [], actionableFrontiers: null };
        }
        try {
            return AutoPlayer.navigationDiagnostics();
        } catch (_) {
            return { stagnantSteps: 0, loopBreaks: 0, recentPositions: [], actionableFrontiers: null };
        }
    };

    const safeDecision = () => {
        const decision = AutoPlayer.lastDecision;
        if (!decision || typeof decision !== 'object') return decision || null;
        try {
            return JSON.parse(JSON.stringify(decision));
        } catch (_) {
            return { type: String(decision.type || 'UNKNOWN') };
        }
    };

    const enrichRun = (run, maxActions) => {
        const nav = navigationSnapshot();
        return {
            ...run,
            loopBreaks: Number(nav.loopBreaks) || 0,
            stagnantSteps: Number(nav.stagnantSteps) || 0,
            actionableFrontiers: Number.isFinite(nav.actionableFrontiers) ? nav.actionableFrontiers : null,
            recentPositions: Array.isArray(nav.recentPositions) ? nav.recentPositions.slice(-8) : [],
            lastDecision: safeDecision(),
            suspiciousLong: !run.success && Number(run.actions) >= Math.floor(maxActions * 0.80)
        };
    };

    const aggregateProfile = (runs) => {
        const base = AutoSimulation.aggregate(runs);
        const stuck = runs.filter(run => run.stuck || run.cause === 'Atascado').length;
        const loops = runs.reduce((sum, run) => sum + (Number(run.loopBreaks) || 0), 0);
        const runsWithLoops = runs.filter(run => (Number(run.loopBreaks) || 0) > 0).length;
        const suspiciousLong = runs.filter(run => run.suspiciousLong).length;
        return { ...base, stuck, loops, runsWithLoops, suspiciousLong };
    };

    const causesFor = (runs) => runs.reduce((acc, run) => {
        const cause = run.cause || 'Desconocida';
        acc[cause] = (acc[cause] || 0) + 1;
        return acc;
    }, {});

    const seedMatrix = (results, profiles) => {
        const bySeed = new Map();
        profiles.forEach(profile => {
            (results[profile] || []).forEach(run => {
                if (!bySeed.has(run.seed)) bySeed.set(run.seed, []);
                bySeed.get(run.seed).push(run);
            });
        });
        return bySeed;
    };

    const analyzeSeeds = (results, profiles) => {
        const matrix = seedMatrix(results, profiles);
        const universallyBad = [];
        const singleProfileFailures = [];
        const stuck = [];
        const loopHeavy = [];
        const longRuns = [];

        matrix.forEach((runs, seed) => {
            const failures = runs.filter(run => !run.success);
            if (runs.length === profiles.length && failures.length === profiles.length) {
                universallyBad.push({ seed, depth: Math.max(...runs.map(run => Number(run.maxDepth) || 0)) });
            }
            if (runs.length === profiles.length && failures.length === 1) {
                singleProfileFailures.push({ seed, profile: failures[0].profile, cause: failures[0].cause });
            }
            runs.forEach(run => {
                if (run.stuck || run.cause === 'Atascado') stuck.push(run);
                if ((Number(run.loopBreaks) || 0) >= 3) loopHeavy.push(run);
                if (run.suspiciousLong) longRuns.push(run);
            });
        });

        const sortTrouble = (a, b) => (a.seed - b.seed) || String(a.profile).localeCompare(String(b.profile));
        stuck.sort(sortTrouble);
        loopHeavy.sort((a, b) => (b.loopBreaks - a.loopBreaks) || sortTrouble(a, b));
        longRuns.sort((a, b) => (b.actions - a.actions) || sortTrouble(a, b));
        universallyBad.sort((a, b) => a.seed - b.seed);
        singleProfileFailures.sort((a, b) => a.seed - b.seed);
        return { universallyBad, singleProfileFailures, stuck, loopHeavy, longRuns };
    };

    const worstRuns = (runs, limit = 8) => [...runs]
        .sort((a, b) => {
            if (a.success !== b.success) return a.success ? 1 : -1;
            if (a.maxDepth !== b.maxDepth) return a.maxDepth - b.maxDepth;
            return b.actions - a.actions;
        })
        .slice(0, limit);

    const fmt = (value, digits = 1) => Number(value || 0).toFixed(digits);
    const pct = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

    const reportFor = (audit) => {
        const lines = [];
        lines.push('ROGUE404 AUDIT');
        lines.push(`Audit version: ${AUDIT_VERSION}`);
        lines.push(`Mode: ${audit.mode.toUpperCase()}`);
        lines.push(`Seeds: ${audit.startSeed}-${audit.startSeed + audit.runs - 1}`);
        lines.push(`Profiles: ${audit.profiles.map(profileLabel).join(', ')}`);
        lines.push(`Goal depth: -${audit.goalDepth}`);
        lines.push(`Runs: ${audit.runs * audit.profiles.length}`);
        lines.push('');
        lines.push('=== RESULTS ===');

        audit.profiles.forEach(profile => {
            const summary = audit.summaries[profile];
            lines.push(`${profileLabel(profile)} (${profile})`);
            lines.push(`  success=${pct(summary.successRate)} depth=${fmt(summary.avgMaxDepth, 2)} actions=${fmt(summary.avgActions)} gold=${fmt(summary.avgScore)} kills=${fmt(summary.avgKills, 2)}`);
            lines.push(`  hp=${fmt(summary.avgHp)} food=${fmt(summary.avgFood)} water=${fmt(summary.avgWater)} stuck=${summary.stuck} loop_breaks=${summary.loops} loop_runs=${summary.runsWithLoops} long_runs=${summary.suspiciousLong}`);
            lines.push(`  causes=${JSON.stringify(causesFor(audit.results[profile]))}`);
        });

        lines.push('');
        lines.push('=== NAVIGATION INCIDENTS ===');
        if (audit.analysis.stuck.length === 0) lines.push('STUCK: none');
        else audit.analysis.stuck.slice(0, 20).forEach(run => lines.push(`STUCK seed=${run.seed} profile=${run.profile} level=${run.finalLevel} depth=${run.maxDepth} actions=${run.actions} loops=${run.loopBreaks} last=${JSON.stringify(run.lastDecision)}`));

        if (audit.analysis.loopHeavy.length === 0) lines.push('HEAVY LOOPS (>=3 breaks): none');
        else audit.analysis.loopHeavy.slice(0, 20).forEach(run => lines.push(`LOOP seed=${run.seed} profile=${run.profile} breaks=${run.loopBreaks} depth=${run.maxDepth} actions=${run.actions} recent=${JSON.stringify(run.recentPositions)}`));

        if (audit.analysis.longRuns.length === 0) lines.push('SUSPICIOUS LONG RUNS: none');
        else audit.analysis.longRuns.slice(0, 20).forEach(run => lines.push(`LONG seed=${run.seed} profile=${run.profile} actions=${run.actions}/${audit.maxActions} depth=${run.maxDepth} cause=${run.cause}`));

        lines.push('');
        lines.push('=== SEED SIGNALS ===');
        if (audit.analysis.universallyBad.length === 0) lines.push('ALL PROFILES FAIL: none');
        else lines.push(`ALL PROFILES FAIL: ${audit.analysis.universallyBad.slice(0, 30).map(entry => `${entry.seed}(max-${entry.depth})`).join(', ')}`);

        if (audit.analysis.singleProfileFailures.length === 0) lines.push('SINGLE PROFILE FAILURES: none');
        else lines.push(`SINGLE PROFILE FAILURES: ${audit.analysis.singleProfileFailures.slice(0, 40).map(entry => `${entry.seed}:${entry.profile}:${entry.cause}`).join(', ')}`);

        lines.push('');
        lines.push('=== WORST RUNS BY PROFILE ===');
        audit.profiles.forEach(profile => {
            lines.push(`${profileLabel(profile)}:`);
            worstRuns(audit.results[profile]).forEach(run => {
                lines.push(`  seed=${run.seed} success=${run.success} depth=${run.maxDepth} actions=${run.actions} cause=${run.cause} loops=${run.loopBreaks}`);
            });
        });

        return lines.join('\n');
    };

    const RogueAudit = {
        version: AUDIT_VERSION,
        presets: PRESETS,
        last: null,
        running: false,

        run: async ({
            mode = 'smoke',
            runs = null,
            startSeed = 1,
            goalDepth = null,
            maxActions = null,
            profiles = PROFILE_ORDER,
            onProgress = null
        } = {}) => {
            if (RogueAudit.running) throw new Error('Ya hay una auditoria Rogue404 en curso.');
            const preset = PRESETS[mode] || PRESETS.smoke;
            const selected = normalizeProfiles(profiles);
            if (selected.length === 0) throw new Error('No hay perfiles validos para auditar.');

            const totalRuns = Math.max(1, Math.floor(Number(runs ?? preset.runs) || preset.runs));
            const firstSeed = Number(startSeed) || 1;
            const depth = Math.max(1, Math.floor(Number(goalDepth ?? preset.goalDepth) || preset.goalDepth));
            const actionLimit = Math.max(10, Math.floor(Number(maxActions ?? preset.maxActions) || preset.maxActions));
            const totalExecutions = totalRuns * selected.length;
            const results = Object.fromEntries(selected.map(profile => [profile, []]));
            const restore = AutoSimulation.fastMode();
            let completed = 0;

            RogueAudit.running = true;
            if (typeof AutoPlayer.stopVisible === 'function') AutoPlayer.stopVisible();

            try {
                for (let index = 0; index < totalRuns; index++) {
                    const seed = firstSeed + index;
                    for (const profile of selected) {
                        const raw = await AutoSimulation.runInternal({ seed, goalDepth: depth, profile, maxActions: actionLimit });
                        results[profile].push(enrichRun(raw, actionLimit));
                        completed++;
                        if (typeof onProgress === 'function') {
                            onProgress({ completed, total: totalExecutions, seed, profile, percent: completed / totalExecutions });
                        }
                    }
                    if ((index + 1) % 5 === 0) await new Promise(resolve => REAL_SET_TIMEOUT(resolve, 0));
                }
            } finally {
                restore();
                RogueAudit.running = false;
            }

            const summaries = Object.fromEntries(selected.map(profile => [profile, aggregateProfile(results[profile])]));
            const audit = {
                version: AUDIT_VERSION,
                mode: PRESETS[mode] ? mode : 'custom',
                runs: totalRuns,
                startSeed: firstSeed,
                goalDepth: depth,
                maxActions: actionLimit,
                profiles: selected,
                summaries,
                results,
                analysis: analyzeSeeds(results, selected)
            };
            audit.report = reportFor(audit);
            RogueAudit.last = audit;
            return audit;
        },

        report: (audit = RogueAudit.last) => audit ? (audit.report || reportFor(audit)) : '',

        copy: async (audit = RogueAudit.last) => {
            const text = RogueAudit.report(audit);
            if (!text) throw new Error('Todavia no hay un informe Rogue404 para copiar.');
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(text);
                return text;
            }
            if (typeof document === 'undefined') return text;
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
            return text;
        }
    };

    const injectLab = () => {
        if (typeof document === 'undefined' || !document.body || !window.location) return;
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('lab') !== '1' || document.getElementById('rogue-audit-lab')) return;

        const style = document.createElement('style');
        style.textContent = `
            #rogue-audit-lab{position:fixed;right:14px;bottom:14px;z-index:200;width:360px;background:#050505;border:2px solid #33ff00;padding:12px;font-family:monospace;color:#ddd;box-shadow:0 0 30px #000}
            #rogue-audit-lab h3{margin:0 0 8px;color:#33ff00;font-size:14px}
            #rogue-audit-lab .lab-buttons{display:flex;gap:6px;flex-wrap:wrap}
            #rogue-audit-lab button{background:#111;color:#fff;border:1px solid #555;padding:6px 8px;cursor:pointer;font-family:monospace}
            #rogue-audit-lab button:hover{border-color:#33ff00;color:#33ff00}
            #rogue-audit-lab button:disabled{opacity:.45;cursor:not-allowed}
            #rogue-audit-progress{width:100%;margin:9px 0 4px}
            #rogue-audit-status{font-size:11px;color:#aaa;min-height:30px}
            #rogue-audit-output{max-height:180px;overflow:auto;white-space:pre-wrap;background:#000;border:1px solid #222;padding:7px;margin:8px 0;font-size:10px}
            #rogue-audit-close{position:absolute;right:6px;top:4px;border:0!important;color:#777!important;padding:2px 5px!important}
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'rogue-audit-lab';
        panel.innerHTML = `
            <button id="rogue-audit-close" title="Cerrar">x</button>
            <h3>ROGUE404 · LABORATORIO AUTOMATA</h3>
            <div class="lab-buttons">
                <button data-mode="smoke">SMOKE · 10</button>
                <button data-mode="balance">BALANCE · 100</button>
                <button data-mode="deep">DEEP · 500</button>
            </div>
            <progress id="rogue-audit-progress" max="1" value="0"></progress>
            <div id="rogue-audit-status">Listo. Las simulaciones no guardan puntuaciones.</div>
            <pre id="rogue-audit-output">Sin informe todavia.</pre>
            <button id="rogue-audit-copy" disabled>COPIAR INFORME</button>
        `;
        document.body.appendChild(panel);

        const buttons = [...panel.querySelectorAll('button[data-mode]')];
        const progress = panel.querySelector('#rogue-audit-progress');
        const status = panel.querySelector('#rogue-audit-status');
        const output = panel.querySelector('#rogue-audit-output');
        const copy = panel.querySelector('#rogue-audit-copy');

        const setBusy = (busy) => buttons.forEach(button => { button.disabled = busy; });
        buttons.forEach(button => button.addEventListener('click', async () => {
            const mode = button.dataset.mode;
            const preset = PRESETS[mode];
            setBusy(true);
            copy.disabled = true;
            progress.value = 0;
            output.textContent = `Ejecutando ${preset.label}...`;
            status.textContent = `0/${preset.runs * PROFILE_ORDER.length} runs`;
            try {
                const audit = await RogueAudit.run({
                    mode,
                    onProgress: info => {
                        progress.value = info.percent;
                        status.textContent = `${info.completed}/${info.total} · seed ${info.seed} · ${profileLabel(info.profile)}`;
                    }
                });
                output.textContent = audit.report;
                progress.value = 1;
                status.textContent = `Completado: ${audit.runs * audit.profiles.length} runs · atascos ${audit.analysis.stuck.length} · loops graves ${audit.analysis.loopHeavy.length}`;
                copy.disabled = false;
            } catch (error) {
                status.textContent = `ERROR: ${error.message}`;
                output.textContent = error.stack || String(error);
            } finally {
                setBusy(false);
            }
        }));

        copy.addEventListener('click', async () => {
            try {
                await RogueAudit.copy();
                status.textContent = 'Informe copiado. Pegalo directamente en ChatGPT.';
            } catch (error) {
                status.textContent = `No se pudo copiar: ${error.message}`;
            }
        });
        panel.querySelector('#rogue-audit-close').addEventListener('click', () => panel.remove());
    };

    window.RogueAudit = RogueAudit;
    window.runRogueAudit = (options = {}) => RogueAudit.run(options);
    window.copyRogueAudit = () => RogueAudit.copy();
    window.rogueAuditReport = () => RogueAudit.report();

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectLab, { once: true });
        else injectLab();
    }
})();
