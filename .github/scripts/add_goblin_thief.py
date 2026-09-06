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
    "            { id: 'GOBLIN', name: 'Goblin',     symbol: 'G', color: '#00ff00', minLevel: 3, hp: 15, atk: 5,  xp: 25, speed: 1.0, behavior: 'COWARD' },",
    "            { id: 'GOBLIN', name: 'Goblin',     symbol: 'G', color: '#00ff00', minLevel: 3, hp: 15, atk: 5,  xp: 25, speed: 1.0, behavior: 'THIEF', stealGold: 20, greedRange: 6, fleeHp: 0.30, role: 'Saqueador de las profundidades', lore: 'No busca una pelea justa: escucha monedas, calcula una ruta y solo entonces enseña los dientes.', tactic: 'CODICIA: persigue oro cercano. ROBO: si te hiere puede birlar 20 oro y huir hacia una escalera. Mátalo antes de que escape para recuperarlo.' },",
    'goblin config and lore'
)

text = replace_once(
    text,
    """            behavior: type.behavior,\n            diveChance: Number(type.diveChance) || 0,\n            name: name, symbol: type.symbol,""",
    """            behavior: type.behavior,\n            diveChance: Number(type.diveChance) || 0,\n            stealGold: Number(type.stealGold) || 0,\n            greedRange: Number(type.greedRange) || 0,\n            fleeHp: Number(type.fleeHp) || 0.30,\n            stolenGold: 0,\n            name: name, symbol: type.symbol,""",
    'spawn thief fields'
)

text = replace_once(
    text,
    """                dist = Math.max(Math.abs(GameState.player.x - e.x), Math.abs(GameState.player.y - e.y));\n                \n                if (dist <= 1) { \n                    if (e.behavior === 'COWARD' && e.hp < e.maxHp * 0.3) {\n                         if(!GameLogic.moveEnemyAway(e)) CombatSystem.enemyAttack(e); \n                    } else {\n                        CombatSystem.enemyAttack(e); \n                    }\n                    continue; \n                }\n\n                if (dist < 10) {\n                    if (e.behavior === 'DIVER' && dist === 2 && Utils.random() < e.diveChance) {\n                        GameLogic.performBatDive(e);\n                    } else if (e.behavior === 'DIVER' && Utils.random() < 0.45) {\n                        GameLogic.moveEnemyRandom(e);\n                    } else if (e.behavior === 'COWARD' && e.hp < e.maxHp * 0.3) {\n                        GameLogic.moveEnemyAway(e);\n                    } else {\n                        GameLogic.moveEnemyTowards(e, GameState.player.x, GameState.player.y);\n                    }\n                }""",
    """                dist = Math.max(Math.abs(GameState.player.x - e.x), Math.abs(GameState.player.y - e.y));\n\n                // Un Goblin que ya tiene botín deja de combatir: intenta alcanzar\n                // cualquiera de las dos escaleras y convertir el robo en pérdida real.\n                if (e.behavior === 'THIEF' && (e.stolenGold || 0) > 0) {\n                    if (GameLogic.moveGoblinToEscape(e)) break;\n                    continue;\n                }\n\n                // Antes de buscar al jugador, el Goblin se desvía por oro cercano.\n                if (e.behavior === 'THIEF' && GameLogic.moveGoblinTowardGold(e)) continue;\n                \n                if (dist <= 1) { \n                    const fleeThreshold = Number(e.fleeHp) || 0.30;\n                    if ((e.behavior === 'COWARD' || e.behavior === 'THIEF') && e.hp < e.maxHp * fleeThreshold) {\n                         if(!GameLogic.moveEnemyAway(e)) CombatSystem.enemyAttack(e); \n                    } else {\n                        CombatSystem.enemyAttack(e); \n                    }\n                    continue; \n                }\n\n                if (dist < 10) {\n                    if (e.behavior === 'DIVER' && dist === 2 && Utils.random() < e.diveChance) {\n                        GameLogic.performBatDive(e);\n                    } else if (e.behavior === 'DIVER' && Utils.random() < 0.45) {\n                        GameLogic.moveEnemyRandom(e);\n                    } else if ((e.behavior === 'COWARD' || e.behavior === 'THIEF') && e.hp < e.maxHp * (Number(e.fleeHp) || 0.30)) {\n                        GameLogic.moveEnemyAway(e);\n                    } else {\n                        GameLogic.moveEnemyTowards(e, GameState.player.x, GameState.player.y);\n                    }\n                }""",
    'goblin action loop'
)

