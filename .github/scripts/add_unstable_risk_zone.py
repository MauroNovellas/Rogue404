from pathlib import Path

GAME = Path('game.js')
TESTS = Path('tests/regression.test.cjs')

game = GAME.read_text()
tests = TESTS.read_text()


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

# 1) Configuración del Pasaje de Falla.
old = """        UNSTABLE: {
            enabled: true,
            label: 'INESTABLE',
            fallHpLoss: 0.75,
            collapseAnimationMs: 180,
            colors: { wall: '#302820', wallVisible: '#725d49', floor: '#b08b67', fog: '#241d17' },
            warningTitle: '⚠ ESTRATO INESTABLE',
            warningText: 'EL SUELO RECUERDA TUS PASOS.<br>• Cada casilla que abandonas queda agrietada.<br>• Si vuelves a pisarla, el suelo cede y caes al siguiente nivel.<br>• La caída te deja con solo el 25% de tu vida y dispersa mochila y equipo.<br>• Las escaleras son roca firme. El arnés ligero reduce la caída y conserva lo equipado.'
        }
"""
new = """        UNSTABLE: {
            enabled: true,
            label: 'INESTABLE',
            fallHpLoss: 0.75,
            collapseAnimationMs: 180,
            rift: {
                enabled: true,
                length: 5,
                rewardBonus: 4,
                tileColor: '#f3c58d',
                tileBackground: '#3a281c',
                fogColor: '#594536',
                chestColor: '#ffd27a'
            },
            colors: { wall: '#302820', wallVisible: '#725d49', floor: '#b08b67', fog: '#241d17' },
            warningTitle: '⚠ ESTRATO INESTABLE',
            warningText: 'EL SUELO RECUERDA TUS PASOS.<br>• Cada casilla que abandonas queda agrietada.<br>• Si vuelves a pisarla, el suelo cede y caes al siguiente nivel.<br>• Los Pasajes de Falla son caminos sin retorno: esconden botín superior, pero tus propias grietas cierran la salida.<br>• La caída te deja con solo el 25% de tu vida y dispersa mochila y equipo.<br>• Las escaleras son roca firme. El arnés ligero reduce la caída y conserva lo equipado.'
        }
"""
game = replace_once(game, old, new, 'unstable config')

# 2) Generación: Frozen/Magma siguen usando una sala; Inestable talla un ramal ciego.
old = """    prepareRiskZone: () => {
        GameState.floor.riskZone = null;
        let zoneConfig = null;
        let zoneType = null;
"""
new = """    prepareRiskZone: () => {
        GameState.floor.riskZone = null;
        if (FloorSystem.is('UNSTABLE')) {
            FloorSystem.prepareUnstablePassage();
            return;
        }

        let zoneConfig = null;
        let zoneType = null;
"""
game = replace_once(game, old, new, 'risk-zone unstable dispatch')

