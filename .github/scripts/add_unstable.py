from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# --- game.js ---
path = Path('game.js')
text = path.read_text()

text = replace_once(text,
"        UNSTABLE: { enabled: false }",
"""        UNSTABLE: {
            enabled: true,
            label: 'INESTABLE',
            fallHpLoss: 0.75,
            collapseAnimationMs: 180,
            colors: { wall: '#302820', wallVisible: '#725d49', floor: '#b08b67', fog: '#241d17' },
            warningTitle: '⚠ ESTRATO INESTABLE',
            warningText: 'EL SUELO RECUERDA TUS PASOS.<br>• Cada casilla que abandonas queda agrietada.<br>• Si vuelves a pisarla, el suelo cede y caes al siguiente nivel.<br>• La caída te deja con solo el 25% de tu vida y dispersa mochila y equipo.<br>• Las escaleras son roca firme. El arnés ligero reduce la caída y conserva lo equipado.'
        }""",
'UNSTABLE config')

text = replace_once(text,
"    persistence: {}, discoveredTypes: new Set(),",
"    persistence: {}, recoveryDrops: {}, recoveryDropSeq: 0, discoveredTypes: new Set(),",
'recovery state')

old = """    restHealing: () => {
        if (FloorSystem.is('FROZEN')) return Math.max(0, Number(FloorSystem.armorTraits().frozenRestHeal) || 0);
        if (FloorSystem.is('MAGMA')) return Math.max(0, Number(FloorSystem.armorTraits().magmaRestHeal) || 0);
        return 2;
    },
    showWarning: () => {"""
new = """    restHealing: () => {
        if (FloorSystem.is('FROZEN')) return Math.max(0, Number(FloorSystem.armorTraits().frozenRestHeal) || 0);
        if (FloorSystem.is('MAGMA')) return Math.max(0, Number(FloorSystem.armorTraits().magmaRestHeal) || 0);
        return 2;
    },
    unstableKey: (kind, x, y) => `${kind}_${x},${y}`,
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
    fallHpLoss: () => {
        if (!FloorSystem.is('UNSTABLE')) return 0;
        const resist = Math.max(0, Math.min(1, Number(FloorSystem.armorTraits().fallDamageResist) || 0));
        return CONFIG.FLOORS.UNSTABLE.fallHpLoss * (1 - resist);
    },
    recoveryPositions: (count) => {
        const positions = [];
        const px = GameState.player.x;
        const py = GameState.player.y;
        for (let radius = 1; radius <= 7 && positions.length < count; radius++) {
            for (let dy = -radius; dy <= radius && positions.length < count; dy++) {
                for (let dx = -radius; dx <= radius && positions.length < count; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const x = px + dx;
                    const y = py + dy;
                    if (MapSystem.isBlocked(x, y)) continue;
                    if (EntityFactory.isOccupied(x, y)) continue;
                    if (x === GameState.stairs.up.x && y === GameState.stairs.up.y) continue;
                    if (x === GameState.stairs.down.x && y === GameState.stairs.down.y) continue;
                    if (positions.some(p => p.x === x && p.y === y)) continue;
                    positions.push({ x, y });
                }
            }
        }
        return positions;
    },
    scatterRecovery: (items) => {
        if (!items.length) return;
        if (!GameState.recoveryDrops[GameState.level]) GameState.recoveryDrops[GameState.level] = [];
        const positions = FloorSystem.recoveryPositions(items.length);
        items.forEach((item, index) => {
            const pos = positions[index] || { x: GameState.player.x, y: GameState.player.y };
            const recoveryDropId = `RECOVERY_${GameState.level}_${++GameState.recoveryDropSeq}`;
            const dropped = { ...item, x: pos.x, y: pos.y, recoveryDropId };
            GameState.recoveryDrops[GameState.level].push({ ...dropped });
            GameState.entities.items.push(dropped);
        });
    },
    restoreRecoveryDrops: () => {
        const drops = GameState.recoveryDrops[GameState.level] || [];
        drops.forEach(drop => {
            if (!GameState.entities.items.some(item => item.recoveryDropId === drop.recoveryDropId)) {
                GameState.entities.items.push({ ...drop });
            }
        });
    },
    removeRecoveryDrop: (id) => {
        if (!id) return;
        const drops = GameState.recoveryDrops[GameState.level];
        if (!drops) return;
        const index = drops.findIndex(drop => drop.recoveryDropId === id);
        if (index !== -1) drops.splice(index, 1);
    },
    fallPlayer: () => {
        const traits = FloorSystem.armorTraits();
        const keepEquipped = Boolean(traits.retainEquippedOnFall);
        const itemsToScatter = [...GameState.player.inventory];
        if (!keepEquipped) {
            if (GameState.player.equipment.weapon) itemsToScatter.push(GameState.player.equipment.weapon);
            if (GameState.player.equipment.armor) itemsToScatter.push(GameState.player.equipment.armor);
            GameState.player.equipment.weapon = null;
            GameState.player.equipment.armor = null;
        }
        GameState.player.inventory = [];

        const hpLoss = FloorSystem.fallHpLoss();
        GameState.player.hp = Math.max(1, Math.ceil(GameState.player.hp * (1 - hpLoss)));

        GameState.level++;
        GameState.entryMethod = 'falling';
        MapSystem.initLevel();
        FloorSystem.scatterRecovery(itemsToScatter);
        Renderer.draw();
        UISystem.updateHUD();

        Utils.log(keepEquipped ? '¡CAÍDA! El arnés salva tu equipo, pero la mochila sale despedida.' : '¡CAÍDA! Tu equipo y mochila quedan dispersos por el nivel.', '#d7a56d');
        VisualFX.floatText(GameState.player.x, GameState.player.y, `-${Math.round(hpLoss * 100)}% HP`, '#ff6b35', 'incoming');
    },
    collapsePlayerTile: async (x, y) => {
        FloorSystem.markHole(x, y);
        Utils.log('¡CRAC! El suelo desaparece bajo tus pies.', '#d7a56d');
        VisualFX.floatText(x, y, '¡CRAC!', '#f0bd7a');
        MapSystem.updateFog();
        Renderer.draw();
        UISystem.updateHUD();
        await new Promise(resolve => window.setTimeout(resolve, CONFIG.FLOORS.UNSTABLE.collapseAnimationMs));
        FloorSystem.fallPlayer();
    },
    showWarning: () => {"""
