from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


game_path = Path('game.js')
test_path = Path('tests/regression.test.cjs')
game = game_path.read_text()
tests = test_path.read_text()

game = replace_once(
    game,
    "warningText: 'EL SUELO RECUERDA TUS PASOS.<br>• Cada casilla que abandonas queda agrietada.<br>• Si vuelves a pisarla, el suelo cede y caes al siguiente nivel.<br>• Los Pasajes de Falla son caminos sin retorno: esconden botín superior, pero tus propias grietas cierran la salida.<br>• La caída te deja con solo el 25% de tu vida y dispersa mochila y equipo.<br>• Las escaleras son roca firme. El arnés ligero reduce la caída y conserva lo equipado.'",
    "warningText: 'EL SUELO RECUERDA TUS PASOS.<br>• Cada casilla que abandonas queda agrietada.<br>• En zonas abiertas, volver a pisar una grieta provoca la caída.<br>• Los pasillos de una sola casilla permiten una segunda pasada: ╬ indica suelo crítico y una nueva entrada lo hará ceder.<br>• Los Pasajes de Falla usan esta misma regla y permiten una retirada antes de volverse letales.<br>• La caída te deja con solo el 25% de tu vida y dispersa mochila y equipo.<br>• Las escaleras son roca firme. El arnés ligero reduce la caída y conserva lo equipado.'",
    'unstable warning'
)

old_helpers = """    unstableKey: (kind, x, y) => `${kind}_${x},${y}`,
    isCracked: (x, y) => FloorSystem.is('UNSTABLE') && MapSystem.isTaken(FloorSystem.unstableKey('CRACK', x, y)),
    isHole: (x, y) => FloorSystem.is('UNSTABLE') && MapSystem.isTaken(FloorSystem.unstableKey('HOLE', x, y)),
    isStableUnstableTile: (x, y) => {
        return (x === GameState.stairs.up.x && y === GameState.stairs.up.y) ||
               (x === GameState.stairs.down.x && y === GameState.stairs.down.y);
    },
    markCracked: (x, y) => {
        if (!FloorSystem.is('UNSTABLE') || FloorSystem.isStableUnstableTile(x, y) || FloorSystem.isHole(x, y)) return;
        MapSystem.markTaken(FloorSystem.unstableKey('CRACK', x, y));
    },
    markHole: (x, y) => {
        if (!FloorSystem.is('UNSTABLE') || FloorSystem.isStableUnstableTile(x, y)) return;
        MapSystem.markTaken(FloorSystem.unstableKey('HOLE', x, y));
    },
"""
new_helpers = """    unstableKey: (kind, x, y) => `${kind}_${x},${y}`,
    isCracked: (x, y) => FloorSystem.is('UNSTABLE') && MapSystem.isTaken(FloorSystem.unstableKey('CRACK', x, y)),
    isCriticalCrack: (x, y) => FloorSystem.is('UNSTABLE') && MapSystem.isTaken(FloorSystem.unstableKey('CRITICAL', x, y)),
    hasNarrowGrace: (x, y) => FloorSystem.is('UNSTABLE') && MapSystem.isTaken(FloorSystem.unstableKey('NARROW', x, y)),
    isHole: (x, y) => FloorSystem.is('UNSTABLE') && MapSystem.isTaken(FloorSystem.unstableKey('HOLE', x, y)),
    isStableUnstableTile: (x, y) => {
        return (x === GameState.stairs.up.x && y === GameState.stairs.up.y) ||
               (x === GameState.stairs.down.x && y === GameState.stairs.down.y);
    },
    // Una casilla es estrecha cuando no forma parte de ningún bloque transitable 2x2.
    // Esto cubre corredores rectos, esquinas, puertas y pequeños cuellos de botella.
    isNarrowUnstableTile: (x, y) => {
        if (!FloorSystem.is('UNSTABLE')) return false;
        if (x < 0 || x >= CONFIG.GRID.cols || y < 0 || y >= CONFIG.GRID.rows) return false;
        if (!GameState.map[y] || GameState.map[y][x] === '#') return false;
        const open = (tx, ty) =>
            tx >= 0 && tx < CONFIG.GRID.cols && ty >= 0 && ty < CONFIG.GRID.rows &&
            GameState.map[ty] && GameState.map[ty][tx] !== '#';
        const origins = [[-1,-1], [0,-1], [-1,0], [0,0]];
        const belongsToOpen2x2 = origins.some(([ox, oy]) =>
            open(x + ox, y + oy) &&
            open(x + ox + 1, y + oy) &&
            open(x + ox, y + oy + 1) &&
            open(x + ox + 1, y + oy + 1)
        );
        return !belongsToOpen2x2;
    },
    usesNarrowDurability: (x, y) => FloorSystem.isNarrowUnstableTile(x, y) || FloorSystem.hasNarrowGrace(x, y),
    markCracked: (x, y, nextX = null, nextY = null) => {
        if (!FloorSystem.is('UNSTABLE') || FloorSystem.isStableUnstableTile(x, y) || FloorSystem.isHole(x, y)) return;
        const alreadyCracked = FloorSystem.isCracked(x, y);
        const entersNarrow = nextX !== null && nextY !== null && FloorSystem.isNarrowUnstableTile(nextX, nextY);
        const narrowDurability = FloorSystem.isNarrowUnstableTile(x, y) || entersNarrow || FloorSystem.hasNarrowGrace(x, y);

        // El umbral de una sala también recibe la gracia del corredor. Sin esto,
        // el jugador podría recorrer el túnel entero y caer justo al regresar a la sala.
        if (narrowDurability) MapSystem.markTaken(FloorSystem.unstableKey('NARROW', x, y));
        if (alreadyCracked && narrowDurability) MapSystem.markTaken(FloorSystem.unstableKey('CRITICAL', x, y));
        MapSystem.markTaken(FloorSystem.unstableKey('CRACK', x, y));
    },
    shouldCollapseOnEntry: (x, y) => {
        if (!FloorSystem.is('UNSTABLE') || FloorSystem.isStableUnstableTile(x, y) || !FloorSystem.isCracked(x, y)) return false;
        if (!FloorSystem.usesNarrowDurability(x, y)) return true;
        return FloorSystem.isCriticalCrack(x, y);
    },
    markHole: (x, y) => {
        if (!FloorSystem.is('UNSTABLE') || FloorSystem.isStableUnstableTile(x, y)) return;
        MapSystem.markTaken(FloorSystem.unstableKey('HOLE', x, y));
    },
"""
game = replace_once(game, old_helpers, new_helpers, 'unstable helpers')

