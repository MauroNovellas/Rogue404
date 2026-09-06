from pathlib import Path

js_path = Path('game.js')
test_path = Path('tests/regression.test.cjs')

text = js_path.read_text()
tests = test_path.read_text()


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, got {count}')
    return source.replace(old, new, 1)

text = replace_once(
    text,
    """            slipChance: 0.35,\n            driftChance: 0.25,\n            extraStepsMin: 1,\n            extraStepsMax: 2,\n""",
    """            slipChance: 0.35,\n            driftChance: 0.25,\n            extraStepsMin: 1,\n            extraStepsMax: 2,\n            animationMs: 90,\n""",
    'frozen animation config'
)

text = replace_once(
    text,
    """        shopStock: [],\n        floorWarningOpen: false,\n""",
    """        shopStock: [],\n        floorWarningOpen: false,\n        movementLocked: false,\n""",
    'movement lock state'
)

text = replace_once(
    text,
    """    extraSlipSteps: () => {\n        const config = CONFIG.FLOORS.FROZEN;\n        const span = config.extraStepsMax - config.extraStepsMin + 1;\n        return config.extraStepsMin + Math.floor(Utils.random() * span);\n    },\n    canSlideTo: (x, y) => {\n""",
    """    extraSlipSteps: () => {\n        const config = CONFIG.FLOORS.FROZEN;\n        const span = config.extraStepsMax - config.extraStepsMin + 1;\n        return config.extraStepsMin + Math.floor(Utils.random() * span);\n    },\n    waitSlipFrame: () => new Promise(resolve => window.setTimeout(resolve, CONFIG.FLOORS.FROZEN.animationMs)),\n    renderSlipFrame: async () => {\n        MapSystem.updateFog();\n        Renderer.draw();\n        UISystem.updateHUD();\n        await FloorSystem.waitSlipFrame();\n    },\n    canSlideTo: (x, y) => {\n""",
    'floor animation helpers'
)

text = replace_once(
    text,
    """        GameState.ui.shopStock = [];\n        GameState.ui.floorWarningOpen = false;\n        FloorSystem.closeWarning();\n""",
    """        GameState.ui.shopStock = [];\n        GameState.ui.floorWarningOpen = false;\n        GameState.ui.movementLocked = false;\n        FloorSystem.closeWarning();\n""",
    'movement lock reset'
)

old_move = """    movePlayer: (dx, dy) => {\n        const nx = GameState.player.x + dx;\n        const ny = GameState.player.y + dy;\n\n        if (MapSystem.isBlocked(nx, ny)) return false;\n        if (GameState.entities.shops.some(s => s.x === nx && s.y === ny)) { ShopSystem.open(); return false; }\n\n        const chest = GameState.entities.chests.find(c => c.x === nx && c.y === ny);\n        if (chest) {\n            if (!chest.isOpen) Utils.log('Cofre cerrado. Presiona ESPACIO.', CONFIG.ENTITIES.chests.colors.closed);\n            else Utils.log('Cofre vacío.', '#777');\n            return false;\n        }\n\n        const enemy = GameState.entities.enemies.find(e => e.x === nx && e.y === ny);\n        if (enemy) {\n            CombatSystem.bumpAttack(enemy);\n            GameLogic.endTurn(true);\n            return false;\n        }\n\n        GameLogic.enterPlayerTile(nx, ny);\n\n        if (FloorSystem.shouldSlip()) {\n            const [slideDx, slideDy] = FloorSystem.resolveSlipDirection(dx, dy);\n            const extraSteps = FloorSystem.extraSlipSteps();\n            let movedExtra = 0;\n\n            for (let step = 0; step < extraSteps; step++) {\n                const sx = GameState.player.x + slideDx;\n                const sy = GameState.player.y + slideDy;\n                if (!FloorSystem.canSlideTo(sx, sy)) break;\n                GameLogic.enterPlayerTile(sx, sy);\n                movedExtra++;\n            }\n\n            if (movedExtra > 0) {\n                const deviated = slideDx !== dx || slideDy !== dy;\n                Utils.log(deviated ? '¡El hielo te hace resbalar y te desvía!' : '¡Resbalas sobre el hielo!', '#8adfff');\n                VisualFX.floatText(GameState.player.x, GameState.player.y, deviated ? '¡DESVÍO!' : '¡RESBALA!', '#8adfff');\n            } else {\n                Utils.log('Pierdes pie, pero algo detiene el resbalón.', '#8adfff');\n            }\n        }\n\n        GameLogic.endTurn(true);\n        return true;\n    },\n"""

