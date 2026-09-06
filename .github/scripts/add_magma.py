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
"        MAGMA: { enabled: false },",
"""        MAGMA: {
            enabled: true,
            label: 'MAGMA',
            thirstMultiplier: 2,
            colors: { wall: '#42130d', wallVisible: '#9c3520', floor: '#d56832', fog: '#210b08' },
            warningTitle: '⚠ CÁMARA MAGMÁTICA',
            warningText: 'EL CALOR ASFIXIA ESTE NIVEL.<br>• Descansar no recupera vida.<br>• La sed avanza al doble de velocidad.<br>• La malla térmica reduce la presión del calor y permite descansar.'
        },""",
'MAGMA config')

text = replace_once(text,
"""        DOM.container.classList.remove('floor-frozen', 'floor-magma', 'floor-unstable');
        if (FloorSystem.is('FROZEN')) DOM.container.classList.add('floor-frozen');""",
"""        DOM.container.classList.remove('floor-frozen', 'floor-magma', 'floor-unstable');
        if (FloorSystem.is('FROZEN')) DOM.container.classList.add('floor-frozen');
        else if (FloorSystem.is('MAGMA')) DOM.container.classList.add('floor-magma');
        else if (FloorSystem.is('UNSTABLE')) DOM.container.classList.add('floor-unstable');""",
'floor classes')

old = """    restHealing: () => {
        if (!FloorSystem.is('FROZEN')) return 2;
        return Math.max(0, Number(FloorSystem.armorTraits().frozenRestHeal) || 0);
    },
    showWarning: () => {"""
new = """    thirstRate: () => {
        const baseRate = CONFIG.PLAYER.survival.thirstRate;
        if (!FloorSystem.is('MAGMA')) return baseRate;
        const config = CONFIG.FLOORS.MAGMA;
        const resist = Math.max(0, Math.min(1, Number(FloorSystem.armorTraits().thirstResist) || 0));
        const pressure = 1 + (config.thirstMultiplier - 1) * (1 - resist);
        return Math.max(1, Math.round(baseRate / pressure));
    },
    restHealing: () => {
        if (FloorSystem.is('FROZEN')) return Math.max(0, Number(FloorSystem.armorTraits().frozenRestHeal) || 0);
        if (FloorSystem.is('MAGMA')) return Math.max(0, Number(FloorSystem.armorTraits().magmaRestHeal) || 0);
        return 2;
    },
    showWarning: () => {"""
text = replace_once(text, old, new, 'environmental rates')

old = """        DOM.floorWarningTitle.textContent = config.warningTitle;
        DOM.floorWarningText.innerHTML = config.warningText;
        DOM.floorWarning.classList.remove('hidden');"""
new = """        DOM.floorWarningTitle.textContent = config.warningTitle;
        DOM.floorWarningText.innerHTML = config.warningText;
        DOM.floorWarning.classList.remove('floor-warning-frozen', 'floor-warning-magma', 'floor-warning-unstable');
        DOM.floorWarning.classList.add(`floor-warning-${GameState.floor.type.toLowerCase()}`);
        DOM.floorWarning.classList.remove('hidden');"""
text = replace_once(text, old, new, 'warning theme')

old = """    onEnter: () => {
        if (FloorSystem.is('FROZEN')) {
            Utils.log('El aire corta como cristal. El suelo está helado.', '#8adfff');
            FloorSystem.showWarning();
        }
    }"""
new = """    onEnter: () => {
        if (FloorSystem.is('FROZEN')) {
            Utils.log('El aire corta como cristal. El suelo está helado.', '#8adfff');
            FloorSystem.showWarning();
        } else if (FloorSystem.is('MAGMA')) {
            Utils.log('El aire quema los pulmones. La sed será tu mayor enemigo.', '#ff6b35');
            FloorSystem.showWarning();
        }
    }"""
text = replace_once(text, old, new, 'magma entry')

old = """    spawnFloorSpecial: () => {
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
    },"""
