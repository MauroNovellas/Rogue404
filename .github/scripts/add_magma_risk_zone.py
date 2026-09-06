from pathlib import Path

GAME = Path('game.js')
TESTS = Path('tests/regression.test.cjs')

source = GAME.read_text(encoding='utf-8')

old = """        MAGMA: {
            enabled: true,
            label: 'MAGMA',
            thirstMultiplier: 2,
            colors: { wall: '#42130d', wallVisible: '#9c3520', floor: '#d56832', fog: '#210b08' },
            warningTitle: '⚠ CÁMARA MAGMÁTICA',
            warningText: 'EL CALOR ASFIXIA ESTE NIVEL.<br>• Descansar no recupera vida.<br>• La sed avanza al doble de velocidad.<br>• La malla térmica reduce la presión del calor y permite descansar.'
        },"""
new = """        MAGMA: {
            enabled: true,
            label: 'MAGMA',
            thirstMultiplier: 2,
            fumarole: {
                enabled: true,
                waterCostPerTurn: 2,
                rewardBonus: 3,
                tileColor: '#ffd29a',
                tileBackground: '#5a180c',
                fogColor: '#6f2b19',
                chestColor: '#ff5a2b'
            },
            colors: { wall: '#42130d', wallVisible: '#9c3520', floor: '#d56832', fog: '#210b08' },
            warningTitle: '⚠ CÁMARA MAGMÁTICA',
            warningText: 'EL CALOR ASFIXIA ESTE NIVEL.<br>• Descansar no recupera vida.<br>• La sed avanza al doble de velocidad.<br>• Las cámaras de fumarola consumen agua cada turno, pero esconden botín superior.<br>• La malla térmica reduce la presión del calor y permite descansar.'
        },"""
assert old in source, 'Magma config anchor missing'
source = source.replace(old, new, 1)

old = """    prepareRiskZone: () => {
        GameState.floor.riskZone = null;
        const vault = CONFIG.FLOORS.FROZEN.vault;
        if (!FloorSystem.is('FROZEN') || !vault || !vault.enabled || GameState.rooms.length < 3) return;

        const candidates = GameState.rooms.filter((room, index) => index > 0 && index < GameState.rooms.length - 1);
        if (candidates.length === 0) return;

        const up = GameState.stairs.up;
        const room = candidates.reduce((best, current) => {
            const currentDist = Math.abs(current.center.x - up.x) + Math.abs(current.center.y - up.y);
            const bestDist = Math.abs(best.center.x - up.x) + Math.abs(best.center.y - up.y);
            return currentDist > bestDist ? current : best;
        });

        const insetX = room.w >= 5 ? 1 : 0;
        const insetY = room.h >= 5 ? 1 : 0;
        GameState.floor.riskZone = {
            type: 'FROZEN_VAULT',
            x1: room.x + insetX,
            y1: room.y + insetY,
            x2: room.x + room.w - 1 - insetX,
            y2: room.y + room.h - 1 - insetY
        };
    },
    isRiskZoneTile: (x, y, type = null) => {
        const zone = GameState.floor && GameState.floor.riskZone;
        if (!zone || (type && zone.type !== type)) return false;
        return x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2;
    },
    isFrozenVaultTile: (x, y) => FloorSystem.is('FROZEN') && FloorSystem.isRiskZoneTile(x, y, 'FROZEN_VAULT'),
"""
new = """    prepareRiskZone: () => {
        GameState.floor.riskZone = null;
        let zoneConfig = null;
        let zoneType = null;

        if (FloorSystem.is('FROZEN')) {
            zoneConfig = CONFIG.FLOORS.FROZEN.vault;
            zoneType = 'FROZEN_VAULT';
        } else if (FloorSystem.is('MAGMA')) {
            zoneConfig = CONFIG.FLOORS.MAGMA.fumarole;
            zoneType = 'MAGMA_FUMAROLE';
        }

        if (!zoneConfig || !zoneConfig.enabled || GameState.rooms.length < 3) return;
        const candidates = GameState.rooms.filter((room, index) => index > 0 && index < GameState.rooms.length - 1);
        if (candidates.length === 0) return;

        const up = GameState.stairs.up;
        const room = candidates.reduce((best, current) => {
            const currentDist = Math.abs(current.center.x - up.x) + Math.abs(current.center.y - up.y);
            const bestDist = Math.abs(best.center.x - up.x) + Math.abs(best.center.y - up.y);
            return currentDist > bestDist ? current : best;
        });

        const insetX = room.w >= 5 ? 1 : 0;
        const insetY = room.h >= 5 ? 1 : 0;
        GameState.floor.riskZone = {
            type: zoneType,
            x1: room.x + insetX,
            y1: room.y + insetY,
            x2: room.x + room.w - 1 - insetX,
            y2: room.y + room.h - 1 - insetY
        };
    },
    isRiskZoneTile: (x, y, type = null) => {
        const zone = GameState.floor && GameState.floor.riskZone;
        if (!zone || (type && zone.type !== type)) return false;
        return x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2;
    },
    isFrozenVaultTile: (x, y) => FloorSystem.is('FROZEN') && FloorSystem.isRiskZoneTile(x, y, 'FROZEN_VAULT'),
    isMagmaFumaroleTile: (x, y) => FloorSystem.is('MAGMA') && FloorSystem.isRiskZoneTile(x, y, 'MAGMA_FUMAROLE'),
"""
assert old in source, 'prepareRiskZone anchor missing'
source = source.replace(old, new, 1)

