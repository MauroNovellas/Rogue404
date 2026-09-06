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
    "            { id: 'TROLL',  name: 'Trasgo',     symbol: 'T', color: '#0088ff', minLevel: 5, hp: 40, atk: 12, xp: 60, speed: 1.0, behavior: 'REGEN' }",
    "            { id: 'TROLL',  name: 'Trasgo',     symbol: 'T', color: '#0088ff', minLevel: 5, hp: 40, atk: 12, xp: 60, speed: 1.0, behavior: 'WARDEN', territoryRadius: 5, pressureRange: 2, smashMult: 1.5, homeRegen: 2, role: 'Guardián territorial', lore: 'Marca una cámara como suya y prefiere hacerte retroceder antes que perseguirte por toda la mazmorra.', tactic: 'TERRITORIO: no te persigue fuera de su guarida. PRESIÓN: a ≤2 casillas RUGE; si sigues junto a él al siguiente turno, APLASTA con +50% fuerza. RETÍRATE o DEFIENDE.' }",
    'troll config and lore'
)

text = replace_once(
    text,
    """            stolenGold: 0,\n            name: name, symbol: type.symbol,""",
    """            stolenGold: 0,\n            territoryRadius: Number(type.territoryRadius) || 0,\n            pressureRange: Number(type.pressureRange) || 0,\n            smashMult: Number(type.smashMult) || 1,\n            homeRegen: Number(type.homeRegen) || 0,\n            homeX: pos.x, homeY: pos.y,\n            _trollPressurePrimed: false,\n            name: name, symbol: type.symbol,""",
    'spawn troll fields'
)

text = replace_once(
    text,
    """                // Antes de buscar al jugador, el Goblin se desvía por oro cercano.\n                if (e.behavior === 'THIEF' && GameLogic.moveGoblinTowardGold(e)) continue;\n                \n                if (dist <= 1) {""",
    """                // Antes de buscar al jugador, el Goblin se desvía por oro cercano.\n                if (e.behavior === 'THIEF' && GameLogic.moveGoblinTowardGold(e)) continue;\n\n                // El Trasgo no usa la persecución genérica: defiende su guarida,\n                // telegráfica APLASTAR y vuelve a casa si sales de su territorio.\n                if (e.behavior === 'WARDEN') {\n                    GameLogic.handleTrollAction(e);\n                    continue;\n                }\n\n                if (dist <= 1) {""",
    'warden action hook'
)

text = replace_once(
    text,
    "            if (e.behavior === 'REGEN' && !e.tookDamage && e.hp < e.maxHp) { e.hp += 1; }\n",
    "",
    'remove generic troll regen'
)