text = replace_once(text, old, new, 'unstable floor helpers')

old = """        } else if (FloorSystem.is('MAGMA')) {
            Utils.log('El aire quema los pulmones. La sed será tu mayor enemigo.', '#ff6b35');
            FloorSystem.showWarning();
        }
    }"""
new = """        } else if (FloorSystem.is('MAGMA')) {
            Utils.log('El aire quema los pulmones. La sed será tu mayor enemigo.', '#ff6b35');
            FloorSystem.showWarning();
        } else if (FloorSystem.is('UNSTABLE')) {
            Utils.log('La piedra cruje bajo tus botas. No confíes en el camino de vuelta.', '#d7a56d');
            FloorSystem.showWarning();
        }
    }"""
text = replace_once(text, old, new, 'unstable entry')

old = """        MapSystem.generateDungeon(); EntityFactory.spawnAll();
        const stairs = GameState.entryMethod === 'descending' ? GameState.stairs.up : GameState.stairs.down;
        GameState.player.x = stairs.x; GameState.player.y = stairs.y;
        GameState.player.combat = { isDefending: false, waitBonus: 0, cooldowns: { area: 0 }, pendingAttack: null };"""
new = """        MapSystem.generateDungeon(); EntityFactory.spawnAll();
        FloorSystem.restoreRecoveryDrops();
        if (GameState.entryMethod === 'falling') {
            const landing = EntityFactory.getEmptyPos() || GameState.stairs.up;
            GameState.player.x = landing.x; GameState.player.y = landing.y;
        } else {
            const stairs = GameState.entryMethod === 'descending' ? GameState.stairs.up : GameState.stairs.down;
            GameState.player.x = stairs.x; GameState.player.y = stairs.y;
        }
        GameState.player.combat = { isDefending: false, waitBonus: 0, cooldowns: { area: 0 }, pendingAttack: null };"""
text = replace_once(text, old, new, 'fall landing')

text = replace_once(text,
"    isBlocked: (x, y) => { if (x < 0 || x >= CONFIG.GRID.cols || y < 0 || y >= CONFIG.GRID.rows) return true; return GameState.map[y][x] === '#'; },",
"    isBlocked: (x, y) => { if (x < 0 || x >= CONFIG.GRID.cols || y < 0 || y >= CONFIG.GRID.rows) return true; return GameState.map[y][x] === '#' || FloorSystem.isHole(x, y); },",
'hole collision')