new_move = """    movePlayer: async (dx, dy) => {\n        if (GameState.ui.movementLocked) return false;\n\n        const nx = GameState.player.x + dx;\n        const ny = GameState.player.y + dy;\n\n        if (MapSystem.isBlocked(nx, ny)) return false;\n        if (GameState.entities.shops.some(s => s.x === nx && s.y === ny)) { ShopSystem.open(); return false; }\n\n        const chest = GameState.entities.chests.find(c => c.x === nx && c.y === ny);\n        if (chest) {\n            if (!chest.isOpen) Utils.log('Cofre cerrado. Presiona ESPACIO.', CONFIG.ENTITIES.chests.colors.closed);\n            else Utils.log('Cofre vacío.', '#777');\n            return false;\n        }\n\n        const enemy = GameState.entities.enemies.find(e => e.x === nx && e.y === ny);\n        if (enemy) {\n            CombatSystem.bumpAttack(enemy);\n            GameLogic.endTurn(true);\n            return false;\n        }\n\n        GameLogic.enterPlayerTile(nx, ny);\n\n        if (FloorSystem.shouldSlip()) {\n            GameState.ui.movementLocked = true;\n            try {\n                const [slideDx, slideDy] = FloorSystem.resolveSlipDirection(dx, dy);\n                const extraSteps = FloorSystem.extraSlipSteps();\n                let movedExtra = 0;\n\n                // Dibuja primero la casilla elegida por el jugador y después cada\n                // casilla extra: el resbalón se percibe como movimiento, no teleportación.\n                await FloorSystem.renderSlipFrame();\n\n                for (let step = 0; step < extraSteps; step++) {\n                    const sx = GameState.player.x + slideDx;\n                    const sy = GameState.player.y + slideDy;\n                    if (!FloorSystem.canSlideTo(sx, sy)) break;\n                    GameLogic.enterPlayerTile(sx, sy);\n                    movedExtra++;\n                    await FloorSystem.renderSlipFrame();\n                }\n\n                if (movedExtra > 0) {\n                    const deviated = slideDx !== dx || slideDy !== dy;\n                    Utils.log(deviated ? '¡El hielo te hace resbalar y te desvía!' : '¡Resbalas sobre el hielo!', '#8adfff');\n                    VisualFX.floatText(GameState.player.x, GameState.player.y, deviated ? '¡DESVÍO!' : '¡RESBALA!', '#8adfff');\n                } else {\n                    Utils.log('Pierdes pie, pero algo detiene el resbalón.', '#8adfff');\n                }\n            } finally {\n                GameState.ui.movementLocked = false;\n            }\n        }\n\n        GameLogic.endTurn(true);\n        return true;\n    },\n"""
text = replace_once(text, old_move, new_move, 'animated movePlayer')

text = replace_once(
    text,
    """document.addEventListener('keydown', (e) => {\n    if (e.repeat) return;\n\n    const key = e.key.toLowerCase();\n""",
    """document.addEventListener('keydown', (e) => {\n    if (e.repeat) return;\n    if (GameState.ui.movementLocked) return;\n\n    const key = e.key.toLowerCase();\n""",
    'keyboard movement lock'
)

old_test = """test('un resbalón mueve varias casillas pero consume una sola acción', () => {\n    freshGame(1306);\n    GameState.floor = { type: 'FROZEN' };\n    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));\n    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };\n    GameState.stairs.up = { x: 60, y: 20 };\n    GameState.stairs.down = { x: 61, y: 20 };\n    GameState.player.x = 10;\n    GameState.player.y = 10;\n    GameState.player.equipment.armor = null;\n\n    const originalRandom = Utils.random;\n    const originalEndTurn = GameLogic.endTurn;\n    let turns = 0;\n    const rolls = [0, 0.5, 0];\n    Utils.random = () => rolls.length ? rolls.shift() : 0.5;\n    GameLogic.endTurn = () => { turns++; };\n    try {\n        GameLogic.movePlayer(1, 0);\n        assert.equal(GameState.player.x, 12);\n        assert.equal(GameState.player.y, 10);\n        assert.equal(turns, 1);\n    } finally {\n        Utils.random = originalRandom;\n        GameLogic.endTurn = originalEndTurn;\n    }\n});\n"""

new_test = """test('un resbalón dibuja cada casilla intermedia y consume una sola acción', async () => {\n    freshGame(1306);\n    GameState.floor = { type: 'FROZEN' };\n    GameState.map = Array.from({ length: CONFIG.GRID.rows }, () => new Array(CONFIG.GRID.cols).fill('.'));\n    GameState.entities = { enemies: [], items: [], chests: [], shops: [] };\n    GameState.stairs.up = { x: 60, y: 20 };\n    GameState.stairs.down = { x: 61, y: 20 };\n    GameState.player.x = 10;\n    GameState.player.y = 10;\n    GameState.player.equipment.armor = null;\n\n    const originalRandom = Utils.random;\n    const originalEndTurn = GameLogic.endTurn;\n    const originalWaitSlipFrame = FloorSystem.waitSlipFrame;\n    let turns = 0;\n    const frames = [];\n    const rolls = [0, 0.5, 0.99];\n    Utils.random = () => rolls.length ? rolls.shift() : 0.5;\n    GameLogic.endTurn = () => { turns++; };\n    FloorSystem.waitSlipFrame = async () => {\n        frames.push([GameState.player.x, GameState.player.y]);\n    };\n    try {\n        const movement = GameLogic.movePlayer(1, 0);\n        assert.equal(GameState.ui.movementLocked, true);\n        await movement;\n        assert.deepEqual(frames, [[11, 10], [12, 10], [13, 10]]);\n        assert.equal(GameState.player.x, 13);\n        assert.equal(GameState.player.y, 10);\n        assert.equal(turns, 1);\n        assert.equal(GameState.ui.movementLocked, false);\n    } finally {\n        Utils.random = originalRandom;\n        GameLogic.endTurn = originalEndTurn;\n        FloorSystem.waitSlipFrame = originalWaitSlipFrame;\n    }\n});\n"""
tests = replace_once(tests, old_test, new_test, 'animated slip regression')

js_path.write_text(text)
test_path.write_text(tests)