text = replace_once(
    text,
    """            if (e.behavior === 'REGEN' && !e.tookDamage && e.hp < e.maxHp) { e.hp += 1; }\n        });\n    },\n    performBatDive: (e) => {""",
    """            if (e.behavior === 'REGEN' && !e.tookDamage && e.hp < e.maxHp) { e.hp += 1; }\n        });\n        GameState.entities.enemies = GameState.entities.enemies.filter(enemy => !enemy._escaped);\n    },\n    findNearestGroundGold: (e, range = 6) => {\n        if (!e) return null;\n        let best = null;\n        let bestDist = Infinity;\n        GameState.entities.items.forEach(item => {\n            if (!item || item.type !== 'GOLD') return;\n            const dist = Math.max(Math.abs(item.x - e.x), Math.abs(item.y - e.y));\n            if (dist <= range && dist < bestDist) {\n                best = item;\n                bestDist = dist;\n            }\n        });\n        return best;\n    },\n    collectGoblinGoldAt: (e) => {\n        if (!e || e.behavior !== 'THIEF') return false;\n        const idx = GameState.entities.items.findIndex(item => item.type === 'GOLD' && item.x === e.x && item.y === e.y);\n        if (idx === -1) return false;\n\n        const item = GameState.entities.items[idx];\n        const amount = Math.max(0, Number(item.value) || 0);\n        if (amount <= 0) return false;\n\n        e.stolenGold = (e.stolenGold || 0) + amount;\n        GameState.entities.items.splice(idx, 1);\n        MapSystem.markTaken(item.x, item.y);\n        Utils.log(`${e.name} recoge ${amount} oro y sale corriendo!`, e.color || '#00ff00');\n        VisualFX.floatText(e.x, e.y, `+$${amount}`, e.color || '#00ff00');\n        return true;\n    },\n    moveGoblinTowardGold: (e) => {\n        if (!e || e.behavior !== 'THIEF' || (e.stolenGold || 0) > 0) return false;\n        const target = GameLogic.findNearestGroundGold(e, Number(e.greedRange) || 6);\n        if (!target) return false;\n\n        if (e.x !== target.x || e.y !== target.y) {\n            GameLogic.moveEnemyTowards(e, target.x, target.y);\n        }\n        GameLogic.collectGoblinGoldAt(e);\n        return true;\n    },\n    goblinStealGold: (e) => {\n        if (!e || e.behavior !== 'THIEF' || (e.stolenGold || 0) > 0 || GameState.score <= 0) return 0;\n        const amount = Math.min(Number(e.stealGold) || 20, GameState.score);\n        if (amount <= 0) return 0;\n\n        GameState.score -= amount;\n        e.stolenGold = (e.stolenGold || 0) + amount;\n        Utils.log(`¡${e.name} te roba ${amount} oro! Va hacia una escalera.`, '#7fff00');\n        VisualFX.floatText(GameState.player.x, GameState.player.y, `-$${amount}`, '#7fff00', 'incoming');\n        UISystem.updateHUD();\n        return amount;\n    },\n    nearestEscapeStair: (e) => {\n        if (!e) return null;\n        const candidates = [GameState.stairs.up, GameState.stairs.down].filter(Boolean);\n        if (candidates.length === 0) return null;\n        candidates.sort((a, b) => {\n            const da = Math.max(Math.abs(a.x - e.x), Math.abs(a.y - e.y));\n            const db = Math.max(Math.abs(b.x - e.x), Math.abs(b.y - e.y));\n            return da - db;\n        });\n        return candidates.find(s => s.x !== GameState.player.x || s.y !== GameState.player.y) || candidates[0];\n    },\n    moveGoblinToEscape: (e) => {\n        if (!e || e.behavior !== 'THIEF' || (e.stolenGold || 0) <= 0) return false;\n        const isOnStairs = () => [GameState.stairs.up, GameState.stairs.down].some(s => s && s.x === e.x && s.y === e.y);\n\n        if (!isOnStairs()) {\n            const target = GameLogic.nearestEscapeStair(e);\n            if (target) GameLogic.moveEnemyTowards(e, target.x, target.y);\n        }\n\n        if (isOnStairs()) {\n            e._escaped = true;\n            Utils.log(`${e.name} escapa con ${e.stolenGold} oro.`, '#55aa22');\n            VisualFX.floatText(e.x, e.y, '¡ESCAPA!', '#55aa22');\n            return true;\n        }\n        return false;\n    },\n    dropGoblinLoot: (e) => {\n        if (!e || e.behavior !== 'THIEF' || (e.stolenGold || 0) <= 0) return 0;\n        const amount = e.stolenGold;\n        e.stolenGold = 0;\n        GameState.entities.items.push({\n            x: e.x, y: e.y, type: 'GOLD', value: amount,\n            name: 'Bolsa de oro robado', symbol: '$', color: '#ffd700', stolenFromGoblin: true\n        });\n        Utils.log(`El Goblin deja caer una bolsa con ${amount} oro.`, '#ffd700');\n        return amount;\n    },\n    performBatDive: (e) => {""",
    'goblin helpers'
)