old = """    spawnFloorSpecial: () => {
        if (!FloorSystem.is('FROZEN') && !FloorSystem.is('MAGMA')) return;
        const pos = EntityFactory.getEmptyPos();
        if (!pos || MapSystem.isTaken(pos.x, pos.y)) return;

        if (FloorSystem.is('FROZEN')) {
            GameState.entities.items.push({
                x: pos.x,
                y: pos.y,
                type: 'armor',
                specialId: 'FROZEN_CRAMPONS',
                name: 'Arnés polar con crampones',
                value: 1,
                symbol: ']',
                color: '#8adfff',
                qualityColor: '#bdefff',
                traits: { slipResist: 0.75, frozenRestHeal: 1 }
            });
        } else {
            GameState.entities.items.push({
                x: pos.x,
                y: pos.y,
                type: 'armor',
                specialId: 'MAGMA_THERMAL',
                name: 'Malla térmica de salamandra',
                value: 1,
                symbol: ']',
                color: '#ff6b35',
                qualityColor: '#ffb347',
                traits: { heatResist: 0.6, thirstResist: 0.6, magmaRestHeal: 1 }
            });
        }
    },"""
new = """    spawnFloorSpecial: () => {
        if (!FloorSystem.is('FROZEN') && !FloorSystem.is('MAGMA') && !FloorSystem.is('UNSTABLE')) return;
        const pos = EntityFactory.getEmptyPos();
        if (!pos || MapSystem.isTaken(pos.x, pos.y)) return;

        if (FloorSystem.is('FROZEN')) {
            GameState.entities.items.push({
                x: pos.x,
                y: pos.y,
                type: 'armor',
                specialId: 'FROZEN_CRAMPONS',
                name: 'Arnés polar con crampones',
                value: 1,
                symbol: ']',
                color: '#8adfff',
                qualityColor: '#bdefff',
                traits: { slipResist: 0.75, frozenRestHeal: 1 }
            });
        } else if (FloorSystem.is('MAGMA')) {
            GameState.entities.items.push({
                x: pos.x,
                y: pos.y,
                type: 'armor',
                specialId: 'MAGMA_THERMAL',
                name: 'Malla térmica de salamandra',
                value: 1,
                symbol: ']',
                color: '#ff6b35',
                qualityColor: '#ffb347',
                traits: { heatResist: 0.6, thirstResist: 0.6, magmaRestHeal: 1 }
            });
        } else {
            GameState.entities.items.push({
                x: pos.x,
                y: pos.y,
                type: 'armor',
                specialId: 'UNSTABLE_HARNESS',
                name: 'Arnés ligero de espeleólogo',
                value: 1,
                symbol: ']',
                color: '#d7a56d',
                qualityColor: '#f0bd7a',
                traits: { fallDamageResist: 0.5, retainEquippedOnFall: true }
            });
        }
    },"""
text = replace_once(text, old, new, 'unstable gear')

text = replace_once(text,
"            if (GameState.map[y][x] === '.' && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };",
"            if (GameState.map[y][x] === '.' && !MapSystem.isBlocked(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };",
'empty position holes')

text = replace_once(text,
"            if (!MapSystem.isTaken(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };",
"            if (!MapSystem.isBlocked(x, y) && !MapSystem.isTaken(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };",
'room position holes')

text = replace_once(text,
"            if (!EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };",
"            if (!MapSystem.isBlocked(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };",
'chest position holes')

text = replace_once(text,
"        GameState.persistence = {}; GameState.discoveredTypes.clear(); Renderer.resetLegend();",
"        GameState.persistence = {}; GameState.recoveryDrops = {}; GameState.recoveryDropSeq = 0; GameState.discoveredTypes.clear(); Renderer.resetLegend();",
'reset recovery drops')

old = """        GameLogic.enterPlayerTile(nx, ny);

        if (FloorSystem.shouldSlip()) {"""
new = """        const previousX = GameState.player.x;
        const previousY = GameState.player.y;
        const willCollapse = FloorSystem.is('UNSTABLE') && FloorSystem.isCracked(nx, ny) && !FloorSystem.isStableUnstableTile(nx, ny);
        if (FloorSystem.is('UNSTABLE')) FloorSystem.markCracked(previousX, previousY);
        GameLogic.enterPlayerTile(nx, ny);

        if (willCollapse) {
            GameState.ui.movementLocked = true;
            try {
                await FloorSystem.collapsePlayerTile(nx, ny);
            } finally {
                GameState.ui.movementLocked = false;
            }
            return true;
        }

        if (FloorSystem.shouldSlip()) {"""
text = replace_once(text, old, new, 'unstable movement')

