from pathlib import Path

GAME = Path('game.js')
TESTS = Path('tests/regression.test.cjs')

source = GAME.read_text(encoding='utf-8')

old = """            animationMs: 90,
            colors: { wall: '#25465f', wallVisible: '#6e9fb8', floor: '#bdefff', fog: '#17303f' },"""
new = """            animationMs: 90,
            vault: {
                enabled: true,
                slipChance: 0.70,
                driftChance: 0.45,
                extraStepsMin: 2,
                extraStepsMax: 3,
                rewardBonus: 2,
                tileColor: '#e8fbff',
                tileBackground: '#174d63',
                fogColor: '#31596a',
                chestColor: '#8df3ff'
            },
            colors: { wall: '#25465f', wallVisible: '#6e9fb8', floor: '#bdefff', fog: '#17303f' },"""
assert old in source, 'Frozen config anchor missing'
source = source.replace(old, new, 1)

old = """    getPalette: () => {
        const config = FloorSystem.config();
        return config && config.colors ? config.colors : CONFIG.MAP.colors;
    },
"""
new = old + """    prepareRiskZone: () => {
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
source = source.replace(old, new, 1)

old = """    slipChance: () => {
        if (!FloorSystem.is('FROZEN')) return 0;
        const config = CONFIG.FLOORS.FROZEN;
        const resist = Math.max(0, Math.min(1, Number(FloorSystem.armorTraits().slipResist) || 0));
        return config.slipChance * (1 - resist);
    },
"""
new = """    slipChance: () => {
        if (!FloorSystem.is('FROZEN')) return 0;
        const config = CONFIG.FLOORS.FROZEN;
        const inVault = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y);
        const baseChance = inVault ? config.vault.slipChance : config.slipChance;
        const resist = Math.max(0, Math.min(1, Number(FloorSystem.armorTraits().slipResist) || 0));
        return baseChance * (1 - resist);
    },
"""
assert old in source, 'slipChance anchor missing'
source = source.replace(old, new, 1)

old = """    resolveSlipDirection: (dx, dy) => {
        if (!FloorSystem.is('FROZEN') || Utils.random() >= CONFIG.FLOORS.FROZEN.driftChance) return [dx, dy];
"""
new = """    resolveSlipDirection: (dx, dy) => {
        const config = CONFIG.FLOORS.FROZEN;
        const driftChance = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y) ? config.vault.driftChance : config.driftChance;
        if (!FloorSystem.is('FROZEN') || Utils.random() >= driftChance) return [dx, dy];
"""
assert old in source, 'resolveSlipDirection anchor missing'
source = source.replace(old, new, 1)

old = """    extraSlipSteps: () => {
        const config = CONFIG.FLOORS.FROZEN;
        const span = config.extraStepsMax - config.extraStepsMin + 1;
        return config.extraStepsMin + Math.floor(Utils.random() * span);
    },
"""
new = """    extraSlipSteps: () => {
        const config = CONFIG.FLOORS.FROZEN;
        const inVault = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y);
        const min = inVault ? config.vault.extraStepsMin : config.extraStepsMin;
        const max = inVault ? config.vault.extraStepsMax : config.extraStepsMax;
        const span = max - min + 1;
        return min + Math.floor(Utils.random() * span);
    },
