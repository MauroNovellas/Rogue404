from pathlib import Path
import re

js_path = Path('game.js')
html_path = Path('index.html')
css_path = Path('style.css')
test_path = Path('tests/regression.test.cjs')

text = js_path.read_text()
html = html_path.read_text()
css = css_path.read_text()
tests = test_path.read_text()


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, got {count}')
    return source.replace(old, new, 1)


def sub_once(source, pattern, replacement, label):
    source, count = re.subn(pattern, lambda _m: replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 regex match, got {count}')
    return source


# ---------------------------------------------------------------------------
# CONFIGURACIÓN Y ESTADO DE PISOS
# ---------------------------------------------------------------------------
text = replace_once(
    text,
    """    MAP: {
        maxRooms: 28, minRoomSize: 6, maxRoomSize: 14, viewRadius: 9,
        colors: { wall: '#222', wallVisible: '#444', floor: '#888', fog: '#222' }
    },
    PLAYER:""",
    """    MAP: {
        maxRooms: 28, minRoomSize: 6, maxRoomSize: 14, viewRadius: 9,
        colors: { wall: '#222', wallVisible: '#444', floor: '#888', fog: '#222' }
    },
    FLOORS: {
        cycle: ['FROZEN', 'MAGMA', 'UNSTABLE'],
        FROZEN: {
            enabled: true,
            label: 'HIELO',
            slipChance: 0.35,
            driftChance: 0.25,
            extraStepsMin: 1,
            extraStepsMax: 2,
            colors: { wall: '#25465f', wallVisible: '#6e9fb8', floor: '#bdefff', fog: '#17303f' },
            warningTitle: '⚠ PROFUNDIDAD HELADA',
            warningText: 'EL FRÍO DOMINA ESTE NIVEL.<br>• Descansar no recupera vida.<br>• El hielo puede hacerte resbalar y desviarte.<br>• El equipo polar con crampones reduce ambos peligros.'
        },
        MAGMA: { enabled: false },
        UNSTABLE: { enabled: false }
    },
    PLAYER:""",
    'floor config'
)

text = replace_once(
    text,
    """    entryMethod: 'start', deathCause: \"Desconocido\",
    map: [], seen: [], visible: [], rooms: [],""",
    """    entryMethod: 'start', deathCause: \"Desconocido\",
    floor: { type: 'NORMAL' },
    map: [], seen: [], visible: [], rooms: [],""",
    'floor state'
)

text = replace_once(
    text,
    """        currentActions: [],
        shopStock: [],
    }""",
    """        currentActions: [],
        shopStock: [],
        floorWarningOpen: false,
    }""",
    'floor warning ui state'
)

text = replace_once(
    text,
    """    log: document.getElementById('log'),
    combatStatus: document.getElementById('combat-status'),
    menus:""",
    """    log: document.getElementById('log'),
    combatStatus: document.getElementById('combat-status'),
    floorWarning: document.getElementById('floor-warning'),
    floorWarningTitle: document.getElementById('floor-warning-title'),
    floorWarningText: document.getElementById('floor-warning-text'),
    menus:""",
    'floor warning DOM'
)

# ---------------------------------------------------------------------------
# FLOOR SYSTEM
# ---------------------------------------------------------------------------
text = replace_once(
    text,
    """};

// ============================================================================
// 4. NETWORK (API PHP)""",
    """};

const FloorSystem = {
    typeForLevel: (level) => {
        if (level < 3 || level % 3 !== 0) return 'NORMAL';
        const cycle = CONFIG.FLOORS.cycle;
        const slot = (Math.floor(level / 3) - 1) % cycle.length;
        const type = cycle[slot];
        const config = CONFIG.FLOORS[type];
        return config && config.enabled ? type : 'NORMAL';
    },
    config: () => CONFIG.FLOORS[GameState.floor.type] || null,
    is: (type) => GameState.floor.type === type,
    prepareLevel: () => {
        GameState.floor = { type: FloorSystem.typeForLevel(GameState.level) };
        DOM.container.classList.remove('floor-frozen', 'floor-magma', 'floor-unstable');
        if (FloorSystem.is('FROZEN')) DOM.container.classList.add('floor-frozen');
    },
    getPalette: () => {
        const config = FloorSystem.config();
        return config && config.colors ? config.colors : CONFIG.MAP.colors;
    },
    armorTraits: () => {
        const armor = GameState.player.equipment.armor;
        return armor && armor.traits ? armor.traits : {};
    },
    slipChance: () => {
        if (!FloorSystem.is('FROZEN')) return 0;
        const config = CONFIG.FLOORS.FROZEN;
        const resist = Math.max(0, Math.min(1, Number(FloorSystem.armorTraits().slipResist) || 0));
        return config.slipChance * (1 - resist);
    },
    shouldSlip: () => FloorSystem.is('FROZEN') && Utils.random() < FloorSystem.slipChance(),
    resolveSlipDirection: (dx, dy) => {
        if (!FloorSystem.is('FROZEN') || Utils.random() >= CONFIG.FLOORS.FROZEN.driftChance) return [dx, dy];
        const dirs = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
        const index = dirs.findIndex(([x, y]) => x === dx && y === dy);
        if (index === -1) return [dx, dy];
        const shift = Utils.random() < 0.5 ? -1 : 1;
        return dirs[(index + shift + dirs.length) % dirs.length];
    },
    extraSlipSteps: () => {
        const config = CONFIG.FLOORS.FROZEN;
        const span = config.extraStepsMax - config.extraStepsMin + 1;
        return config.extraStepsMin + Math.floor(Utils.random() * span);
    },
    canSlideTo: (x, y) => {
        if (MapSystem.isBlocked(x, y)) return false;
        if (GameState.entities.enemies.some(e => e.x === x && e.y === y)) return false;
        if (GameState.entities.shops.some(s => s.x === x && s.y === y)) return false;
        if (GameState.entities.chests.some(c => c.x === x && c.y === y)) return false;
        return true;
    },
    restHealing: () => {
        if (!FloorSystem.is('FROZEN')) return 2;
        return Math.max(0, Number(FloorSystem.armorTraits().frozenRestHeal) || 0);
    },
    showWarning: () => {
        const config = FloorSystem.config();
        if (!config || !config.warningTitle || !DOM.floorWarning) return;
        DOM.floorWarningTitle.textContent = config.warningTitle;
        DOM.floorWarningText.innerHTML = config.warningText;
        DOM.floorWarning.classList.remove('hidden');
        GameState.ui.floorWarningOpen = true;
    },
    closeWarning: () => {
        if (DOM.floorWarning) DOM.floorWarning.classList.add('hidden');
        GameState.ui.floorWarningOpen = false;
        if (GameState.current === STATE_ENUM.PLAYING) DOM.container.focus();
    },
    onEnter: () => {
        if (FloorSystem.is('FROZEN')) {
            Utils.log('El aire corta como cristal. El suelo está helado.', '#8adfff');
            FloorSystem.showWarning();
        }
    }
};

// ============================================================================
// 4. NETWORK (API PHP)""",
    'FloorSystem insertion'
)

# ---------------------------------------------------------------------------
# INICIALIZACIÓN DEL PISO Y EQUIPO ESPECIAL
# ---------------------------------------------------------------------------
text = replace_once(
    text,
    """        GameState.map = []; GameState.seen = []; GameState.visible = []; GameState.rooms = [];
        GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
        if (!GameState.persistence[GameState.level]) GameState.persistence[GameState.level] = [];""",
    """        GameState.map = []; GameState.seen = []; GameState.visible = []; GameState.rooms = [];
        GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
        FloorSystem.prepareLevel();
        if (!GameState.persistence[GameState.level]) GameState.persistence[GameState.level] = [];""",
    'prepare floor during initLevel'
)

text = replace_once(
    text,
    """        MapSystem.updateFog(); Renderer.draw(); UISystem.updateHUD();
        Utils.log(`Profundidad -${GameState.level}`, \"#fff\");
    },""",
    """        MapSystem.updateFog(); Renderer.draw(); UISystem.updateHUD();
        Utils.log(`Profundidad -${GameState.level}`, \"#fff\");
        FloorSystem.onEnter();
    },""",
    'floor enter warning'
)

text = replace_once(
    text,
    """        spawns.forEach(spawn => {
            if (Utils.random() >= spawn.chance) return;
            for (let k = 0; k < spawn.count; k++) {
                const pos = EntityFactory.getEmptyPos();
                if (!pos || MapSystem.isTaken(pos.x, pos.y)) continue;
                if (spawn.type === 'GOLD') EntityFactory.createItem(pos, 'GOLD', 10);
                else if (spawn.type === 'FOOD') EntityFactory.createSmartItem(pos, 'food', CONFIG.ENTITIES.items.foodRestore, 'Comida', '%', '#ffaa00');
                else if (spawn.type === 'WATER') EntityFactory.createSmartItem(pos, 'water', CONFIG.ENTITIES.items.drinkRestore, 'Agua', '~', '#00ffff');
                else if (spawn.type === 'WEAPON') EntityFactory.createSmartItem(pos, 'weapon', CONFIG.COMBAT.baseWeaponVal, 'Arma', '!', '#ff00ff');
                else if (spawn.type === 'ARMOR') EntityFactory.createSmartItem(pos, 'armor', CONFIG.COMBAT.baseArmorVal, 'Malla', ']', '#4682b4');
            }
        });

        if (CONFIG.ENTITIES.shops.levels.includes(GameState.level)) {""",
    """        spawns.forEach(spawn => {
            if (Utils.random() >= spawn.chance) return;
            for (let k = 0; k < spawn.count; k++) {
                const pos = EntityFactory.getEmptyPos();
                if (!pos || MapSystem.isTaken(pos.x, pos.y)) continue;
                if (spawn.type === 'GOLD') EntityFactory.createItem(pos, 'GOLD', 10);
                else if (spawn.type === 'FOOD') EntityFactory.createSmartItem(pos, 'food', CONFIG.ENTITIES.items.foodRestore, 'Comida', '%', '#ffaa00');
                else if (spawn.type === 'WATER') EntityFactory.createSmartItem(pos, 'water', CONFIG.ENTITIES.items.drinkRestore, 'Agua', '~', '#00ffff');
                else if (spawn.type === 'WEAPON') EntityFactory.createSmartItem(pos, 'weapon', CONFIG.COMBAT.baseWeaponVal, 'Arma', '!', '#ff00ff');
                else if (spawn.type === 'ARMOR') EntityFactory.createSmartItem(pos, 'armor', CONFIG.COMBAT.baseArmorVal, 'Malla', ']', '#4682b4');
            }
        });

        EntityFactory.spawnFloorSpecial();

        if (CONFIG.ENTITIES.shops.levels.includes(GameState.level)) {""",
    'spawn floor special call'
)

text = replace_once(
    text,
    """    spawnEnemy: () => {
        let pos = EntityFactory.getEmptyPos(); if (!pos) return;""",
    """    spawnFloorSpecial: () => {
        if (!FloorSystem.is('FROZEN')) return;
        const pos = EntityFactory.getEmptyPos();
        if (!pos || MapSystem.isTaken(pos.x, pos.y)) return;
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
    },
    spawnEnemy: () => {
        let pos = EntityFactory.getEmptyPos(); if (!pos) return;""",
    'spawn frozen gear'
)

# ---------------------------------------------------------------------------
# RESET, MOVIMIENTO Y DESCANSO
# ---------------------------------------------------------------------------
text = replace_once(
    text,
    """        GameState.ui.currentActions = [];
        GameState.ui.shopStock = [];
        Network.isSaving = false;""",
    """        GameState.ui.currentActions = [];
        GameState.ui.shopStock = [];
        GameState.ui.floorWarningOpen = false;
        FloorSystem.closeWarning();
        Network.isSaving = false;""",
    'reset floor warning'
)

text = sub_once(
    text,
    r"    movePlayer: \(dx, dy\) => \{.*?\n    \},\n    updateEnemies:",
    """    movePlayer: (dx, dy) => {
        const nx = GameState.player.x + dx;
        const ny = GameState.player.y + dy;

        if (MapSystem.isBlocked(nx, ny)) return false;
        if (GameState.entities.shops.some(s => s.x === nx && s.y === ny)) { ShopSystem.open(); return false; }

        const chest = GameState.entities.chests.find(c => c.x === nx && c.y === ny);
        if (chest) {
            if (!chest.isOpen) Utils.log('Cofre cerrado. Presiona ESPACIO.', CONFIG.ENTITIES.chests.colors.closed);
            else Utils.log('Cofre vacío.', '#777');
            return false;
        }

        const enemy = GameState.entities.enemies.find(e => e.x === nx && e.y === ny);
        if (enemy) {
            CombatSystem.bumpAttack(enemy);
            GameLogic.endTurn(true);
            return false;
        }

        GameLogic.enterPlayerTile(nx, ny);

        if (FloorSystem.shouldSlip()) {
            const [slideDx, slideDy] = FloorSystem.resolveSlipDirection(dx, dy);
            const extraSteps = FloorSystem.extraSlipSteps();
            let movedExtra = 0;

            for (let step = 0; step < extraSteps; step++) {
                const sx = GameState.player.x + slideDx;
                const sy = GameState.player.y + slideDy;
                if (!FloorSystem.canSlideTo(sx, sy)) break;
                GameLogic.enterPlayerTile(sx, sy);
                movedExtra++;
            }

            if (movedExtra > 0) {
                const deviated = slideDx !== dx || slideDy !== dy;
                Utils.log(deviated ? '¡El hielo te hace resbalar y te desvía!' : '¡Resbalas sobre el hielo!', '#8adfff');
                VisualFX.floatText(GameState.player.x, GameState.player.y, deviated ? '¡DESVÍO!' : '¡RESBALA!', '#8adfff');
            } else {
                Utils.log('Pierdes pie, pero algo detiene el resbalón.', '#8adfff');
            }
        }

        GameLogic.endTurn(true);
        return true;
    },
    enterPlayerTile: (x, y) => {
        GameState.player.x = x;
        GameState.player.y = y;
        GameState.player.combat.waitBonus = 0;
        GameState.player.combat.isDefending = false;
        GameLogic.collectItemsAt(x, y);
    },
    collectItemsAt: (x, y) => {
        for (let i = GameState.entities.items.length - 1; i >= 0; i--) {
            const item = GameState.entities.items[i];
            if (item.x !== x || item.y !== y) continue;

            if (item.type === 'GOLD') {
                GameState.score += item.value;
                VisualFX.floatText(x, y, `+$${item.value}`, '#ffd700');
                Utils.log('¡Oro!', '#ffd700');
                GameState.entities.items.splice(i, 1);
                MapSystem.markTaken(x, y);
            } else {
                InventorySystem.pickup(item, i, x, y);
            }
        }
    },
    updateEnemies:""",
    'frozen movement'
)

text = replace_once(
    text,
    """        else {
            if (GameState.player.food > 0 && GameState.player.water > 0) { GameState.player.hp = Math.min(GameState.player.hp + 2, GameState.player.maxHp); Utils.log(\"Descansas...\"); GameLogic.endTurn(true); }
            else { Utils.log(\"¡Demasiada hambre para descansar!\", \"#f00\"); }
        }""",
    """        else {
            if (GameState.player.food > 0 && GameState.player.water > 0) {
                const healing = FloorSystem.restHealing();
                if (healing > 0) {
                    GameState.player.hp = Math.min(GameState.player.hp + healing, GameState.player.maxHp);
                    Utils.log(FloorSystem.is('FROZEN') ? `El equipo polar te permite recuperar ${healing} HP.` : 'Descansas...', FloorSystem.is('FROZEN') ? '#8adfff' : '#ccc');
                } else {
                    Utils.log('El frío es demasiado intenso: descansar no recupera vida.', '#8adfff');
                }
                GameLogic.endTurn(true);
            } else {
                Utils.log('¡Demasiada hambre para descansar!', '#f00');
            }
        }""",
    'frozen rest healing'
)

# ---------------------------------------------------------------------------
# RENDER/HUD/LEYENDA
# ---------------------------------------------------------------------------
text = replace_once(
    text,
    """    draw: () => {
        let html = \"\";""",
    """    draw: () => {
        let html = \"\";
        const palette = FloorSystem.getPalette();""",
    'renderer floor palette'
)

text = replace_once(
    text,
    """                    if (char === '#') { char = \"█\"; color = isVis ? `color:${CONFIG.MAP.colors.wallVisible}` : `color:${CONFIG.MAP.colors.wall}`; }
                    else { char = \".\"; color = isVis ? `color:${CONFIG.MAP.colors.floor}` : `color:${CONFIG.MAP.colors.fog}`; }""",
    """                    if (char === '#') { char = \"█\"; color = isVis ? `color:${palette.wallVisible}` : `color:${palette.wall}`; }
                    else { char = \".\"; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }""",
    'renderer palette usage'
)

text = replace_once(
    text,
    """                else if (item.type === 'armor') { id = 'ARMOR_DROP'; data = {symbol:']', color:'#4682b4', name:'Malla', stats:'Defensa'}; }""",
    """                else if (item.specialId === 'FROZEN_CRAMPONS') { id = 'FROZEN_CRAMPONS'; data = {symbol:']', color:'#8adfff', name:'Arnés polar', stats:'DEF:1 · Hielo/agarre'}; }
                else if (item.type === 'armor') { id = 'ARMOR_DROP'; data = {symbol:']', color:'#4682b4', name:'Malla', stats:'Defensa'}; }""",
    'frozen gear legend'
)

text = replace_once(
    text,
    """        const parts = [];
        if (GameState.current === STATE_ENUM.TARGETING && GameState.player.combat.pendingAttack) {""",
    """        const parts = [];
        if (FloorSystem.is('FROZEN')) parts.push('<span style=\"color:#8adfff\">HIELO</span>');
        if (GameState.current === STATE_ENUM.TARGETING && GameState.player.combat.pendingAttack) {""",
    'frozen HUD badge'
)

# ---------------------------------------------------------------------------
# INPUT Y API GLOBAL DEL AVISO
# ---------------------------------------------------------------------------
text = replace_once(
    text,
    """    const key = e.key.toLowerCase();

    if (e.target && e.target.tagName === 'INPUT') {""",
    """    const key = e.key.toLowerCase();

    if (GameState.ui.floorWarningOpen) {
        e.preventDefault();
        if (['enter', ' ', 'escape'].includes(key)) FloorSystem.closeWarning();
        return;
    }

    if (e.target && e.target.tagName === 'INPUT') {""",
    'floor warning input guard'
)

text = replace_once(
    text,
    """window.closeShop = () => StateController.change(STATE_ENUM.PLAYING);
window.harakiri""",
    """window.closeShop = () => StateController.change(STATE_ENUM.PLAYING);
window.closeFloorWarning = () => FloorSystem.closeWarning();
window.harakiri""",
    'close floor warning global'
)

# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
html = replace_once(
    html,
    """    </div>

    <div id=\"controls-menu\" class=\"hidden\">""",
    """    </div>

    <div id=\"floor-warning\" class=\"hidden\">
        <div id=\"floor-warning-title\" class=\"floor-warning-title\">⚠ NIVEL ESPECIAL</div>
        <div id=\"floor-warning-text\" class=\"floor-warning-text\"></div>
        <button onclick=\"closeFloorWarning()\" class=\"floor-warning-button\">ENTENDIDO</button>
        <div class=\"floor-warning-hint\">ENTER / ESPACIO / ESC</div>
    </div>

    <div id=\"controls-menu\" class=\"hidden\">""",
    'floor warning modal html'
)

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------
css += """

/* --- FROZEN DEPTHS / PISOS ESPECIALES --- */
#game-container.floor-frozen {
    border-color: #6ecff6;
    box-shadow: 0 0 24px rgba(110, 207, 246, 0.32);
}

#floor-warning {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 95;
    width: 520px;
    padding: 28px 32px;
    box-sizing: border-box;
    background: #050b10;
    border: 4px double #8adfff;
    box-shadow: 0 0 60px rgba(138, 223, 255, 0.45);
    color: #dff7ff;
    text-align: center;
}

#floor-warning.hidden { display: none !important; }

.floor-warning-title {
    color: #8adfff;
    font-size: 1.5rem;
    font-weight: bold;
    letter-spacing: 0.08em;
    padding-bottom: 12px;
    margin-bottom: 16px;
    border-bottom: 1px dashed #47798d;
}

.floor-warning-text {
    color: #d5edf5;
    text-align: left;
    line-height: 1.7;
    margin-bottom: 20px;
}

.floor-warning-button {
    border-color: #8adfff;
    color: #8adfff;
    font-weight: bold;
    min-width: 180px;
}

.floor-warning-hint {
    margin-top: 12px;
    color: #658491;
    font-size: 0.75rem;
}
"""

# ---------------------------------------------------------------------------
# TESTS DE REGRESIÓN
# ---------------------------------------------------------------------------
tests = replace_once(
    tests,
    """{ CONFIG, STATE_ENUM, GameState, DOM, Utils, VisualFX, Network, MapSystem, EntityFactory, GameLogic, CombatSystem, InventorySystem, UISystem, StateController }""",
    """{ CONFIG, STATE_ENUM, GameState, DOM, Utils, VisualFX, FloorSystem, Network, MapSystem, EntityFactory, GameLogic, CombatSystem, InventorySystem, UISystem, StateController }""",
    'export FloorSystem to tests'
)

tests = replace_once(
    tests,
    """    Utils,
    Network,
    MapSystem,""",
    """    Utils,
    FloorSystem,
    Network,
    MapSystem,""",
    'destructure FloorSystem in tests'
)

insert_before = """test('I/H alternan la ayuda sin duplicar acciones', () => {"""
frozen_tests = r"""test('el nivel 3 activa Frozen Depths, el aviso y el equipo polar', () => {
    freshGame(1304);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();

    assert.equal(GameState.floor.type, 'FROZEN');
    assert.equal(DOM.container.classList.contains('floor-frozen'), true);
    assert.equal(GameState.ui.floorWarningOpen, true);
    assert.equal(GameState.entities.items.some(item => item.specialId === 'FROZEN_CRAMPONS'), true);
    FloorSystem.closeWarning();
});

test('el frío impide curarse al descansar salvo con equipo polar', () => {
    freshGame(1305);
    GameState.floor = { type: 'FROZEN' };
    GameState.entities.chests = [];
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.food = 100;
    GameState.player.water = 100;
    GameState.player.hp = 50;

    const originalEndTurn = GameLogic.endTurn;
    GameLogic.endTurn = () => {};
    try {
        GameState.player.equipment.armor = null;
        GameLogic.interactAction();
        assert.equal(GameState.player.hp, 50);

        GameState.player.equipment.armor = { value: 1, traits: { slipResist: 0.75, frozenRestHeal: 1 } };
        GameLogic.interactAction();
        assert.equal(GameState.player.hp, 51);
    } finally {
        GameLogic.endTurn = originalEndTurn;
    }
});

test('un resbalón mueve varias casillas pero consume una sola acción', () => {
    freshGame(1306);
    GameState.floor = { type: 'FROZEN' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.stairs.up = { x: 60, y: 20 };
    GameState.stairs.down = { x: 61, y: 20 };
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.equipment.armor = null;

    const originalRandom = Utils.random;
    const originalEndTurn = GameLogic.endTurn;
    let turns = 0;
    const rolls = [0, 0.5, 0];
    Utils.random = () => rolls.length ? rolls.shift() : 0.5;
    GameLogic.endTurn = () => { turns++; };
    try {
        GameLogic.movePlayer(1, 0);
        assert.equal(GameState.player.x, 12);
        assert.equal(GameState.player.y, 10);
        assert.equal(turns, 1);
    } finally {
        Utils.random = originalRandom;
        GameLogic.endTurn = originalEndTurn;
    }
});

test('los crampones reducen un 75% la probabilidad de resbalón', () => {
    freshGame(1307);
    GameState.floor = { type: 'FROZEN' };
    const originalRandom = Utils.random;
    Utils.random = () => 0.2;
    try {
        GameState.player.equipment.armor = null;
        assert.equal(FloorSystem.shouldSlip(), true);
        GameState.player.equipment.armor = { traits: { slipResist: 0.75 } };
        assert.equal(FloorSystem.shouldSlip(), false);
    } finally {
        Utils.random = originalRandom;
    }
});

"""
if insert_before not in tests:
    raise SystemExit('frozen tests insertion point not found')
tests = tests.replace(insert_before, frozen_tests + insert_before, 1)

# Guardas finales.
required = [
    "const FloorSystem = {",
    "FROZEN_CRAMPONS",
    "floorWarningOpen",
    "floor-frozen",
    "El frío es demasiado intenso",
]
for marker in required:
    if marker not in text and marker not in html and marker not in css:
        raise SystemExit(f'missing Frozen Depths marker: {marker}')

js_path.write_text(text)
html_path.write_text(html)
css_path.write_text(css)
test_path.write_text(tests)