old = """    thirstRate: () => {
        const baseRate = CONFIG.PLAYER.survival.thirstRate;
        if (!FloorSystem.is('MAGMA')) return baseRate;
        const config = CONFIG.FLOORS.MAGMA;
        const resist = Math.max(0, Math.min(1, Number(FloorSystem.armorTraits().thirstResist) || 0));
        const pressure = 1 + (config.thirstMultiplier - 1) * (1 - resist);
        return Math.max(1, Math.round(baseRate / pressure));
    },
"""
new = old + """    magmaRiskWaterCost: () => {
        if (!FloorSystem.isMagmaFumaroleTile(GameState.player.x, GameState.player.y)) return 0;
        const config = CONFIG.FLOORS.MAGMA.fumarole;
        const resist = Math.max(0, Math.min(1, Number(FloorSystem.armorTraits().heatResist) || 0));
        return Math.max(0, Math.ceil(config.waterCostPerTurn * (1 - resist)));
    },
"""
assert old in source, 'thirstRate anchor missing'
source = source.replace(old, new, 1)

old = """    spawnRiskReward: () => {
        const zone = GameState.floor.riskZone;
        if (!FloorSystem.is('FROZEN') || !zone || zone.type !== 'FROZEN_VAULT') return;

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

        const chestKey = `CHEST_${pos.x},${pos.y}`;
        GameState.entities.chests.push({
            x: pos.x,
            y: pos.y,
            name: 'Cofre de escarcha',
            specialId: 'FROZEN_VAULT_CHEST',
            isOpen: MapSystem.isTaken(chestKey)
        });
    },
"""
new = """    spawnRiskReward: () => {
        const zone = GameState.floor.riskZone;
        if (!zone) return;

        let chestName = null;
        let specialId = null;
        if (FloorSystem.is('FROZEN') && zone.type === 'FROZEN_VAULT') {
            chestName = 'Cofre de escarcha';
            specialId = 'FROZEN_VAULT_CHEST';
        } else if (FloorSystem.is('MAGMA') && zone.type === 'MAGMA_FUMAROLE') {
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

        const chestKey = `CHEST_${pos.x},${pos.y}`;
        GameState.entities.chests.push({
            x: pos.x,
            y: pos.y,
            name: chestName,
            specialId,
            isOpen: MapSystem.isTaken(chestKey)
        });
    },
"""
assert old in source, 'spawnRiskReward anchor missing'
source = source.replace(old, new, 1)