text = replace_once(
    text,
    """    findNearestGroundGold: (e, range = 6) => {""",
    """    trollDistanceFromHome: (e, x = e.x, y = e.y) => {\n        if (!e) return Infinity;\n        return Math.max(Math.abs((e.homeX ?? e.x) - x), Math.abs((e.homeY ?? e.y) - y));\n    },\n    playerInTrollTerritory: (e) => {\n        if (!e || e.behavior !== 'WARDEN') return false;\n        const radius = Math.max(1, Number(e.territoryRadius) || 5);\n        return GameLogic.trollDistanceFromHome(e, GameState.player.x, GameState.player.y) <= radius;\n    },\n    moveTrollWithinTerritory: (e, targetX, targetY) => {\n        if (!e || e.behavior !== 'WARDEN') return false;\n        let bestMove = null;\n        let minD = Infinity;\n        const radius = Math.max(1, Number(e.territoryRadius) || 5);\n        const moves = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];\n        moves.sort(() => Utils.random() - 0.5);\n        for (const [dx, dy] of moves) {\n            const tx = e.x + dx;\n            const ty = e.y + dy;\n            if (GameLogic.trollDistanceFromHome(e, tx, ty) > radius) continue;\n            if (!GameLogic.isValidEnemyMove(tx, ty)) continue;\n            const d = Math.max(Math.abs(targetX - tx), Math.abs(targetY - ty));\n            if (d < minD) { minD = d; bestMove = { x: tx, y: ty }; }\n        }\n        if (!bestMove) return false;\n        e.x = bestMove.x;\n        e.y = bestMove.y;\n        return true;\n    },\n    regenerateTrollAtHome: (e) => {\n        if (!e || e.behavior !== 'WARDEN' || e.x !== e.homeX || e.y !== e.homeY || e.hp >= e.maxHp) return 0;\n        const before = e.hp;\n        e.hp = Math.min(e.maxHp, e.hp + Math.max(1, Number(e.homeRegen) || 2));\n        const healed = e.hp - before;\n        if (healed > 0) VisualFX.floatText(e.x, e.y, `+${healed}`, '#55bbff');\n        return healed;\n    },\n    performTrollSmash: (e) => {\n        if (!e || e.behavior !== 'WARDEN') return false;\n        const dist = Math.max(Math.abs(GameState.player.x - e.x), Math.abs(GameState.player.y - e.y));\n        if (dist > 1) return false;\n\n        const originalAtk = e.atk;\n        const mult = Math.max(1, Number(e.smashMult) || 1.5);\n        e.atk = Math.max(1, Math.round(originalAtk * mult));\n        e._trollPressurePrimed = false;\n        Utils.log(`${e.name} descarga todo su peso: ¡APLASTAR!`, '#ff8c00');\n        VisualFX.floatText(e.x, e.y, '¡APLASTAR!', '#ff8c00');\n        try {\n            CombatSystem.enemyAttack(e);\n        } finally {\n            e.atk = originalAtk;\n        }\n        return true;\n    },\n    handleTrollAction: (e) => {\n        if (!e || e.behavior !== 'WARDEN') return false;\n\n        if (!GameLogic.playerInTrollTerritory(e)) {\n            e._trollPressurePrimed = false;\n            if (e.x !== e.homeX || e.y !== e.homeY) {\n                GameLogic.moveTrollWithinTerritory(e, e.homeX, e.homeY);\n            }\n            GameLogic.regenerateTrollAtHome(e);\n            return true;\n        }\n\n        const dist = Math.max(Math.abs(GameState.player.x - e.x), Math.abs(GameState.player.y - e.y));\n        const pressureRange = Math.max(1, Number(e.pressureRange) || 2);\n\n        if (dist > pressureRange) {\n            e._trollPressurePrimed = false;\n        } else if (e._trollPressurePrimed && dist <= 1) {\n            return GameLogic.performTrollSmash(e);\n        } else if (!e._trollPressurePrimed) {\n            e._trollPressurePrimed = true;\n            Utils.log(`${e.name} golpea el suelo y RUGE. Si sigues cerca, va a aplastarte.`, '#ff8c00');\n            VisualFX.floatText(e.x, e.y, '¡RUGE!', '#ff8c00');\n        }\n\n        if (dist <= 1) CombatSystem.enemyAttack(e);\n        else GameLogic.moveTrollWithinTerritory(e, GameState.player.x, GameState.player.y);\n        return true;\n    },\n    findNearestGroundGold: (e, range = 6) => {""",
    'troll helpers'
)

text = replace_once(
    text,
    """                    if (enemy) { char = enemy.isSleeping ? \"z\" : enemy.symbol; color = `color:${enemy.isSleeping ? '#888' : enemy.color}; font-weight:bold`; } """,
    """                    if (enemy) {\n                        char = enemy.isSleeping ? \"z\" : enemy.symbol;\n                        const enemyColor = enemy.isSleeping ? '#888' : (enemy._trollPressurePrimed ? '#ff8c00' : enemy.color);\n                        color = `color:${enemyColor}; font-weight:bold`;\n                    }""",
    'primed troll renderer'
)