old = """    isRiskZoneTile: (x, y, type = null) => {
        const zone = GameState.floor && GameState.floor.riskZone;
        if (!zone || (type && zone.type !== type)) return false;
        return x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2;
    },
    isFrozenVaultTile: (x, y) => FloorSystem.is('FROZEN') && FloorSystem.isRiskZoneTile(x, y, 'FROZEN_VAULT'),
    isMagmaFumaroleTile: (x, y) => FloorSystem.is('MAGMA') && FloorSystem.isRiskZoneTile(x, y, 'MAGMA_FUMAROLE'),
"""
new = """    prepareUnstablePassage: () => {
        const config = CONFIG.FLOORS.UNSTABLE.rift;
        if (!config || !config.enabled) return;

        const length = Math.max(3, Number(config.length) || 5);
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        const candidates = [];
        const isStair = (x, y) =>
            (x === GameState.stairs.up.x && y === GameState.stairs.up.y) ||
            (x === GameState.stairs.down.x && y === GameState.stairs.down.y);

        // Busca una pared maciza junto a cualquier suelo ya conectado y talla un
        // corredor ciego. Los laterales deben seguir siendo roca para impedir
        // salidas alternativas: el regreso usa exactamente las huellas de entrada.
        for (let y = 2; y < CONFIG.GRID.rows - 2; y++) {
            for (let x = 2; x < CONFIG.GRID.cols - 2; x++) {
                if (GameState.map[y][x] !== '.' || isStair(x, y)) continue;
                const distFromUp = Math.abs(x - GameState.stairs.up.x) + Math.abs(y - GameState.stairs.up.y);
                if (distFromUp < 6) continue;

                for (const [dx, dy] of dirs) {
                    const sideX = -dy;
                    const sideY = dx;
                    const path = [];
                    let valid = true;

                    for (let step = 1; step <= length; step++) {
                        const tx = x + dx * step;
                        const ty = y + dy * step;
                        if (tx <= 1 || tx >= CONFIG.GRID.cols - 2 || ty <= 1 || ty >= CONFIG.GRID.rows - 2) {
                            valid = false;
                            break;
                        }
                        if (GameState.map[ty][tx] !== '#') {
                            valid = false;
                            break;
                        }

                        for (const side of [-1, 1]) {
                            const sx = tx + sideX * side;
                            const sy = ty + sideY * side;
                            if (GameState.map[sy][sx] !== '#') {
                                valid = false;
                                break;
                            }
                        }
                        if (!valid) break;
                        path.push({ x: tx, y: ty });
                    }

                    if (!valid || path.length !== length) continue;
                    const beyondX = x + dx * (length + 1);
                    const beyondY = y + dy * (length + 1);
                    if (beyondX <= 0 || beyondX >= CONFIG.GRID.cols - 1 || beyondY <= 0 || beyondY >= CONFIG.GRID.rows - 1) continue;
                    if (GameState.map[beyondY][beyondX] !== '#') continue;

                    candidates.push({
                        anchor: { x, y },
                        dx, dy,
                        path,
                        distFromUp
                    });
                }
            }
        }

        candidates.sort((a, b) =>
            b.distFromUp - a.distFromUp ||
            a.anchor.y - b.anchor.y ||
            a.anchor.x - b.anchor.x ||
            a.dy - b.dy ||
            a.dx - b.dx
        );
        const chosen = candidates[0];
        if (!chosen) return;

        chosen.path.forEach(tile => { GameState.map[tile.y][tile.x] = '.'; });
        const chest = chosen.path[chosen.path.length - 1];
        GameState.floor.riskZone = {
            type: 'UNSTABLE_RIFT',
            tiles: chosen.path.map(tile => ({ ...tile })),
            anchor: { ...chosen.anchor },
            dx: chosen.dx,
            dy: chosen.dy,
            chest: { ...chest }
        };
    },
    isRiskZoneTile: (x, y, type = null) => {
        const zone = GameState.floor && GameState.floor.riskZone;
        if (!zone || (type && zone.type !== type)) return false;
        if (Array.isArray(zone.tiles)) return zone.tiles.some(tile => tile.x === x && tile.y === y);
        return x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2;
    },
    isFrozenVaultTile: (x, y) => FloorSystem.is('FROZEN') && FloorSystem.isRiskZoneTile(x, y, 'FROZEN_VAULT'),
    isMagmaFumaroleTile: (x, y) => FloorSystem.is('MAGMA') && FloorSystem.isRiskZoneTile(x, y, 'MAGMA_FUMAROLE'),
    isUnstableRiftTile: (x, y) => FloorSystem.is('UNSTABLE') && FloorSystem.isRiskZoneTile(x, y, 'UNSTABLE_RIFT'),
"""
game = replace_once(game, old, new, 'unstable passage generator')