old = """    enterPlayerTile: (x, y) => {
        const wasFrozenVault = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y);
        GameState.player.x = x;
        GameState.player.y = y;
        GameState.player.combat.waitBonus = 0;
        GameState.player.combat.isDefending = false;
        GameLogic.collectItemsAt(x, y);
        const inFrozenVault = FloorSystem.isFrozenVaultTile(x, y);
        if (!wasFrozenVault && inFrozenVault) {
            Utils.log('Entras en una Cámara de Escarcha. El hielo aquí es mucho más traicionero.', '#8df3ff');
            VisualFX.floatText(x, y, '¡RIESGO!', '#8df3ff');
        }
    },
"""
new = """    enterPlayerTile: (x, y) => {
        const wasFrozenVault = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y);
        const wasMagmaFumarole = FloorSystem.isMagmaFumaroleTile(GameState.player.x, GameState.player.y);
        GameState.player.x = x;
        GameState.player.y = y;
        GameState.player.combat.waitBonus = 0;
        GameState.player.combat.isDefending = false;
        GameLogic.collectItemsAt(x, y);
        const inFrozenVault = FloorSystem.isFrozenVaultTile(x, y);
        const inMagmaFumarole = FloorSystem.isMagmaFumaroleTile(x, y);
        if (!wasFrozenVault && inFrozenVault) {
            Utils.log('Entras en una Cámara de Escarcha. El hielo aquí es mucho más traicionero.', '#8df3ff');
            VisualFX.floatText(x, y, '¡RIESGO!', '#8df3ff');
        }
        if (!wasMagmaFumarole && inMagmaFumarole) {
            Utils.log('Entras en una Cámara de Fumarola. Cada turno quema parte de tu reserva de agua.', '#ff7a3d');
            VisualFX.floatText(x, y, '¡SED!', '#ff7a3d');
        }
    },
"""
assert old in source, 'enterPlayerTile anchor missing'
source = source.replace(old, new, 1)

old = """        const thirstRate = FloorSystem.thirstRate();
        if (GameState.moves % thirstRate === 0) GameState.player.water--;

        if (GameState.player.food <= 0) {"""
new = """        const thirstRate = FloorSystem.thirstRate();
        if (GameState.moves % thirstRate === 0) GameState.player.water--;
        const magmaRiskCost = FloorSystem.magmaRiskWaterCost();
        if (magmaRiskCost > 0) {
            GameState.player.water -= magmaRiskCost;
            VisualFX.floatText(GameState.player.x, GameState.player.y, `-${magmaRiskCost} AGUA`, '#57d7ff', 'incoming');
        }

        if (GameState.player.food <= 0) {"""
assert old in source, 'processSurvival anchor missing'
source = source.replace(old, new, 1)

old = """        if (chest.specialId === 'FROZEN_VAULT_CHEST') {
            const vault = CONFIG.FLOORS.FROZEN.vault;
            const weaponReward = Utils.random() < 0.5;
            if (weaponReward) {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'weapon', CONFIG.COMBAT.baseWeaponVal + GameState.level + vault.rewardBonus, 'Arma de escarcha', '!', '#8df3ff');
            } else {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'armor', CONFIG.COMBAT.baseArmorVal + GameState.level + vault.rewardBonus, 'Malla de escarcha', ']', '#8df3ff');
            }
            const reward = GameState.entities.items.pop();
            Utils.log('El cofre de escarcha se abre sin trampa. Dentro hay equipo excepcional.', vault.chestColor);
            InventorySystem.pickup(reward, -1, -1, -1, true);
            return;
        }

        if (Utils.random() < CONFIG.ENTITIES.chests.trapChance) {"""
new = """        if (chest.specialId === 'FROZEN_VAULT_CHEST') {
            const vault = CONFIG.FLOORS.FROZEN.vault;
            const weaponReward = Utils.random() < 0.5;
            if (weaponReward) {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'weapon', CONFIG.COMBAT.baseWeaponVal + GameState.level + vault.rewardBonus, 'Arma de escarcha', '!', '#8df3ff');
            } else {
                EntityFactory.createSmartItem({ x: 0, y: 0 }, 'armor', CONFIG.COMBAT.baseArmorVal + GameState.level + vault.rewardBonus, 'Malla de escarcha', ']', '#8df3ff');
            }
            const reward = GameState.entities.items.pop();
            Utils.log('El cofre de escarcha se abre sin trampa. Dentro hay equipo excepcional.', vault.chestColor);
            InventorySystem.pickup(reward, -1, -1, -1, true);
            return;
        }

        if (chest.specialId === 'MAGMA_FUMAROLE_CHEST') {
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

        if (Utils.random() < CONFIG.ENTITIES.chests.trapChance) {"""
assert old in source, 'openChest special anchor missing'
source = source.replace(old, new, 1)