old = """        if (!forced && arrIndex >= 0) {
            GameState.entities.items.splice(arrIndex, 1);
            MapSystem.markTaken(x, y);
        }
        UISystem.updateHUD();"""
new = """        if (!forced && arrIndex >= 0) {
            GameState.entities.items.splice(arrIndex, 1);
            MapSystem.markTaken(x, y);
            FloorSystem.removeRecoveryDrop(item.recoveryDropId);
        }
        UISystem.updateHUD();"""
text = replace_once(text, old, new, 'recovery pickup')

old = """                if (!color) {
                    if (char === '#') { char = \"█\"; color = isVis ? `color:${palette.wallVisible}` : `color:${palette.wall}`; }
                    else { char = \".\"; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
                }"""
new = """                if (!color) {
                    if (char === '#') { char = \"█\"; color = isVis ? `color:${palette.wallVisible}` : `color:${palette.wall}`; }
                    else if (FloorSystem.isHole(x, y)) { char = \"░\"; color = isVis ? 'color:#24140d; background:#050302' : 'color:#120b08'; }
                    else if (FloorSystem.isCracked(x, y)) { char = \"╳\"; color = isVis ? 'color:#f0bd7a' : 'color:#5d4532'; }
                    else { char = \".\"; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
                }"""
text = replace_once(text, old, new, 'unstable renderer')

old = """                else if (item.specialId === 'MAGMA_THERMAL') { id = 'MAGMA_THERMAL'; data = {symbol:']', color:'#ff6b35', name:'Malla térmica', stats:'DEF:1 · Calor/sed'}; }
                else if (item.type === 'armor')"""
new = """                else if (item.specialId === 'MAGMA_THERMAL') { id = 'MAGMA_THERMAL'; data = {symbol:']', color:'#ff6b35', name:'Malla térmica', stats:'DEF:1 · Calor/sed'}; }
                else if (item.specialId === 'UNSTABLE_HARNESS') { id = 'UNSTABLE_HARNESS'; data = {symbol:']', color:'#d7a56d', name:'Arnés ligero', stats:'DEF:1 · Caída/equipo'}; }
                else if (item.type === 'armor')"""
text = replace_once(text, old, new, 'unstable legend')

old = """        if (FloorSystem.is('MAGMA')) {
            const protectedFromThirst = (Number(FloorSystem.armorTraits().thirstResist) || 0) > 0;
            parts.push(`<span style=\"color:#ff6b35\">MAGMA · SED ${protectedFromThirst ? '↓' : '×2'}</span>`);
        }
        if (GameState.current === STATE_ENUM.TARGETING"""
new = """        if (FloorSystem.is('MAGMA')) {
            const protectedFromThirst = (Number(FloorSystem.armorTraits().thirstResist) || 0) > 0;
            parts.push(`<span style=\"color:#ff6b35\">MAGMA · SED ${protectedFromThirst ? '↓' : '×2'}</span>`);
        }
        if (FloorSystem.is('UNSTABLE')) parts.push('<span style=\"color:#d7a56d\">INESTABLE · NO RETROCEDAS</span>');
        if (GameState.current === STATE_ENUM.TARGETING"""
text = replace_once(text, old, new, 'unstable HUD')

path.write_text(text)

# --- style.css ---
path = Path('style.css')
css = path.read_text()
marker = '/* --- UNSTABLE DEPTHS --- */'
if marker in css:
    raise SystemExit('unstable CSS already present')
css += """

/* --- UNSTABLE DEPTHS --- */
#game-container.floor-unstable {
    border-color: #b98a58;
    box-shadow: 0 0 28px rgba(185, 138, 88, 0.36);
}

#floor-warning.floor-warning-unstable {
    background: #0d0906;
    border-color: #c69762;
    box-shadow: 0 0 65px rgba(185, 138, 88, 0.46);
    color: #f1dcc6;
}

#floor-warning.floor-warning-unstable .floor-warning-title {
    color: #f0bd7a;
    border-bottom-color: #755438;
}

#floor-warning.floor-warning-unstable .floor-warning-text {
    color: #ead4bd;
}

#floor-warning.floor-warning-unstable .floor-warning-button {
    border-color: #d7a56d;
    color: #f0bd7a;
}

#floor-warning.floor-warning-unstable .floor-warning-hint {
    color: #8b6b4e;
}
"""
path.write_text(css)