text = replace_once(
    text,
    """        if (FloorSystem.is('UNSTABLE')) parts.push('<span style=\"color:#d7a56d\">INESTABLE · NO RETROCEDAS</span>');\n        if (GameState.current === STATE_ENUM.TARGETING && GameState.player.combat.pendingAttack) {""",
    """        if (FloorSystem.is('UNSTABLE')) parts.push('<span style=\"color:#d7a56d\">INESTABLE · NO RETROCEDAS</span>');\n        const primedTroll = GameState.entities.enemies.find(e =>\n            e.behavior === 'WARDEN' &&\n            e._trollPressurePrimed &&\n            GameState.visible[e.y] && GameState.visible[e.y][e.x]\n        );\n        if (primedTroll) parts.push('<span style=\"color:#ff8c00\">RUGIDO · APLASTAR INMINENTE</span>');\n        if (GameState.current === STATE_ENUM.TARGETING && GameState.player.combat.pendingAttack) {""",
    'troll pressure HUD'
)

path.write_text(text)


# --- tests/regression.test.cjs ---
path = Path('tests/regression.test.cjs')
text = path.read_text()
anchor = "test('I/H alternan la ayuda sin duplicar acciones', () => {"
tests = r"""test('el Trasgo es un guardián territorial con APLASTAR anunciado', () => {
    const troll = CONFIG.ENTITIES.enemies.find(enemy => enemy.id === 'TROLL');
    assert.ok(troll);
    assert.equal(troll.behavior, 'WARDEN');
    assert.equal(troll.territoryRadius, 5);
    assert.equal(troll.pressureRange, 2);
    assert.equal(troll.smashMult, 1.5);
    assert.equal(troll.role, 'Guardián territorial');
});

test('el Trasgo ruge al entrar en presión y no aplasta sin aviso previo', () => {
    freshGame(2301);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 12;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    const troll = {
        x: 10, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: false,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 40, maxHp: 40
    };
    GameState.entities.enemies = [troll];

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        GameLogic.handleTrollAction(troll);
        assert.equal(troll._trollPressurePrimed, true);
        assert.equal(GameState.player.hp, 100);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el Trasgo APLASTA con +50% si sigues adyacente tras el rugido', () => {
    freshGame(2302);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 11;
    GameState.player.y = 10;
    GameState.player.hp = 100;
    GameState.player.equipment.armor = null;
    const troll = {
        x: 10, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: true,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 40, maxHp: 40, energy: 0
    };
    GameState.entities.enemies = [troll];

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        assert.equal(GameLogic.handleTrollAction(troll), true);
        assert.equal(GameState.player.hp, 85);
        assert.equal(troll._trollPressurePrimed, false);
        assert.equal(troll.atk, 10);
    } finally {
        Utils.random = originalRandom;
    }
});

test('salir del territorio rompe la presión y hace volver al Trasgo a casa', () => {
    freshGame(2303);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 20;
    GameState.player.y = 10;
    const troll = {
        x: 15, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: true,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 30, maxHp: 40
    };
    GameState.entities.enemies = [troll];

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        GameLogic.handleTrollAction(troll);
        assert.equal(troll._trollPressurePrimed, false);
        assert.ok(troll.x < 15);
        assert.equal(GameState.player.hp, 100);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el Trasgo se regenera únicamente al recuperar su guarida', () => {
    freshGame(2304);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
    GameState.player.x = 20;
    GameState.player.y = 20;
    const troll = {
        x: 10, y: 10, homeX: 10, homeY: 10, behavior: 'WARDEN', territoryRadius: 5,
        pressureRange: 2, smashMult: 1.5, homeRegen: 2, _trollPressurePrimed: false,
        name: 'Trasgo', color: '#0088ff', atk: 10, hp: 30, maxHp: 40
    };
    GameState.entities.enemies = [troll];

    GameLogic.handleTrollAction(troll);
    assert.equal(troll.hp, 32);
});

"""
text = replace_once(text, anchor, tests + anchor, 'troll regression tests')
path.write_text(text)