# 3) El cofre de falla usa el extremo del corredor; los demás siguen usando la sala.
old = """        } else if (FloorSystem.is('MAGMA') && zone.type === 'MAGMA_FUMAROLE') {
            chestName = 'Cofre de brasa';
            specialId = 'MAGMA_FUMAROLE_CHEST';
        } else {
            return;
        }

        const candidates = [];
        for (let y = zone.y1; y <= zone.y2; y++) {
            for (let x = zone.x1; x <= zone.x2; x++) {
                if (MapSystem.isBlocked(x, y) || EntityFactory.isStartEnd(x, y) || EntityFactory.isOccupied(x, y)) continue;
                candidates.push({ x, y, dist: Math.abs(x - GameState.stairs.up.x) + Math.abs(y - GameState.stairs.up.y) });
            }
        }
        candidates.sort((a, b) => b.dist - a.dist);
        const pos = candidates[0];
        if (!pos) return;
"""
new = """        } else if (FloorSystem.is('MAGMA') && zone.type === 'MAGMA_FUMAROLE') {
            chestName = 'Cofre de brasa';
            specialId = 'MAGMA_FUMAROLE_CHEST';
        } else if (FloorSystem.is('UNSTABLE') && zone.type === 'UNSTABLE_RIFT') {
            chestName = 'Cofre de falla';
            specialId = 'UNSTABLE_RIFT_CHEST';
        } else {
            return;
        }

        let pos = zone.chest ? { ...zone.chest } : null;
        if (!pos) {
            const candidates = [];
            for (let y = zone.y1; y <= zone.y2; y++) {
                for (let x = zone.x1; x <= zone.x2; x++) {
                    if (MapSystem.isBlocked(x, y) || EntityFactory.isStartEnd(x, y) || EntityFactory.isOccupied(x, y)) continue;
                    candidates.push({ x, y, dist: Math.abs(x - GameState.stairs.up.x) + Math.abs(y - GameState.stairs.up.y) });
                }
            }
            candidates.sort((a, b) => b.dist - a.dist);
            pos = candidates[0];
        }
        if (!pos) return;
"""
game = replace_once(game, old, new, 'unstable special chest spawn')

# 4) Nada ordinario aparece dentro del corredor ciego.
old = """            if (GameState.map[y][x] === '.' && !MapSystem.isBlocked(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };
"""
new = """            if (GameState.map[y][x] === '.' && !MapSystem.isBlocked(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y) && !FloorSystem.isUnstableRiftTile(x, y)) return { x, y };
"""
game = replace_once(game, old, new, 'reserve unstable passage')

# 5) Feedback al entrar.
old = """    enterPlayerTile: (x, y) => {
        const wasFrozenVault = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y);
        const wasMagmaFumarole = FloorSystem.isMagmaFumaroleTile(GameState.player.x, GameState.player.y);
        GameState.player.x = x;
"""
new = """    enterPlayerTile: (x, y) => {
        const wasFrozenVault = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y);
        const wasMagmaFumarole = FloorSystem.isMagmaFumaroleTile(GameState.player.x, GameState.player.y);
        const wasUnstableRift = FloorSystem.isUnstableRiftTile(GameState.player.x, GameState.player.y);
        GameState.player.x = x;
"""
game = replace_once(game, old, new, 'unstable entry previous state')

old = """        const inFrozenVault = FloorSystem.isFrozenVaultTile(x, y);
        const inMagmaFumarole = FloorSystem.isMagmaFumaroleTile(x, y);
"""
new = """        const inFrozenVault = FloorSystem.isFrozenVaultTile(x, y);
        const inMagmaFumarole = FloorSystem.isMagmaFumaroleTile(x, y);
        const inUnstableRift = FloorSystem.isUnstableRiftTile(x, y);
"""
game = replace_once(game, old, new, 'unstable entry current state')