game = replace_once(
    game,
    "const willCollapse = FloorSystem.is('UNSTABLE') && FloorSystem.isCracked(nx, ny) && !FloorSystem.isStableUnstableTile(nx, ny);\n        if (FloorSystem.is('UNSTABLE')) FloorSystem.markCracked(previousX, previousY);",
    "const willCollapse = FloorSystem.shouldCollapseOnEntry(nx, ny);\n        if (FloorSystem.is('UNSTABLE')) FloorSystem.markCracked(previousX, previousY, nx, ny);",
    'movement collapse rule'
)

game = replace_once(
    game,
    "else if (FloorSystem.isHole(x, y)) { char = \"░\"; color = isVis ? 'color:#24140d; background:#050302' : 'color:#120b08'; }\n                    else if (FloorSystem.isCracked(x, y)) { char = \"╳\"; color = isVis ? 'color:#f0bd7a' : 'color:#5d4532'; }",
    "else if (FloorSystem.isHole(x, y)) { char = \"░\"; color = isVis ? 'color:#24140d; background:#050302' : 'color:#120b08'; }\n                    else if (FloorSystem.isCriticalCrack(x, y)) { char = \"╬\"; color = isVis ? 'color:#ff8a4c' : 'color:#70422d'; }\n                    else if (FloorSystem.isCracked(x, y)) { char = \"╳\"; color = isVis ? 'color:#f0bd7a' : 'color:#5d4532'; }",
    'critical crack rendering'
)

game = replace_once(
    game,
    "Utils.log('Entras en un Pasaje de Falla. El botín está al fondo; tus pasos cerrarán el camino de vuelta.', '#ffd27a');\n            VisualFX.floatText(x, y, '¡SIN RETORNO!', '#ffd27a');",
    "Utils.log('Entras en un Pasaje de Falla. El corredor soporta una retirada; una tercera pasada será fatal.', '#ffd27a');\n            VisualFX.floatText(x, y, '¡2 PASADAS!', '#ffd27a');",
    'rift entry feedback'
)

game = replace_once(
    game,
    "Utils.log('El cofre de falla se abre. El premio merece el riesgo; ahora queda decidir cómo salir.', rift.chestColor);",
    "Utils.log('El cofre de falla se abre. El pasaje aguantará la retirada, pero quedará al límite.', rift.chestColor);",
    'rift chest feedback'
)

game = replace_once(
    game,
    "id = 'UNSTABLE_RIFT_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.UNSTABLE.rift.chestColor, name:'Cofre de falla', stats:'Botín excepcional · sin retorno'};",
    "id = 'UNSTABLE_RIFT_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.UNSTABLE.rift.chestColor, name:'Cofre de falla', stats:'Botín excepcional · ruta frágil'};",
    'rift legend'
)

