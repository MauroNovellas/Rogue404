from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


# index.html: load autoplayer after dev tooling.
index_path = Path('index.html')
index = index_path.read_text()
index = replace_once(
    index,
    '    <script src="/404/game.js"></script>\n    <script src="/404/dev-tools.js"></script>\n',
    '    <script src="/404/game.js"></script>\n    <script src="/404/dev-tools.js"></script>\n    <script src="/404/autoplayer.js"></script>\n',
    'index autoplayer script',
)
index_path.write_text(index)

# CI: syntax-check the new module.
ci_path = Path('.github/workflows/ci.yml')
ci = ci_path.read_text()
ci = replace_once(
    ci,
    '          node --check game.js\n          node --check dev-tools.js\n',
    '          node --check game.js\n          node --check dev-tools.js\n          node --check autoplayer.js\n',
    'ci autoplayer syntax',
)
ci_path.write_text(ci)

# Regression harness: load AutoPlayer in the same VM as game.js.
test_path = Path('tests/regression.test.cjs')
test = test_path.read_text()
test = replace_once(
    test,
    "const sourcePath = path.join(__dirname, '..', 'game.js');\nconst source = fs.readFileSync(sourcePath, 'utf8');\n",
    "const sourcePath = path.join(__dirname, '..', 'game.js');\nconst source = fs.readFileSync(sourcePath, 'utf8');\nconst autoSourcePath = path.join(__dirname, '..', 'autoplayer.js');\nconst autoSource = fs.readFileSync(autoSourcePath, 'utf8');\n",
    'regression autoplayer source',
)
test = replace_once(
    test,
    "    `${source}\\n;globalThis.__ROGUE__ = { CONFIG, STATE_ENUM, GameState, DOM, Utils, VisualFX, FloorSystem, Network, MapSystem, EntityFactory, GameLogic, CombatSystem, InventorySystem, ShopSystem, UISystem, StateController };`,\n",
    "    `${source}\\n${autoSource}\\n;globalThis.__ROGUE__ = { CONFIG, STATE_ENUM, GameState, DOM, Utils, VisualFX, FloorSystem, Network, MapSystem, EntityFactory, GameLogic, CombatSystem, InventorySystem, ShopSystem, UISystem, StateController, AutoPlayer: window.AutoPlayer, AutoSimulation: window.AutoSimulation };`,\n",
    'regression vm exports',
)
test = replace_once(
    test,
    "    UISystem,\n    StateController\n} = context.__ROGUE__;\n",
    "    UISystem,\n    StateController,\n    AutoPlayer,\n    AutoSimulation\n} = context.__ROGUE__;\n",
    'regression destructure autoplayer',
)

new_tests = r'''

test('AutoPlayer consume agua antes de seguir explorando cuando la sed es baja', async () => {
    freshGame(3001);
    GameState.floor = { type: 'NORMAL' };
    GameState.player.water = 20;
    GameState.player.inventory = [{ type: 'water', name: 'Cantimplora prueba', value: 30, symbol: '~', color: '#00ffff' }];
    const originalEndTurn = GameLogic.endTurn;
    GameLogic.endTurn = () => {};
    try {
        AutoPlayer.reset({ goalDepth: 3 });
        const decision = await AutoPlayer.step();
        assert.equal(decision.type, 'USE');
        assert.equal(decision.reason, 'sed');
        assert.equal(GameState.player.water, 50);
        assert.equal(GameState.player.inventory.length, 0);
    } finally {
        GameLogic.endTurn = originalEndTurn;
    }
});

test('AutoPlayer no calcula rutas hacia casillas que todavía no ha visto', () => {
    freshGame(3002);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.seen = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(false));
    GameState.visible = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(false));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 1;
    GameState.player.y = 1;
    GameState.seen[1][1] = true;
    GameState.seen[1][2] = true;
    GameState.seen[1][3] = true;
    AutoPlayer.reset({ goalDepth: 3 });

    assert.deepEqual(AutoPlayer.findPathToTargets([{ x: 3, y: 1 }]).map(pos => [pos.x, pos.y]), [[2, 1], [3, 1]]);
    assert.equal(AutoPlayer.findPathToTargets([{ x: 4, y: 1 }]), null);
});

test('AutoPlayer valora el equipo ambiental aunque tenga menos defensa base', () => {
    freshGame(3003);
    GameState.floor = { type: 'FROZEN' };
    const normal = { type: 'armor', name: 'Malla pesada', value: 5 };
    const polar = { type: 'armor', name: 'Arnés polar', value: 1, traits: { slipResist: 0.75, frozenRestHeal: 1 } };
    assert.ok(AutoPlayer.itemGearScore(polar) > AutoPlayer.itemGearScore(normal));
});

test('AutoSimulation agrega tasas y causas sin perder el detalle de las runs', () => {
    const summary = AutoSimulation.aggregate([
        { success: true, maxDepth: 9, actions: 100, score: 500, kills: 5, hp: 40, food: 50, water: 60, cause: 'Regreso a superficie' },
        { success: false, maxDepth: 6, actions: 80, score: 200, kills: 2, hp: 0, food: 20, water: 0, cause: 'Sed' }
    ]);
    assert.equal(summary.runs, 2);
    assert.equal(summary.successes, 1);
    assert.equal(summary.successRate, 0.5);
    assert.equal(summary.avgMaxDepth, 7.5);
    assert.equal(summary.causes['Sed'], 1);
});

test('AutoSimulation puede completar una expedición objetivo de profundidad 1 sin renderizado', async () => {
    const result = await AutoSimulation.runOne({ seed: 3004, goalDepth: 1, maxActions: 5 });
    assert.equal(result.success, true);
    assert.equal(result.maxDepth, 1);
    assert.equal(result.cause, 'Regreso a superficie');
});
'''

test = replace_once(
    test,
    '\n(async () => {\n',
    new_tests + '\n(async () => {\n',
    'regression autoplayer tests',
)
test_path.write_text(test)