"""
assert old in source, 'extraSlipSteps anchor missing'
source = source.replace(old, new, 1)

old = "MapSystem.generateDungeon(); EntityFactory.spawnAll();"
new = "MapSystem.generateDungeon(); FloorSystem.prepareRiskZone(); EntityFactory.spawnAll();"
assert old in source, 'initLevel generation anchor missing'
source = source.replace(old, new, 1)

old = """        EntityFactory.spawnFloorSpecial();

        if (CONFIG.ENTITIES.shops.levels.includes(GameState.level)) {"""
new = """        EntityFactory.spawnFloorSpecial();
        EntityFactory.spawnRiskReward();

        if (CONFIG.ENTITIES.shops.levels.includes(GameState.level)) {"""
assert old in source, 'spawnAll risk reward anchor missing'
source = source.replace(old, new, 1)

anchor = """    spawnFloorSpecial: () => {
"""
assert anchor in source, 'spawnFloorSpecial anchor missing'
risk_spawn = """    spawnRiskReward: () => {
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
source = source.replace(anchor, risk_spawn + anchor, 1)

old = """        chest.isOpen = true;
        MapSystem.markTaken(`CHEST_${chest.x},${chest.y}`);

        if (Utils.random() < CONFIG.ENTITIES.chests.trapChance) {"""
new = """        chest.isOpen = true;
        MapSystem.markTaken(`CHEST_${chest.x},${chest.y}`);

        if (chest.specialId === 'FROZEN_VAULT_CHEST') {
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
assert old in source, 'openChest special reward anchor missing'
source = source.replace(old, new, 1)

old = """    enterPlayerTile: (x, y) => {
        GameState.player.x = x;
        GameState.player.y = y;
        GameState.player.combat.waitBonus = 0;
        GameState.player.combat.isDefending = false;
        GameLogic.collectItemsAt(x, y);
    },
"""
new = """    enterPlayerTile: (x, y) => {
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
assert old in source, 'enterPlayerTile anchor missing'
source = source.replace(old, new, 1)

old = """                            if (chest) { char = chest.isOpen ? "_" : "="; color = `color:${chest.isOpen ? CONFIG.ENTITIES.chests.colors.open : CONFIG.ENTITIES.chests.colors.closed}; font-weight:bold`; } 
"""
new = """                            if (chest) {
                                const frozenVaultChest = chest.specialId === 'FROZEN_VAULT_CHEST';
                                char = chest.isOpen ? "_" : (frozenVaultChest ? "*" : "=");
                                const closedColor = frozenVaultChest ? CONFIG.FLOORS.FROZEN.vault.chestColor : CONFIG.ENTITIES.chests.colors.closed;
                                color = `color:${chest.isOpen ? CONFIG.ENTITIES.chests.colors.open : closedColor}; font-weight:bold`;
                            } 
"""
assert old in source, 'renderer chest anchor missing'
source = source.replace(old, new, 1)

old = """                    else if (FloorSystem.isCracked(x, y)) { char = "╳"; color = isVis ? 'color:#f0bd7a' : 'color:#5d4532'; }
                    else { char = "."; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
"""
new = """                    else if (FloorSystem.isCracked(x, y)) { char = "╳"; color = isVis ? 'color:#f0bd7a' : 'color:#5d4532'; }
                    else if (FloorSystem.isFrozenVaultTile(x, y)) {
                        const vault = CONFIG.FLOORS.FROZEN.vault;
                        char = "·";
                        color = isVis ? `color:${vault.tileColor}; background:${vault.tileBackground}` : `color:${vault.fogColor}`;
                    }
                    else { char = "."; color = isVis ? `color:${palette.floor}` : `color:${palette.fog}`; }
"""
assert old in source, 'renderer floor anchor missing'
source = source.replace(old, new, 1)

old = """        else if (GameState.entities.chests.some(c => c.x === x && c.y === y)) { 
            id = 'CHEST'; data = {symbol:'=', color:CONFIG.ENTITIES.chests.colors.closed, name:'Cofre', stats:'Botín'}; 
        }
"""
new = """        else if (GameState.entities.chests.some(c => c.x === x && c.y === y)) {
            const chest = GameState.entities.chests.find(c => c.x === x && c.y === y);
            if (chest && chest.specialId === 'FROZEN_VAULT_CHEST') {
                id = 'FROZEN_VAULT_CHEST'; data = {symbol:'*', color:CONFIG.FLOORS.FROZEN.vault.chestColor, name:'Cofre de escarcha', stats:'Botín excepcional'};
            } else {
                id = 'CHEST'; data = {symbol:'=', color:CONFIG.ENTITIES.chests.colors.closed, name:'Cofre', stats:'Botín'};
            }
        }
"""
assert old in source, 'legend chest anchor missing'
source = source.replace(old, new, 1)

old = """        if (FloorSystem.is('FROZEN')) parts.push('<span style=\"color:#8adfff\">HIELO</span>');
"""
new = """        if (FloorSystem.is('FROZEN')) {
            const inVault = FloorSystem.isFrozenVaultTile(GameState.player.x, GameState.player.y);
            parts.push(`<span style=\"color:#8adfff\">${inVault ? 'HIELO · CÁMARA DE ESCARCHA' : 'HIELO'}</span>`);
        }
"""
assert old in source, 'Frozen HUD anchor missing'
source = source.replace(old, new, 1)

GAME.write_text(source, encoding='utf-8')

tests = TESTS.read_text(encoding='utf-8')
anchor = "\n(async () => {\n"
assert anchor in tests, 'test runner anchor missing'
new_tests = r'''

test('Frozen genera una Cámara de Escarcha opcional con cofre especial', () => {
    freshGame(2501);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();

    const zone = GameState.floor.riskZone;
    assert.ok(zone);
    assert.equal(zone.type, 'FROZEN_VAULT');
    assert.equal(FloorSystem.isFrozenVaultTile(GameState.stairs.up.x, GameState.stairs.up.y), false);
    assert.equal(FloorSystem.isFrozenVaultTile(GameState.stairs.down.x, GameState.stairs.down.y), false);

    const chest = GameState.entities.chests.find(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(chest);
    assert.equal(FloorSystem.isFrozenVaultTile(chest.x, chest.y), true);
});

test('la Cámara de Escarcha duplica el riesgo de resbalón y respeta los crampones', () => {
    freshGame(2502);
    GameState.floor = { type: 'FROZEN', riskZone: { type: 'FROZEN_VAULT', x1: 10, y1: 10, x2: 15, y2: 15 } };
    GameState.player.equipment.armor = null;

    GameState.player.x = 5;
    GameState.player.y = 5;
    assert.equal(FloorSystem.slipChance(), 0.35);

    GameState.player.x = 12;
    GameState.player.y = 12;
    assert.equal(FloorSystem.slipChance(), 0.70);

    GameState.player.equipment.armor = { traits: { slipResist: 0.75 } };
    assert.equal(FloorSystem.slipChance(), 0.175);
});

test('el cofre de escarcha nunca usa la trampa normal y entrega equipo mejorado', () => {
    freshGame(2503);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.player.hp = 80;
    GameState.player.inventory = [];

    const chestIndex = GameState.entities.chests.findIndex(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(chestIndex >= 0);
    const originalRandom = Utils.random;
    Utils.random = () => 0;
    try {
        GameLogic.openChest(chestIndex);
        assert.equal(GameState.player.hp, 80);
        assert.equal(GameState.entities.chests[chestIndex].isOpen, true);
        assert.equal(GameState.player.inventory.length, 1);
        assert.ok(GameState.player.inventory[0].name.includes('escarcha'));
        assert.ok(['weapon', 'armor'].includes(GameState.player.inventory[0].type));
    } finally {
        Utils.random = originalRandom;
    }
});

test('el cofre de escarcha permanece abierto al volver a la planta', () => {
    freshGame(2504);
    GameState.level = 3;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    GameState.player.inventory = [];

    let chestIndex = GameState.entities.chests.findIndex(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(chestIndex >= 0);
    const chest = GameState.entities.chests[chestIndex];
    const coords = [chest.x, chest.y];
    const originalRandom = Utils.random;
    Utils.random = () => 0.5;
    try {
        GameLogic.openChest(chestIndex);
    } finally {
        Utils.random = originalRandom;
    }

    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();
    const restored = GameState.entities.chests.find(entry => entry.specialId === 'FROZEN_VAULT_CHEST');
    assert.ok(restored);
    assert.deepEqual([restored.x, restored.y], coords);
    assert.equal(restored.isOpen, true);
});
'''
tests = tests.replace(anchor, new_tests + anchor, 1)
TESTS.write_text(tests, encoding='utf-8')