game = replace_once(
    game,
    "parts.push(`<span style=\"color:#d7a56d\">${inRift ? 'INESTABLE · PASAJE SIN RETORNO' : 'INESTABLE · NO RETROCEDAS'}</span>`);",
    "parts.push(`<span style=\"color:#d7a56d\">${inRift ? 'INESTABLE · PASAJE FRÁGIL · 2 PASADAS' : 'INESTABLE · NO RETROCEDAS'}</span>`);",
    'rift HUD'
)

anchor = """test('la resistencia a caída se calcula antes de soltar una armadura no retenida', () => {
"""
new_test = r"""test('un pasillo de una casilla permite ida y vuelta y colapsa al intentar una tercera pasada', async () => {
    freshGame(19051);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('#'));
    GameState.seen = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(true));
    GameState.visible = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(true));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };

    for (let y = 9; y <= 11; y++) {
        for (let x = 8; x <= 10; x++) GameState.map[y][x] = '.';
        for (let x = 15; x <= 17; x++) GameState.map[y][x] = '.';
    }
    for (let x = 11; x <= 14; x++) GameState.map[10][x] = '.';

    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    GameState.player.inventory = [];
    GameState.player.equipment = { weapon: null, armor: null };

    assert.equal(FloorSystem.isNarrowUnstableTile(10, 10), false);
    assert.equal(FloorSystem.isNarrowUnstableTile(11, 10), true);

    const originalEndTurn = GameLogic.endTurn;
    const originalTimeout = context.setTimeout;
    GameLogic.endTurn = () => {};
    context.setTimeout = (fn) => { fn(); return 1; };
    context.window.setTimeout = context.setTimeout;
    try {
        for (let i = 0; i < 5; i++) await GameLogic.movePlayer(1, 0);
        for (let i = 0; i < 5; i++) await GameLogic.movePlayer(-1, 0);

        assert.equal(GameState.level, 9);
        assert.deepEqual([GameState.player.x, GameState.player.y], [10, 10]);
        assert.equal(FloorSystem.hasNarrowGrace(10, 10), true);
        assert.equal(FloorSystem.isCriticalCrack(11, 10), true);
        assert.equal(FloorSystem.isHole(11, 10), false);

        await GameLogic.movePlayer(1, 0);
        assert.equal(GameState.level, 10);
        assert.equal(GameState.player.hp, 25);
        assert.equal(GameState.persistence[9].includes('HOLE_11,10'), true);
    } finally {
        GameLogic.endTurn = originalEndTurn;
        context.setTimeout = originalTimeout;
        context.window.setTimeout = originalTimeout;
    }
});

""" + anchor
tests = replace_once(tests, anchor, new_test, 'insert narrow corridor test')

old_rift = r"""test('retroceder por el Pasaje de Falla pisa tu propia grieta y provoca la caída', async () => {
    freshGame(2602);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.entities.enemies = [];
    GameState.player.hp = 100;
    GameState.player.inventory = [];
    GameState.player.equipment = { weapon: null, armor: null };

    const zone = GameState.floor.riskZone;
    assert.ok(zone && zone.tiles.length >= 3);
    GameState.player.x = zone.anchor.x;
    GameState.player.y = zone.anchor.y;

    await GameLogic.movePlayer(zone.dx, zone.dy);
    assert.deepEqual([GameState.player.x, GameState.player.player?.y], [zone.tiles[0].x, zone.tiles[0].y]);
    await GameLogic.movePlayer(zone.dx, zone.dy);
    assert.equal(FloorSystem.isCracked(zone.tiles[0].x, zone.tiles[0].y), true);

    await GameLogic.movePlayer(-zone.dx, -zone.dy);
    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 25);
});
"""
# The source does not contain the optional-chain typo above; use the exact current block.
old_rift = r"""test('retroceder por el Pasaje de Falla pisa tu propia grieta y provoca la caída', async () => {
    freshGame(2602);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.entities.enemies = [];
    GameState.player.hp = 100;
    GameState.player.inventory = [];
    GameState.player.equipment = { weapon: null, armor: null };

    const zone = GameState.floor.riskZone;
    assert.ok(zone && zone.tiles.length >= 3);
    GameState.player.x = zone.anchor.x;
    GameState.player.y = zone.anchor.y;

    await GameLogic.movePlayer(zone.dx, zone.dy);
    assert.deepEqual([GameState.player.x, GameState.player.y], [zone.tiles[0].x, zone.tiles[0].y]);
    await GameLogic.movePlayer(zone.dx, zone.dy);
    assert.equal(FloorSystem.isCracked(zone.tiles[0].x, zone.tiles[0].y), true);

    await GameLogic.movePlayer(-zone.dx, -zone.dy);
    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 25);
});
"""
new_rift = r"""test('el Pasaje de Falla permite una retirada completa y cae al intentar entrar por tercera vez', async () => {
    freshGame(2602);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.entities.enemies = [];
    GameState.player.hp = 100;
    GameState.player.inventory = [];
    GameState.player.equipment = { weapon: null, armor: null };

    const zone = GameState.floor.riskZone;
    assert.ok(zone && zone.tiles.length >= 3);
    GameState.player.x = zone.anchor.x;
    GameState.player.y = zone.anchor.y;

    for (let i = 0; i < zone.tiles.length - 1; i++) await GameLogic.movePlayer(zone.dx, zone.dy);
    for (let i = 0; i < zone.tiles.length - 1; i++) await GameLogic.movePlayer(-zone.dx, -zone.dy);

    assert.equal(GameState.level, 9);
    assert.deepEqual([GameState.player.x, GameState.player.y], [zone.anchor.x, zone.anchor.y]);
    assert.equal(FloorSystem.isCriticalCrack(zone.tiles[0].x, zone.tiles[0].y), true);

    await GameLogic.movePlayer(zone.dx, zone.dy);
    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 25);
});
"""
tests = replace_once(tests, old_rift, new_rift, 'rift return test')