old = """        if (!wasMagmaFumarole && inMagmaFumarole) {
            Utils.log('Entras en una Cámara de Fumarola. Cada turno quema parte de tu reserva de agua.', '#ff7a3d');
            VisualFX.floatText(x, y, '¡SED!', '#ff7a3d');
        }
"""
new = """        if (!wasMagmaFumarole && inMagmaFumarole) {
            Utils.log('Entras en una Cámara de Fumarola. Cada turno quema parte de tu reserva de agua.', '#ff7a3d');
            VisualFX.floatText(x, y, '¡SED!', '#ff7a3d');
        }
        if (!wasUnstableRift && inUnstableRift) {
            Utils.log('Entras en un Pasaje de Falla. El botín está al fondo; tus pasos cerrarán el camino de vuelta.', '#ffd27a');
            VisualFX.floatText(x, y, '¡SIN RETORNO!', '#ffd27a');
        }
"""
game = replace_once(game, old, new, 'unstable entry feedback')

# 6) Los enemigos tampoco entran en el pasaje reservado.
old = """    isValidEnemyMove: (x, y) => {
        if (MapSystem.isBlocked(x, y)) return false;
        // En el estrato inestable los enemigos tratan las grietas como paredes:
"""
new = """    isValidEnemyMove: (x, y) => {
        if (MapSystem.isBlocked(x, y)) return false;
        if (FloorSystem.isUnstableRiftTile(x, y)) return false;
        // En el estrato inestable los enemigos tratan las grietas como paredes:
"""
game = replace_once(game, old, new, 'enemy passage wall')

# 7) Recompensa de Inestable.
old = """        if (chest.specialId === 'MAGMA_FUMAROLE_CHEST') {
            const fumarole = CONFIG.FLOORS.MAGMA.fumarole;
            const weaponReward = Utils.random() < 0.5;
            if (weaponReward) {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'weapon', CONFIG.COMBAT.baseWeaponVal + GameState.level + fumarole.rewardBonus, 'Arma de obsidiana', '!', fumarole.chestColor);
            } else {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'armor', CONFIG.COMBAT.baseArmorVal + GameState.level + fumarole.rewardBonus, 'Malla volcánica', ']', fumarole.chestColor);
            }
            const reward = GameState.entities.items.pop();
            Utils.log('El cofre de brasa cede al calor. Dentro hay equipo excepcional.', fumarole.chestColor);
            InventorySystem.pickup(reward, -1, -1, -1, true);
            return;
        }

        if (Utils.random() < CONFIG.ENTITIES.chests.trapChance) {
"""
new = """        if (chest.specialId === 'MAGMA_FUMAROLE_CHEST') {
            const fumarole = CONFIG.FLOORS.MAGMA.fumarole;
            const weaponReward = Utils.random() < 0.5;
            if (weaponReward) {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'weapon', CONFIG.COMBAT.baseWeaponVal + GameState.level + fumarole.rewardBonus, 'Arma de obsidiana', '!', fumarole.chestColor);
            } else {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'armor', CONFIG.COMBAT.baseArmorVal + GameState.level + fumarole.rewardBonus, 'Malla volcánica', ']', fumarole.chestColor);
            }
            const reward = GameState.entities.items.pop();
            Utils.log('El cofre de brasa cede al calor. Dentro hay equipo excepcional.', fumarole.chestColor);
            InventorySystem.pickup(reward, -1, -1, -1, true);
            return;
        }

        if (chest.specialId === 'UNSTABLE_RIFT_CHEST') {
            const rift = CONFIG.FLOORS.UNSTABLE.rift;
            const weaponReward = Utils.random() < 0.5;
            if (weaponReward) {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'weapon', CONFIG.COMBAT.baseWeaponVal + GameState.level + rift.rewardBonus, 'Hoja de falla', '!', rift.chestColor);
            } else {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'armor', CONFIG.COMBAT.baseArmorVal + GameState.level + rift.rewardBonus, 'Malla tectónica', ']', rift.chestColor);
            }
            const reward = GameState.entities.items.pop();
            Utils.log('El cofre de falla se abre. El premio merece el riesgo; ahora queda decidir cómo salir.', rift.chestColor);
            InventorySystem.pickup(reward, -1, -1, -1, true);
            return;
        }

        if (Utils.random() < CONFIG.ENTITIES.chests.trapChance) {
"""
game = replace_once(game, old, new, 'unstable chest reward')

