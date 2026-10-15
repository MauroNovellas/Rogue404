const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');

(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rogue404-score-api-'));
    const file = path.join(directory, 'rogue_scores.json');
    let server;
    try {
        await fs.copyFile(path.join(__dirname, '..', 'rogue_api.php'), path.join(directory, 'rogue_api.php'));
        const initial = Array.from({ length: 20 }, (_, i) => ({ name: 'OLD', score: 1000 - i, level: 3, seed: i, date: '01/01/26' }));
        await fs.writeFile(file, JSON.stringify(initial));
        const probe = net.createServer();
        await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
        const port = probe.address().port;
        await new Promise(resolve => probe.close(resolve));
        const grouped = process.platform !== 'win32';
        server = spawn('php', ['-n', '-d', 'display_errors=0', '-S', `127.0.0.1:${port}`, '-t', directory], { detached: grouped, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' } });
        let logs = '', spawnError;
        server.stderr.on('data', data => { logs = (logs + data).slice(-6000); });
        server.on('error', error => { spawnError = error; });
        const base = `http://127.0.0.1:${port}/rogue_api.php`;
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            if (spawnError) throw spawnError;
            try { ready = (await fetch(base)).ok; } catch (_) {}
            if (ready) break;
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        assert.ok(ready, logs);
        const post = async (payload) => {
            const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            return { status: response.status, data: await response.json() };
        };
        assert.equal((await post({ action: 'check-storage' })).data.storage, 'writable');
        assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).length, 20, 'El diagnóstico no añade partidas');
        const entry = { runId: 'run-low-score-test', responseVersion: 2, name: 'mauro', score: 1, level: 1, seed: 777, equipment: 'É'.repeat(270), kills: 'Murciélago '.repeat(20), cause: 'Deshidratación' };
        const saved = await post(entry);
        assert.equal(saved.status, 200); assert.equal(saved.data.saved, true);
        assert.equal(saved.data.rank, 21); assert.equal(saved.data.total, 21);
        assert.equal(saved.data.entry.runId, entry.runId);
        assert.equal(saved.data.entry.equipment, 'É'.repeat(240), 'Caben las cuatro piezas y el truncado sin mbstring no corta caracteres UTF-8');
        assert.equal(saved.data.leaderboard.length, 20);
        assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).length, 21);
        assert.equal((await (await fetch(`${base}?runId=${entry.runId}`)).json()).entry.score, 1);
        assert.equal((await (await fetch(base)).json()).length, 20);
        console.log('✓ una puntuación fuera del Top 20 se confirma, persiste y puede consultarse de nuevo');

        const duplicate = await post(entry);
        assert.equal(duplicate.data.total, 21);
        assert.equal(duplicate.data.entry.runId, saved.data.entry.runId);
        await Promise.all(Array.from({ length: 16 }, (_, i) => post({ ...entry, runId: `run-parallel-${i}`, score: i + 10 })));
        const history = JSON.parse(await fs.readFile(file, 'utf8'));
        assert.equal(history.length, 37);
        assert.equal(new Set(history.filter(score => score.runId).map(score => score.runId)).size, 17);
        for (const old of initial) assert.ok(history.some(score => score.seed === old.seed && score.name === 'OLD'));
        console.log('✓ reintentos idempotentes, guardados simultáneos y resultados históricos conservados');

        assert.equal((await post({})).status, 400);
        assert.equal((await post({ ...entry, runId: '../invalid' })).status, 400);
        assert.equal((await fetch(base, { method: 'DELETE' })).status, 405);
        const legacy = await post({ ...entry, runId: 'run-legacy-format', responseVersion: 1 });
        assert.equal(Array.isArray(legacy.data), true, 'Las pestañas antiguas siguen recibiendo una lista');
        console.log('✓ validación de peticiones y compatibilidad con clientes anteriores');

        const valid = await fs.readFile(file, 'utf8');
        await fs.writeFile(file, '{historial-incompleto');
        assert.equal((await post({ ...entry, runId: 'run-corrupt-test' })).status, 500);
        assert.equal(await fs.readFile(file, 'utf8'), '{historial-incompleto');
        assert.equal((await fetch(base)).status, 500, 'No se oculta un fallo de lectura como ranking vacío');
        await fs.writeFile(file, valid);
        if (process.getuid && process.getuid() !== 0) {
            await fs.chmod(directory, 0o555);
            const denied = await post({ ...entry, runId: 'run-permission-test' });
            assert.equal(denied.status, 500);
            assert.match(denied.data.error, /permisos/);
            assert.equal(await fs.readFile(file, 'utf8'), valid);
            await fs.chmod(directory, 0o755);
        }
        console.log('✓ fallos de lectura/escritura devuelven un error claro sin destruir el historial');
    } finally {
        if (server?.pid) {
            try { process.kill(process.platform === 'win32' ? server.pid : -server.pid, 'SIGTERM'); } catch (_) {}
            await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 1000); } });
        }
        await fs.chmod(directory, 0o755);
        await fs.rm(directory, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