new = """    spawnFloorSpecial: () => {
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
text = replace_once(text, old, new, 'floor special gear')

old = """        const s = CONFIG.PLAYER.survival;
        GameState.moves++;
        if (GameState.moves % s.hungerRate === 0) GameState.player.food--;
        if (GameState.moves % s.thirstRate === 0) GameState.player.water--;"""
new = """        const s = CONFIG.PLAYER.survival;
        GameState.moves++;
        if (GameState.moves % s.hungerRate === 0) GameState.player.food--;
        const thirstRate = FloorSystem.thirstRate();
        if (GameState.moves % thirstRate === 0) GameState.player.water--;"""
text = replace_once(text, old, new, 'magma thirst')

old = """                if (healing > 0) {
                    GameState.player.hp = Math.min(GameState.player.hp + healing, GameState.player.maxHp);
                    Utils.log(FloorSystem.is('FROZEN') ? `El equipo polar te permite recuperar ${healing} HP.` : 'Descansas...', FloorSystem.is('FROZEN') ? '#8adfff' : '#ccc');
                } else {
                    Utils.log('El frío es demasiado intenso: descansar no recupera vida.', '#8adfff');
                }"""
new = """                if (healing > 0) {
                    GameState.player.hp = Math.min(GameState.player.hp + healing, GameState.player.maxHp);
                    if (FloorSystem.is('FROZEN')) Utils.log(`El equipo polar te permite recuperar ${healing} HP.`, '#8adfff');
                    else if (FloorSystem.is('MAGMA')) Utils.log(`La malla térmica te permite recuperar ${healing} HP.`, '#ff8a4c');
                    else Utils.log('Descansas...', '#ccc');
                } else if (FloorSystem.is('FROZEN')) {
                    Utils.log('El frío es demasiado intenso: descansar no recupera vida.', '#8adfff');
                } else if (FloorSystem.is('MAGMA')) {
                    Utils.log('El calor es insoportable: descansar no recupera vida.', '#ff6b35');
                }"""
text = replace_once(text, old, new, 'magma rest feedback')

old = """                else if (item.specialId === 'FROZEN_CRAMPONS') { id = 'FROZEN_CRAMPONS'; data = {symbol:']', color:'#8adfff', name:'Arnés polar', stats:'DEF:1 · Hielo/agarre'}; }
                else if (item.type === 'armor')"""
new = """                else if (item.specialId === 'FROZEN_CRAMPONS') { id = 'FROZEN_CRAMPONS'; data = {symbol:']', color:'#8adfff', name:'Arnés polar', stats:'DEF:1 · Hielo/agarre'}; }
                else if (item.specialId === 'MAGMA_THERMAL') { id = 'MAGMA_THERMAL'; data = {symbol:']', color:'#ff6b35', name:'Malla térmica', stats:'DEF:1 · Calor/sed'}; }
                else if (item.type === 'armor')"""
text = replace_once(text, old, new, 'magma legend')

old = """        if (FloorSystem.is('FROZEN')) parts.push('<span style=\"color:#8adfff\">HIELO</span>');
        if (GameState.current === STATE_ENUM.TARGETING"""
new = """        if (FloorSystem.is('FROZEN')) parts.push('<span style=\"color:#8adfff\">HIELO</span>');
        if (FloorSystem.is('MAGMA')) {
            const protectedFromThirst = (Number(FloorSystem.armorTraits().thirstResist) || 0) > 0;
            parts.push(`<span style=\"color:#ff6b35\">MAGMA · SED ${protectedFromThirst ? '↓' : '×2'}</span>`);
        }
        if (GameState.current === STATE_ENUM.TARGETING"""
text = replace_once(text, old, new, 'magma HUD')

path.write_text(text)

# --- style.css ---
path = Path('style.css')
css = path.read_text()
marker = '/* --- MAGMA DEPTHS --- */'
if marker in css:
    raise SystemExit('magma CSS already present')
css += """

/* --- MAGMA DEPTHS --- */
#game-container.floor-magma {
    border-color: #ff6b35;
    box-shadow: 0 0 28px rgba(255, 72, 24, 0.38);
}

#floor-warning.floor-warning-magma {
    background: #110603;
    border-color: #ff6b35;
    box-shadow: 0 0 65px rgba(255, 72, 24, 0.5);
    color: #ffe2d5;
}

#floor-warning.floor-warning-magma .floor-warning-title {
    color: #ff7a3d;
    border-bottom-color: #8a321c;
}

#floor-warning.floor-warning-magma .floor-warning-text {
    color: #ffd8c8;
}

#floor-warning.floor-warning-magma .floor-warning-button {
    border-color: #ff6b35;
    color: #ff8a4c;
}

#floor-warning.floor-warning-magma .floor-warning-hint {
    color: #9a5a45;
}
"""
path.write_text(css)

# --- tests/regression.test.cjs ---
path = Path('tests/regression.test.cjs')
tests = path.read_text()
marker = "test('I/H alternan la ayuda sin duplicar acciones', () => {"
insert = """test('el nivel 6 activa Magma, su aviso y la malla térmica', () => {
    freshGame(1604);
    GameState.level = 6;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();

    assert.equal(GameState.floor.type, 'MAGMA');
    assert.equal(DOM.container.classList.contains('floor-magma'), true);
    assert.equal(GameState.ui.floorWarningOpen, true);
    assert.equal(DOM.floorWarning.classList.contains('floor-warning-magma'), true);
    assert.equal(GameState.entities.items.some(item => item.specialId === 'MAGMA_THERMAL'), true);
    FloorSystem.closeWarning();
});

test('el magma duplica la presión de sed y la malla térmica la reduce', () => {
    freshGame(1605);
    GameState.floor = { type: 'MAGMA' };

    GameState.player.equipment.armor = null;
    assert.equal(FloorSystem.thirstRate(), 3);

    GameState.player.equipment.armor = { value: 1, traits: { thirstResist: 0.6, heatResist: 0.6, magmaRestHeal: 1 } };
    assert.equal(FloorSystem.thirstRate(), 4);
});

test('la sed del magma se aplica durante la supervivencia', () => {
    freshGame(1606);
    GameState.floor = { type: 'MAGMA' };
    GameState.player.equipment.armor = null;
    GameState.player.food = 100;
    GameState.player.water = 10;
    GameState.moves = 2;

    GameLogic.processSurvival();
    assert.equal(GameState.moves, 3);
    assert.equal(GameState.player.water, 9);
});

test('el calor impide curarse al descansar salvo con malla térmica', () => {
    freshGame(1607);
    GameState.floor = { type: 'MAGMA' };
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

        GameState.player.equipment.armor = { value: 1, traits: { thirstResist: 0.6, heatResist: 0.6, magmaRestHeal: 1 } };
        GameLogic.interactAction();
        assert.equal(GameState.player.hp, 51);
    } finally {
        GameLogic.endTurn = originalEndTurn;
    }
});

""" + marker
tests = replace_once(tests, marker, insert, 'magma tests insertion')
path.write_text(tests)

# Trigger marker for the guarded workflow.