# 8) Render del cofre y del suelo especial. Grietas/agujeros conservan prioridad visual.
old = """                                const frozenVaultChest = chest.specialId === 'FROZEN_VAULT_CHEST';
                                const magmaFumaroleChest = chest.specialId === 'MAGMA_FUMAROLE_CHEST';
                                const specialRiskChest = frozenVaultChest || magmaFumaroleChest;
                                char = chest.isOpen ? "_" : (specialRiskChest ? "*" : "=");
                                const closedColor = frozenVaultChest
                                    ? CONFIG.FLOORS.FROZEN.vault.chestColor
                                    : (magmaFumaroleChest ? CONFIG.FLOORS.MAGMA.fumarole.chestColor : CONFIG.ENTITIES.chests.colors.closed);
"""
new = """                                const frozenVaultChest = chest.specialId === 'FROZEN_VAULT_CHEST';
                                const magmaFumaroleChest = chest.specialId === 'MAGMA_FUMAROLE_CHEST';
                                const unstableRiftChest = chest.specialId === 'UNSTABLE_RIFT_CHEST';
                                const specialRiskChest = frozenVaultChest || magmaFumaroleChest || unstableRiftChest;
                                char = chest.isOpen ? "_" : (specialRiskChest ? "*" : "=");
                                const closedColor = frozenVaultChest
                                    ? CONFIG.FLOORS.FROZEN.vault.chestColor
                                    : (magmaFumaroleChest
                                        ? CONFIG.FLOORS.MAGMA.fumarole.chestColor
                                        : (unstableRiftChest ? CONFIG.FLOORS.UNSTABLE.rift.chestColor : CONFIG.ENTITIES.chests.colors.closed));
"""
game = replace_once(game, old, new, 'unstable chest render')

old = """                    else if (FloorSystem.isMagmaFumaroleTile(x, y)) {
                        const fumarole = CONFIG.FLOORS.MAGMA.fumarole;
                        char = "·";
                        color = isVis ? `color:${fumarole.tileColor}; background:${fumarole.tileBackground}` : `color:${fumarole.fogColor}`;
                    }
                    else { char = "."; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
"""
new = """                    else if (FloorSystem.isMagmaFumaroleTile(x, y)) {
                        const fumarole = CONFIG.FLOORS.MAGMA.fumarole;
                        char = "·";
                        color = isVis ? `color:${fumarole.tileColor}; background:${fumarole.tileBackground}` : `color:${fumarole.fogColor}`;
                    }
                    else if (FloorSystem.isUnstableRiftTile(x, y)) {
                        const rift = CONFIG.FLOORS.UNSTABLE.rift;
                        char = "·";
                        color = isVis ? `color:${rift.tileColor}; background:${rift.tileBackground}` : `color:${rift.fogColor}`;
                    }
                    else { char = "."; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
"""
game = replace_once(game, old, new, 'unstable passage render')

# 9) Leyenda del cofre.
old = """            } else if (chest && chest.specialId === 'MAGMA_FUMAROLE_CHEST') {
                id = 'MAGMA_FUMAROLE_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.MAGMA.fumarole.chestColor, name:'Cofre de brasa', stats:'Botín excepcional'};
            } else {
"""
new = """            } else if (chest && chest.specialId === 'MAGMA_FUMAROLE_CHEST') {
                id = 'MAGMA_FUMAROLE_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.MAGMA.fumarole.chestColor, name:'Cofre de brasa', stats:'Botín excepcional'};
            } else if (chest && chest.specialId === 'UNSTABLE_RIFT_CHEST') {
                id = 'UNSTABLE_RIFT_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.UNSTABLE.rift.chestColor, name:'Cofre de falla', stats:'Botín excepcional · sin retorno'};
            } else {
"""
game = replace_once(game, old, new, 'unstable chest legend')

