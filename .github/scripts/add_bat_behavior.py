from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# --- game.js ---
path = Path('game.js')
text = path.read_text()

text = replace_once(
    text,
    """            // Behavior: 'ERRATIC' (Murciélago), 'COWARD' (Goblin), 'REGEN' (Trasgo/Troll)\n            { id: 'BAT',    name: 'Murciélago', symbol: 'M', color: '#a64dff', minLevel: 1, hp: 5,  atk: 2,  xp: 10, speed: 1.0, behavior: 'ERRATIC' },""",
    """            // Cada criatura tendrá una regla reconocible y una pista táctica en la leyenda.\n            { id: 'BAT',    name: 'Murciélago', symbol: 'M', color: '#a64dff', minLevel: 1, hp: 5,  atk: 2,  xp: 10, speed: 1.0, behavior: 'DIVER', diveChance: 0.35, role: 'Acechador de grietas', lore: 'Caza por eco entre las fisuras y se deja caer cuando percibe una abertura.', tactic: 'PICADO: a 2 casillas puede acercarse y atacar en la misma acción. RÁPIDO rompe su ritmo.' },""",
    'bat config and lore'
)

text = replace_once(
    text,
    """            behavior: type.behavior,\n            name: name, symbol: type.symbol,""",
    """            behavior: type.behavior,\n            diveChance: Number(type.diveChance) || 0,\n            name: name, symbol: type.symbol,""",
    'spawn bat dive chance'
)

old = """                if (dist < 10) {\n                    if (e.behavior === 'ERRATIC' && Utils.random() < 0.5) { GameLogic.moveEnemyRandom(e); } \n                    else if (e.behavior === 'COWARD' && e.hp < e.maxHp * 0.3) { GameLogic.moveEnemyAway(e); }\n                    else { GameLogic.moveEnemyTowards(e, GameState.player.x, GameState.player.y); }\n                }"""
new = """                if (dist < 10) {\n                    if (e.behavior === 'DIVER' && dist === 2 && Utils.random() < e.diveChance) {\n                        GameLogic.performBatDive(e);\n                    } else if (e.behavior === 'DIVER' && Utils.random() < 0.45) {\n                        GameLogic.moveEnemyRandom(e);\n                    } else if (e.behavior === 'COWARD' && e.hp < e.maxHp * 0.3) {\n                        GameLogic.moveEnemyAway(e);\n                    } else {\n                        GameLogic.moveEnemyTowards(e, GameState.player.x, GameState.player.y);\n                    }\n                }"""
text = replace_once(text, old, new, 'bat dive AI')

old = """    moveEnemyTowards: (e, targetX, targetY) => {"""
new = """    performBatDive: (e) => {\n        if (!e) return false;\n        const beforeX = e.x;\n        const beforeY = e.y;\n        GameLogic.moveEnemyTowards(e, GameState.player.x, GameState.player.y);\n        if (e.x === beforeX && e.y === beforeY) return false;\n\n        const dist = Math.max(Math.abs(GameState.player.x - e.x), Math.abs(GameState.player.y - e.y));\n        if (dist <= 1) {\n            Utils.log(`${e.name} se descuelga en picado!`, e.color || '#a64dff');\n            VisualFX.floatText(e.x, e.y, '¡PICADO!', e.color || '#a64dff');\n            CombatSystem.enemyAttack(e);\n            return true;\n        }\n        return false;\n    },\n    moveEnemyTowards: (e, targetX, targetY) => {"""
text = replace_once(text, old, new, 'bat dive helper')

old = """            if(def) { id = def.id; data = {symbol:def.symbol, color:def.color, name:def.name, stats:`HP:${def.hp}`}; type = 'monster'; }"""
new = """            if(def) {\n                id = def.id;\n                data = {\n                    symbol: def.symbol,\n                    color: def.color,\n                    name: def.name,\n                    stats: def.role ? `HP:${def.hp} · ${def.role}` : `HP:${def.hp}`,\n                    lore: def.lore || '',\n                    tactic: def.tactic || ''\n                };\n                type = 'monster';\n            }"""
text = replace_once(text, old, new, 'enemy legend data')