old_harness = r"""test('el arnés convierte el retorno del Pasaje de Falla en una caída mucho menos destructiva', async () => {
    freshGame(2604);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.entities.enemies = [];
    GameState.player.hp = 100;
    GameState.player.inventory = [{ type: 'food', name: 'Ración de prueba', value: 10, symbol: '%', color: '#ffaa00' }];
    GameState.player.equipment.weapon = { type: 'weapon', name: 'Hoja de prueba', value: 2, symbol: '!', color: '#fff' };
    GameState.player.equipment.armor = {
        type: 'armor', specialId: 'UNSTABLE_HARNESS', name: 'Arnés ligero de espeleólogo', value: 1,
        symbol: ']', color: '#d7a56d', traits: { fallDamageResist: 0.5, retainEquippedOnFall: true }
    };

    const zone = GameState.floor.riskZone;
    GameState.player.x = zone.anchor.x;
    GameState.player.y = zone.anchor.y;
    await GameLogic.movePlayer(zone.dx, zone.dy);
    await GameLogic.movePlayer(zone.dx, zone.dy);
    await GameLogic.movePlayer(-zone.dx, -zone.dy);

    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 63);
    assert.equal(GameState.player.equipment.weapon.name, 'Hoja de prueba');
    assert.equal(GameState.player.equipment.armor.specialId, 'UNSTABLE_HARNESS');
    assert.equal(GameState.player.inventory.length, 0);
    assert.ok((GameState.recoveryDrops[10] || []).some(item => item.name === 'Ración de prueba'));
});
"""
new_harness = r"""test('el arnés protege si fuerzas una tercera entrada al Pasaje de Falla', async () => {
    freshGame(2604);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.entities.enemies = [];
    GameState.player.hp = 100;
    GameState.player.inventory = [{ type: 'food', name: 'Ración de prueba', value: 10, symbol: '%', color: '#ffaa00' }];
    GameState.player.equipment.weapon = { type: 'weapon', name: 'Hoja de prueba', value: 2, symbol: '!', color: '#fff' };
    GameState.player.equipment.armor = {
        type: 'armor', specialId: 'UNSTABLE_HARNESS', name: 'Arnés ligero de espeleólogo', value: 1,
        symbol: ']', color: '#d7a56d', traits: { fallDamageResist: 0.5, retainEquippedOnFall: true }
    };

    const zone = GameState.floor.riskZone;
    GameState.player.x = zone.anchor.x;
    GameState.player.y = zone.anchor.y;
    for (let i = 0; i < zone.tiles.length - 1; i++) await GameLogic.movePlayer(zone.dx, zone.dy);
    for (let i = 0; i < zone.tiles.length - 1; i++) await GameLogic.movePlayer(-zone.dx, -zone.dy);
    assert.equal(GameState.level, 9);

    await GameLogic.movePlayer(zone.dx, zone.dy);

    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 63);
    assert.equal(GameState.player.equipment.weapon.name, 'Hoja de prueba');
    assert.equal(GameState.player.equipment.armor.specialId, 'UNSTABLE_HARNESS');
    assert.equal(GameState.player.inventory.length, 0);
    assert.ok((GameState.recoveryDrops[10] || []).some(item => item.name === 'Ración de prueba'));
});
"""
tests = replace_once(tests, old_harness, new_harness, 'rift harness test')

game_path.write_text(game)
test_path.write_text(tests)
print('Narrow Unstable corridor migration applied.')