text = replace_once(
    text,
    """            let currentIdx = GameState.entities.enemies.indexOf(e);\n            if(currentIdx !== -1) GameState.entities.enemies.splice(currentIdx, 1);""",
    """            GameLogic.dropGoblinLoot(e);\n            let currentIdx = GameState.entities.enemies.indexOf(e);\n            if(currentIdx !== -1) GameState.entities.enemies.splice(currentIdx, 1);""",
    'special attack goblin loot drop'
)

text = replace_once(
    text,
    """            let idx = GameState.entities.enemies.indexOf(enemy);\n            if (idx !== -1) GameState.entities.enemies.splice(idx, 1);""",
    """            GameLogic.dropGoblinLoot(enemy);\n            let idx = GameState.entities.enemies.indexOf(enemy);\n            if (idx !== -1) GameState.entities.enemies.splice(idx, 1);""",
    'bump goblin loot drop'
)

text = replace_once(
    text,
    """        GameState.player.hp -= dmg;\n        if (GameState.player.hp <= 0) GameLogic.die(e.name);""",
    """        GameState.player.hp -= dmg;\n        if (dmg > 0 && GameState.player.hp > 0) GameLogic.goblinStealGold(e);\n        if (GameState.player.hp <= 0) GameLogic.die(e.name);""",
    'goblin steals on successful hit'
)

path.write_text(text)