old = """        div.innerHTML = `<div class=\"legend-symbol\" style=\"color: ${data.color}\">${data.symbol}</div><div class=\"legend-desc\"><span class=\"legend-name\">${data.name}</span><span class=\"legend-stats\">${data.stats}</span></div>`;"""
new = """        div.innerHTML = `<div class=\"legend-symbol\" style=\"color: ${data.color}\">${data.symbol}</div><div class=\"legend-desc\"><span class=\"legend-name\">${data.name}</span><span class=\"legend-stats\">${data.stats}</span>${data.lore ? `<span class=\"legend-lore\">${data.lore}</span>` : ''}${data.tactic ? `<span class=\"legend-tactic\">${data.tactic}</span>` : ''}</div>`;"""
text = replace_once(text, old, new, 'enemy legend lore rendering')

path.write_text(text)

# --- style.css ---
path = Path('style.css')
text = path.read_text()
old = """.legend-stats { \n    font-size: 0.9rem; \n    color: #aaa; \n}\n"""
new = """.legend-stats { \n    font-size: 0.9rem; \n    color: #aaa; \n}\n.legend-lore {\n    margin-top: 3px;\n    font-size: 0.72rem;\n    line-height: 1.2;\n    color: #777;\n    white-space: normal;\n}\n.legend-tactic {\n    margin-top: 3px;\n    font-size: 0.72rem;\n    line-height: 1.2;\n    color: #c7a6e8;\n    white-space: normal;\n}\n"""
text = replace_once(text, old, new, 'legend lore css')
path.write_text(text)

# --- tests/regression.test.cjs ---
path = Path('tests/regression.test.cjs')
text = path.read_text()
anchor = """test('I/H alternan la ayuda sin duplicar acciones', () => {"""
tests = """test('el Murciélago puede hacer un picado desde dos casillas en una sola acción', () => {\n    freshGame(2101);\n    GameState.floor = { type: 'NORMAL' };\n    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));\n    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };\n    GameState.player.x = 10;\n    GameState.player.y = 10;\n    GameState.player.hp = 100;\n    GameState.player.equipment.armor = null;\n\n    const bat = {\n        x: 12, y: 10, typeId: 'BAT', behavior: 'DIVER', diveChance: 1,\n        name: 'Murciélago', symbol: 'M', color: '#a64dff',\n        hp: 5, maxHp: 5, atk: 4, xp: 10, speed: 1, energy: 0,\n        isSleeping: false, tookDamage: false\n    };\n    GameState.entities.enemies = [bat];\n\n    const originalRandom = Utils.random;\n    Utils.random = () => 0.5;\n    try {\n        assert.equal(GameLogic.performBatDive(bat), true);\n        assert.equal(Math.max(Math.abs(GameState.player.x - bat.x), Math.abs(GameState.player.y - bat.y)), 1);\n        assert.equal(GameState.player.hp, 96);\n    } finally {\n        Utils.random = originalRandom;\n    }\n});\n\ntest('Rápido corta el turno de picado del Murciélago', () => {\n    freshGame(2102);\n    GameState.floor = { type: 'NORMAL' };\n    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));\n    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };\n    GameState.player.x = 10;\n    GameState.player.y = 10;\n    GameState.player.hp = 100;\n    GameState.player.equipment.armor = null;\n\n    const bat = {\n        x: 12, y: 10, typeId: 'BAT', behavior: 'DIVER', diveChance: 1,\n        name: 'Murciélago', symbol: 'M', color: '#a64dff',\n        hp: 5, maxHp: 5, atk: 4, xp: 10, speed: 1, energy: 0,\n        isSleeping: false, tookDamage: false, _rogueQuickStaggerPending: true\n    };\n    GameState.entities.enemies = [bat];\n\n    GameLogic.updateEnemies();\n    assert.equal(GameState.player.hp, 100);\n    assert.equal(bat.x, 12);\n    assert.equal(bat.y, 10);\n});\n\n"""
text = replace_once(text, anchor, tests + anchor, 'bat behavior regressions')
path.write_text(text)