old = """                            if (chest) {
                                const frozenVaultChest = chest.specialId === 'FROZEN_VAULT_CHEST';
                                char = chest.isOpen ? "_" : (frozenVaultChest ? "*" : "=");
                                const closedColor = frozenVaultChest ? CONFIG.FLOORS.FROZEN.vault.chestColor : CONFIG.ENTITIES.chests.colors.closed;
                                color = `color:${chest.isOpen ? CONFIG.ENTITIES.chests.colors.open : closedColor}; font-weight:bold`;
                            }
"""
new = """                            if (chest) {
                                const frozenVaultChest = chest.specialId === 'FROZEN_VAULT_CHEST';
                                const magmaFumaroleChest = chest.specialId === 'MAGMA_FUMAROLE_CHEST';
                                const specialRiskChest = frozenVaultChest || magmaFumaroleChest;
                                char = chest.isOpen ? "_" : (specialRiskChest ? "*" : "=");
                                const closedColor = frozenVaultChest
                                    ? CONFIG.FLOORS.FROZEN.vault.chestColor
                                    : (magmaFumaroleChest ? CONFIG.FLOORS.MAGMA.fumarole.chestColor : CONFIG.ENTITIES.chests.colors.closed);
                                color = `color:${chest.isOpen ? CONFIG.ENTITIES.chests.colors.open : closedColor}; font-weight:bold`;
                            }
"""
assert old in source, 'renderer chest anchor missing'
source = source.replace(old, new, 1)

old = """                    else if (FloorSystem.isFrozenVaultTile(x, y)) {
                        const vault = CONFIG.FLOORS.FROZEN.vault;
                        char = "·";
                        color = isVis ? `color:${vault.tileColor}; background:${vault.tileBackground}` : `color:${vault.fogColor}`;
                    }
                    else { char = "."; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
"""
new = """                    else if (FloorSystem.isFrozenVaultTile(x, y)) {
                        const vault = CONFIG.FLOORS.FROZEN.vault;
                        char = "·";
                        color = isVis ? `color:${vault.tileColor}; background:${vault.tileBackground}` : `color:${vault.fogColor}`;
                    }
                    else if (FloorSystem.isMagmaFumaroleTile(x, y)) {
                        const fumarole = CONFIG.FLOORS.MAGMA.fumarole;
                        char = "·";
                        color = isVis ? `color:${fumarole.tileColor}; background:${fumarole.tileBackground}` : `color:${fumarole.fogColor}`;
                    }
                    else { char = "."; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
"""
assert old in source, 'renderer risk tile anchor missing'
source = source.replace(old, new, 1)

old = """            if (chest && chest.specialId === 'FROZEN_VAULT_CHEST') {
                id = 'FROZEN_VAULT_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.FROZEN.vault.chestColor, name:'Cofre de escarcha', stats:'Botín excepcional'};
            } else {
                id = 'CHEST'; data = {symbol:'=', color:CONFIG.ENTITIES.chests.colors.closed, name:'Cofre', stats:'Botín'};
            }
"""
new = """            if (chest && chest.specialId === 'FROZEN_VAULT_CHEST') {
                id = 'FROZEN_VAULT_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.FROZEN.vault.chestColor, name:'Cofre de escarcha', stats:'Botín excepcional'};
            } else if (chest && chest.specialId === 'MAGMA_FUMAROLE_CHEST') {
                id = 'MAGMA_FUMAROLE_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.MAGMA.fumarole.chestColor, name:'Cofre de brasa', stats:'Botín excepcional'};
            } else {
                id = 'CHEST'; data = {symbol:'=', color:CONFIG.ENTITIES.chests.colors.closed, name:'Cofre', stats:'Botín'};
            }
"""
assert old in source, 'legend risk chest anchor missing'
source = source.replace(old, new, 1)

old = """        if (FloorSystem.is('MAGMA')) {
            const protectedFromThirst = (Number(FloorSystem.armorTraits().thirstResist) || 0) > 0;
            parts.push(`<span style=\"color:#ff6b35\">MAGMA · SED ${protectedFromThirst ? '↓' : '×2'}</span>`);
        }
"""
new = """        if (FloorSystem.is('MAGMA')) {
            const inFumarole = FloorSystem.isMagmaFumaroleTile(GameState.player.x, GameState.player.y);
            if (inFumarole) {
                parts.push(`<span style=\"color:#ff6b35\">MAGMA · FUMAROLA · -${FloorSystem.magmaRiskWaterCost()} AGUA/T</span>`);
            } else {
                const protectedFromThirst = (Number(FloorSystem.armorTraits().thirstResist) || 0) > 0;
                parts.push(`<span style=\"color:#ff6b35\">MAGMA · SED ${protectedFromThirst ? '↓' : '×2'}</span>`);
            }
        }
"""
assert old in source, 'Magma HUD anchor missing'
source = source.replace(old, new, 1)