# --- tests/regression.test.cjs ---
path = Path('tests/regression.test.cjs')
text = path.read_text()
anchor = """test('I/H alternan la ayuda sin duplicar acciones', () => {"""
tests = r"""test('el Goblin es un saqueador con codicia y ruta de escape', () => {
    const goblin = CONFIG.ENTITIES.enemies.find(enemy => enemy.id === 'GOBLIN');
    assert.ok(goblin);
    assert.equal(goblin.behavior, 'THIEF');
    assert.equal(goblin.stealGold, 20);
    assert.equal(goblin.greedRange, 6);
    assert.equal(goblin.role, 'Saqueador de las profundidades');
});

test('el Goblin prioriza oro cercano y se lo guarda antes de huir', () => {
    freshGame(2201);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.persistence[GameState.level] = [];
    GameState.player.x = 20;
    GameState.player.y = 20;
    const goblin = {
        x: 10, y: 10, typeId: 'GOBLIN', behavior: 'THIEF', greedRange: 6, stealGold: 20,
        name: 'Goblin', symbol: 'G', color: '#00ff00', hp: 15, maxHp: 15, atk: 5,
        xp: 25, speed: 1, energy: 0, isSleeping: false, tookDamage: false, stolenGold: 0
    };
    GameState.entities = {
        enemies: [goblin],
        items: [{ x: 11, y: 10, type: 'GOLD', value: 10, name: 'Oro', symbol: '$', color: '#ffd700' }],
        chests: [], shops: []
    };

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        assert.equal(GameLogic.moveGoblinTowardGold(goblin), true);
        assert.equal(goblin.x, 11);
        assert.equal(goblin.y, 10);
        assert.equal(goblin.stolenGold, 10);
        assert.equal(GameState.entities.items.length, 0);
        assert.equal(MapSystem.isTaken(11, 10), true);
    } finally {
        Utils.random = originalRandom;
    }
});

test('un golpe del Goblin roba oro solo si consigue herir', () => {
    freshGame(2202);
    GameState.score = 50;
    GameState.player.hp = 100;
    GameState.player.equipment.armor = null;
    const goblin = { behavior: 'THIEF', stealGold: 20, stolenGold: 0, name: 'Goblin', atk: 5, energy: 0 };

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        CombatSystem.enemyAttack(goblin);
        assert.equal(GameState.player.hp, 95);
        assert.equal(GameState.score, 30);
        assert.equal(goblin.stolenGold, 20);

        const blocked = { behavior: 'THIEF', stealGold: 20, stolenGold: 0, name: 'Goblin', atk: 5, energy: 0 };
        GameState.score = 50;
        GameState.player.hp = 100;
        GameState.player.equipment.armor = { value: 99 };
        CombatSystem.enemyAttack(blocked);
        assert.equal(GameState.score, 50);
        assert.equal(blocked.stolenGold, 0);
    } finally {
        Utils.random = originalRandom;
    }
});

test('el Goblin con botín desaparece al alcanzar una escalera', () => {
    freshGame(2203);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.stairs.up = { x: 5, y: 5 };
    GameState.stairs.down = { x: 30, y: 15 };
    GameState.player.x = 20;
    GameState.player.y = 20;
    GameState.entities = {
        enemies: [{
            x: 5, y: 5, typeId: 'GOBLIN', behavior: 'THIEF', greedRange: 6, stealGold: 20,
            name: 'Goblin', symbol: 'G', color: '#00ff00', hp: 15, maxHp: 15, atk: 5,
            xp: 25, speed: 1, energy: 0, isSleeping: false, tookDamage: false, stolenGold: 20
        }],
        items: [], chests: [], shops: []
    };

    GameLogic.updateEnemies();
    assert.equal(GameState.entities.enemies.length, 0);
});

test('matar al Goblin hace caer exactamente el oro que llevaba', () => {
    freshGame(2204);
    GameState.floor = { type: 'NORMAL' };
    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));
    GameState.player.x = 10;
    GameState.player.y = 10;
    GameState.player.baseAtk = 100;
    const goblin = {
        x: 11, y: 10, typeId: 'GOBLIN', behavior: 'THIEF', stolenGold: 20,
        name: 'Goblin', symbol: 'G', color: '#00ff00', hp: 1, maxHp: 15, atk: 5,
        xp: 25, speed: 1, energy: 0, isSleeping: false, tookDamage: false
    };
    GameState.entities = { enemies: [goblin], items: [], chests: [], shops: [] };

    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        CombatSystem.bumpAttack(goblin);
        assert.equal(GameState.entities.enemies.length, 0);
        const bag = GameState.entities.items.find(item => item.stolenFromGoblin);
        assert.ok(bag);
        assert.equal(bag.type, 'GOLD');
        assert.equal(bag.value, 20);
        assert.equal(bag.x, 11);
        assert.equal(bag.y, 10);
    } finally {
        Utils.random = originalRandom;
    }
});

"""
text = replace_once(text, anchor, tests + anchor, 'goblin regression tests')
path.write_text(text)