# 10) HUD contextual.
old = """        if (FloorSystem.is('UNSTABLE')) parts.push('<span style=\"color:#d7a56d\">INESTABLE · NO RETROCEDAS</span>');
"""
new = """        if (FloorSystem.is('UNSTABLE')) {
            const inRift = FloorSystem.isUnstableRiftTile(GameState.player.x, GameState.player.y);
            parts.push(`<span style=\"color:#d7a56d\">${inRift ? 'INESTABLE · PASAJE SIN RETORNO' : 'INESTABLE · NO RETROCEDAS'}</span>`);
        }
"""
game = replace_once(game, old, new, 'unstable risk HUD')

# 11) Regresiones del tercer bioma de riesgo/recompensa.
marker = "\n(async () => {\n"
if marker not in tests:
    raise SystemExit('tests marker not found')

new_tests = r'''

test('Inestable genera un Pasaje de Falla ciego con cofre especial y sin spawns ordinarios', () => {
    freshGame(2601);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();

    const zone = GameState.floor.riskZone;
    assert.ok(zone);
    assert.equal(zone.type, 'UNSTABLE_RIFT');
    assert.equal(zone.tiles.length, CONFIG.FLOORS.UNSTABLE.rift.length);
    assert.ok(zone.tiles.length >= 3);
    assert.equal(FloorSystem.isUnstableRiftTile(GameState.stairs.up.x, GameState.stairs.up.y), false);
    assert.equal(FloorSystem.isUnstableRiftTile(GameState.stairs.down.x, GameState.stairs.down.y), false);

    const chest = GameState.entities.chests.find(entry => entry.specialId === 'UNSTABLE_RIFT_CHEST');
    assert.ok(chest);
    assert.deepEqual([chest.x, chest.y], [zone.chest.x, zone.chest.y]);
    assert.equal(FloorSystem.isUnstableRiftTile(chest.x, chest.y), true);

    const reserved = zone.tiles.map(tile => `${tile.x},${tile.y}`);
    assert.equal(GameState.entities.enemies.some(e => reserved.includes(`${e.x},${e.y}`)), false);
    assert.equal(GameState.entities.items.some(item => reserved.includes(`${item.x},${item.y}`)), false);
    assert.equal(GameState.entities.shops.some(shop => reserved.includes(`${shop.x},${shop.y}`)), false);
    assert.equal(GameLogic.isValidEnemyMove(zone.tiles[0].x, zone.tiles[0].y), false);
});

test('retroceder por el Pasaje de Falla pisa tu propia grieta y provoca la caída', async () => {
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

test('el Cofre de Falla evita trampas, entrega equipo superior y persiste abierto', () => {
    freshGame(2603);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.player.hp = 80;
    GameState.player.inventory = [];

    let chestIndex = GameState.entities.chests.findIndex(entry => entry.specialId === 'UNSTABLE_RIFT_CHEST');
    assert.ok(chestIndex >= 0);
    const chest = GameState.entities.chests[chestIndex];
    const coords = [chest.x, chest.y];
    const originalRandom = Utils.random;
    Utils.random = () => 0;
    try {
        GameLogic.openChest(chestIndex);
        assert.equal(GameState.player.hp, 80);
        assert.equal(GameState.entities.chests[chestIndex].isOpen, true);
        assert.equal(GameState.player.inventory.length, 1);
        assert.ok(GameState.player.inventory[0].name.includes('falla'));
        assert.equal(GameState.player.inventory[0].type, 'weapon');
    } finally {
        Utils.random = originalRandom;
    }

    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    const restored = GameState.entities.chests.find(entry => entry.specialId === 'UNSTABLE_RIFT_CHEST');
    assert.ok(restored);
    assert.deepEqual([restored.x, restored.y], coords);
    assert.equal(restored.isOpen, true);
});

test('el arnés convierte el retorno del Pasaje de Falla en una caída mucho menos destructiva', async () => {
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
'''

tests = tests.replace(marker, new_tests + marker, 1)

GAME.write_text(game)
TESTS.write_text(tests)