GAME.write_text(source, encoding='utf-8')

tests = TESTS.read_text(encoding='utf-8')
anchor = "\n(async () => {\n"
assert anchor in tests, 'test runner anchor missing'
new_tests = r'''

test('Magma genera una Cámara de Fumarola opcional con cofre especial', () => {
    freshGame(2601);
    GameState.level = 6;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();

    const zone = GameState.floor.riskZone;
    assert.ok(zone);
    assert.equal(zone.type, 'MAGMA_FUMAROLE');
    assert.equal(FloorSystem.isMagmaFumaroleTile(GameState.stairs.up.x, GameState.stairs.up.y), false);
    assert.equal(FloorSystem.isMagmaFumaroleTile(GameState.stairs.down.x, GameState.stairs.down.y), false);

    const chest = GameState.entities.chests.find(entry => entry.specialId === 'MAGMA_FUMAROLE_CHEST');
    assert.ok(chest);
    assert.equal(FloorSystem.isMagmaFumaroleTile(chest.x, chest.y), true);
});

test('la Cámara de Fumarola cuesta 2 de agua por turno y la malla térmica lo reduce a 1', () => {
    freshGame(2602);
    GameState.floor = { type: 'MAGMA', riskZone: { type: 'MAGMA_FUMAROLE', x1: 10, y1: 10, x2: 15, y2: 15 } };
    GameState.player.x = 12;
    GameState.player.y = 12;
    GameState.player.equipment.armor = null;
    assert.equal(FloorSystem.magmaRiskWaterCost(), 2);

    GameState.player.equipment.armor = { traits: { heatResist: 0.6, thirstResist: 0.6 } };
    assert.equal(FloorSystem.magmaRiskWaterCost(), 1);

    GameState.player.x = 5;
    GameState.player.y = 5;
    assert.equal(FloorSystem.magmaRiskWaterCost(), 0);
});

test('la supervivencia cobra el agua extra de la Fumarola en cada acción', () => {
    freshGame(2603);
    GameState.floor = { type: 'MAGMA', riskZone: { type: 'MAGMA_FUMAROLE', x1: 10, y1: 10, x2: 15, y2: 15 } };
    GameState.player.x = 12;
    GameState.player.y = 12;
    GameState.player.water = 20;
    GameState.player.food = 20;
    GameState.moves = 1;
    GameState.player.equipment.armor = null;
    GameLogic.processSurvival();
    assert.equal(GameState.player.water, 18);

    GameState.player.water = 20;
    GameState.moves = 1;
    GameState.player.equipment.armor = { traits: { heatResist: 0.6, thirstResist: 0.6 } };
    GameLogic.processSurvival();
    assert.equal(GameState.player.water, 19);
});

test('el cofre de brasa evita trampas, da equipo mejorado y persiste abierto', () => {
    freshGame(2604);
    GameState.level = 6;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.player.hp = 80;
    GameState.player.inventory = [];

    let chestIndex = GameState.entities.chests.findIndex(entry => entry.specialId === 'MAGMA_FUMAROLE_CHEST');
    assert.ok(chestIndex >= 0);
    const chest = GameState.entities.chests[chestIndex];
    const coords = [chest.x, chest.y];
    const originalRandom = Utils.random;
    Utils.random = () => 0;
    try {
        GameLogic.openChest(chestIndex);
        assert.equal(GameState.player.hp, 80);
        assert.equal(chest.isOpen, true);
        assert.equal(GameState.player.inventory.length, 1);
        assert.ok(GameState.player.inventory[0].name.includes('obsidiana'));
        assert.equal(GameState.player.inventory[0].type, 'weapon');
    } finally {
        Utils.random = originalRandom;
    }

    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    const restored = GameState.entities.chests.find(entry => entry.specialId === 'MAGMA_FUMAROLE_CHEST');
    assert.ok(restored);
    assert.deepEqual([restored.x, restored.y], coords);
    assert.equal(restored.isOpen, true);
});
'''
tests = tests.replace(anchor, new_tests + anchor, 1)
TESTS.write_text(tests, encoding='utf-8')