# --- tests/regression.test.cjs ---
path = Path('tests/regression.test.cjs')
tests = path.read_text()
marker = "test('I/H alternan la ayuda sin duplicar acciones', () => {"
insert = """test('el nivel 9 activa suelo inestable, aviso y arnés ligero', () => {
    freshGame(1904);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();

    assert.equal(GameState.floor.type, 'UNSTABLE');
    assert.equal(DOM.container.classList.contains('floor-unstable'), true);
    assert.equal(GameState.ui.floorWarningOpen, true);
    assert.equal(DOM.floorWarning.classList.contains('floor-warning-unstable'), true);
    assert.equal(GameState.entities.items.some(item => item.specialId === 'UNSTABLE_HARNESS'), true);
    FloorSystem.closeWarning();
});

test('el suelo se agrieta al abandonarlo y retroceder provoca caída con pérdida de equipo', async () => {
    freshGame(1905);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.seen = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(true));
    GameState.visible = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill(true));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    GameState.player.inventory = [{ type: 'food', name: 'Ración', value: 10, symbol: '%', color: '#ffaa00' }];
    GameState.player.equipment.weapon = { type: 'weapon', name: 'Espada prueba', value: 2, symbol: '!', color: '#ff00ff' };
    GameState.player.equipment.armor = { type: 'armor', name: 'Malla prueba', value: 2, symbol: ']', color: '#4682b4' };

    const originalEndTurn = GameLogic.endTurn;
    const originalTimeout = context.setTimeout;
    GameLogic.endTurn = () => {};
    context.setTimeout = (fn) => { fn(); return 1; };
    context.window.setTimeout = context.setTimeout;
    try {
        await GameLogic.movePlayer(1, 0);
        assert.equal(FloorSystem.isCracked(10, 10), true);
        assert.equal(GameState.level, 9);

        await GameLogic.movePlayer(-1, 0);
        assert.equal(GameState.level, 10);
        assert.equal(GameState.player.hp, 25);
        assert.equal(GameState.player.inventory.length, 0);
        assert.equal(GameState.player.equipment.weapon, null);
        assert.equal(GameState.player.equipment.armor, null);
        assert.equal(GameState.recoveryDrops[10].length, 3);
        assert.equal(GameState.entities.items.filter(item => item.recoveryDropId).length, 3);
        assert.equal(GameState.persistence[9].includes('HOLE_10,10'), true);
    } finally {
        GameLogic.endTurn = originalEndTurn;
        context.setTimeout = originalTimeout;
        context.window.setTimeout = originalTimeout;
    }
});

test('el arnés ligero reduce la caída y conserva el equipo puesto', () => {
    freshGame(1906);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.player.hp = 100;
    const weapon = { type: 'weapon', name: 'Pico', value: 3, symbol: '!', color: '#ff00ff' };
    const harness = { type: 'armor', specialId: 'UNSTABLE_HARNESS', name: 'Arnés ligero', value: 1, symbol: ']', color: '#d7a56d', traits: { fallDamageResist: 0.5, retainEquippedOnFall: true } };
    GameState.player.equipment.weapon = weapon;
    GameState.player.equipment.armor = harness;
    GameState.player.inventory = [{ type: 'water', name: 'Agua', value: 20, symbol: '~', color: '#00ffff' }];

    FloorSystem.fallPlayer();

    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 63);
    assert.equal(GameState.player.equipment.weapon.name, 'Pico');
    assert.equal(GameState.player.equipment.armor.specialId, 'UNSTABLE_HARNESS');
    assert.equal(GameState.player.inventory.length, 0);
    assert.equal(GameState.recoveryDrops[10].length, 1);
});

test('los objetos dispersados por una caída persisten hasta recuperarlos', () => {
    freshGame(1907);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.player.inventory = [{ type: 'food', name: 'Ración perdida', value: 20, symbol: '%', color: '#ffaa00' }];
    GameState.player.equipment.weapon = null;
    GameState.player.equipment.armor = null;
    FloorSystem.fallPlayer();

    const saved = GameState.recoveryDrops[10][0];
    assert.ok(saved);
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    const restored = GameState.entities.items.find(item => item.recoveryDropId === saved.recoveryDropId);
    assert.ok(restored);

    const idx = GameState.entities.items.indexOf(restored);
    InventorySystem.pickup(restored, idx, restored.x, restored.y);
    assert.equal((GameState.recoveryDrops[10] || []).some(item => item.recoveryDropId === saved.recoveryDropId), false);
});

""" + marker
tests = replace_once(tests, marker, insert, 'unstable tests insertion')
path.write_text(tests)
