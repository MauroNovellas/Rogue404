from pathlib import Path
import re

path = Path('game.js')
text = path.read_text()


def sub_once(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')


# EntityFactory incorpora directamente ocupación, posiciones de cofres y spawn persistente.
sub_once(
    r"const EntityFactory = \{.*?\n\};\n\n// ============================================================================\n// 7\. SISTEMA DE JUEGO PRINCIPAL",
    """const EntityFactory = {
    isOccupied: (x, y) => {
        return GameState.entities.enemies.some(e => e.x === x && e.y === y) ||
               GameState.entities.items.some(i => i.x === x && i.y === y) ||
               GameState.entities.chests.some(c => c.x === x && c.y === y) ||
               GameState.entities.shops.some(s => s.x === x && s.y === y);
    },
    spawnAll: () => {
        const enemyCount = 3 + GameState.level + Math.floor(Utils.random() * 3);
        for (let i = 0; i < enemyCount; i++) EntityFactory.spawnEnemy();

        const spawns = [
            { count: 8, type: 'GOLD', chance: 1.0 },
            { count: 1, type: 'FOOD', chance: 1.0 },
            { count: 1, type: 'WATER', chance: 1.0 },
            { count: 1, type: 'FOOD', chance: CONFIG.ENTITIES.items.foodChance },
            { count: 1, type: 'WATER', chance: CONFIG.ENTITIES.items.drinkChance },
            { count: 1, type: 'WEAPON', chance: (GameState.level % 2 === 0) ? 1.0 : 0 },
            { count: 1, type: 'ARMOR', chance: (GameState.level % 5 === 0) ? 1.0 : 0 }
        ];

        spawns.forEach(spawn => {
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

        if (CONFIG.ENTITIES.shops.levels.includes(GameState.level)) {
            const pos = EntityFactory.getRoomPos();
            if (pos) GameState.entities.shops.push({ x: pos.x, y: pos.y, name: 'Mercader' });
        }

        const chestCount = CONFIG.ENTITIES.chests.minPerLevel + (Utils.random() < CONFIG.ENTITIES.chests.spawnChance ? 1 : 0);
        for (let i = 0; i < chestCount; i++) {
            const pos = EntityFactory.getChestPos();
            if (!pos) continue;
            const chestKey = `CHEST_${pos.x},${pos.y}`;
            GameState.entities.chests.push({
                x: pos.x,
                y: pos.y,
                name: 'Cofre',
                isOpen: MapSystem.isTaken(chestKey)
            });
        }
    },
    spawnEnemy: () => {
        let pos = EntityFactory.getEmptyPos(); if (!pos) return;
        const possible = CONFIG.ENTITIES.enemies.filter(e => e.minLevel <= GameState.level);
        const type = possible.length > 0 ? possible[Math.floor(Utils.random() * possible.length)] : CONFIG.ENTITIES.enemies[0];
        let baseHp = type.hp + (GameState.level * 2); let hpVar = Utils.applyVariance(baseHp);
        let baseAtk = type.atk + Math.floor(GameState.level/2); let atkVar = Utils.applyVariance(baseAtk);
        let name = type.name; if (hpVar.multiplier > 1.3) name += " Alfa"; else if (hpVar.multiplier < 0.8) name += " Enclenque";
        GameState.entities.enemies.push({
            x: pos.x, y: pos.y,
            typeId: type.id,
            behavior: type.behavior,
            name: name, symbol: type.symbol,
            color: (hpVar.multiplier > 1.2 ? '#ff4444' : type.color),
            hp: hpVar.value, maxHp: hpVar.value,
            atk: atkVar.value, xp: type.xp, speed: type.speed,
            energy: 0, isSleeping: Utils.random() < 0.3,
            tookDamage: false
        });
    },
    createSmartItem: (pos, type, baseVal, baseName, symbol, color) => {
        let v = Utils.applyVariance(baseVal);
        GameState.entities.items.push({ x: pos.x, y: pos.y, type: type, name: `${baseName} [${v.label}]`, value: v.value, qualityColor: v.color, symbol: symbol, color: color });
    },
    createItem: (pos, type, val) => { GameState.entities.items.push({ x: pos.x, y: pos.y, type: type, value: val, name: type === 'GOLD' ? 'Oro' : 'Item', symbol: '$', color: '#ffd700' }); },
    getEmptyPos: () => {
        let limit = 500;
        while (limit-- > 0) {
            const x = Math.floor(Utils.random() * (CONFIG.GRID.cols - 2)) + 1;
            const y = Math.floor(Utils.random() * (CONFIG.GRID.rows - 2)) + 1;
            if (GameState.map[y][x] === '.' && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };
        }
        return null;
    },
    getRoomPos: () => {
        if (GameState.rooms.length === 0) return EntityFactory.getEmptyPos();
        let limit = 100;
        while (limit-- > 0) {
            const r = GameState.rooms[Math.floor(Utils.random() * GameState.rooms.length)];
            const x = r.x + Math.floor(Utils.random() * r.w);
            const y = r.y + Math.floor(Utils.random() * r.h);
            if (!MapSystem.isTaken(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };
        }
        return null;
    },
    getChestPos: () => {
        if (GameState.rooms.length === 0) return EntityFactory.getEmptyPos();
        let limit = 100;
        while (limit-- > 0) {
            const r = GameState.rooms[Math.floor(Utils.random() * GameState.rooms.length)];
            const x = r.x + Math.floor(Utils.random() * r.w);
            const y = r.y + Math.floor(Utils.random() * r.h);
            if (!EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };
        }
        return null;
    },
    isStartEnd: (x, y) => { return (x === GameState.stairs.up.x && y === GameState.stairs.up.y) || (x === GameState.stairs.down.x && y === GameState.stairs.down.y); }
};

// ============================================================================
// 7. SISTEMA DE JUEGO PRINCIPAL""",
    'EntityFactory core'
)

# Cofres persistentes: abrir marca la identidad del cofre, no la casilla genérica.
sub_once(
    r"    openChest: \(idx\) => \{.*?\n    \},\n    die:",
    """    openChest: (idx) => {
        const chest = GameState.entities.chests[idx];
        if (!chest || chest.isOpen) return;

        chest.isOpen = true;
        MapSystem.markTaken(`CHEST_${chest.x},${chest.y}`);

        if (Utils.random() < CONFIG.ENTITIES.chests.trapChance) {
            Utils.log('¡TRAMPA! El cofre explota.', '#f00');
            GameState.player.hp -= CONFIG.ENTITIES.chests.trapDmg;
            GameState.entities.enemies.forEach(e => { if (e.isSleeping) e.isSleeping = false; });
            if (GameState.player.hp <= 0) GameLogic.die('Cofre Trampa');
            return;
        }

        Utils.log('Abres el cofre...', CONFIG.ENTITIES.chests.colors.closed);
        const r = Utils.random();
        if (r < 0.3) EntityFactory.createSmartItem({ x: 0, y: 0 }, 'food', CONFIG.ENTITIES.items.foodRestore, 'Comida', '%', '#ffaa00');
        else if (r < 0.5) EntityFactory.createSmartItem({ x: 0, y: 0 }, 'water', CONFIG.ENTITIES.items.drinkRestore, 'Agua', '~', '#00ffff');
        else if (r < 0.7) EntityFactory.createSmartItem({ x: 0, y: 0 }, 'weapon', CONFIG.COMBAT.baseWeaponVal + GameState.level, 'Arma Rara', '!', '#ff00ff');
        else if (r < 0.9) EntityFactory.createSmartItem({ x: 0, y: 0 }, 'armor', CONFIG.COMBAT.baseArmorVal + GameState.level, 'Malla Rara', ']', '#4682b4');

        if (r < 0.9) {
            const newItem = GameState.entities.items.pop();
            InventorySystem.pickup(newItem, -1, -1, -1, true);
        } else {
            GameState.score += 50;
            Utils.log('¡Encuentras oro!', '#ffd700');
        }
    },
    die:""",
    'GameLogic.openChest'
)

# Tirar un objeto no debe reactivar un spawn persistente previamente consumido.
sub_once(
    r"    dropItem: \(idx\) => \{.*?\n    \},\n    openActionMenu:",
    """    dropItem: (idx) => {
        const item = GameState.player.inventory[idx];
        if (!item) return;

        Utils.log(`Tiras ${item.name}`, '#888');
        GameState.entities.items.push({ ...item, x: GameState.player.x, y: GameState.player.y });
        GameState.player.inventory.splice(idx, 1);
        InventorySystem.closeActionMenu();
        Renderer.draw();
        GameLogic.endTurn(true);
    },
    openActionMenu:""",
    'InventorySystem.dropItem'
)

# Retiramos los overrides ya integrados.
removals = [
    (r"\n    // Tirar un objeto no debe borrar el registro de un objeto ya recogido en esa casilla\.\n    InventorySystem\.dropItem = \(idx\) => \{.*?\n    \};\n", 'runtime dropItem override'),
    (r"\n    // Evita que enemigos, objetos, cofres y tiendas aparezcan apilados en la misma casilla\.\n    EntityFactory\.isOccupied = \(x, y\) => \{.*?\n    \};\n\n    EntityFactory\.getEmptyPos = \(\) => \{.*?\n    \};\n\n    EntityFactory\.getRoomPos = \(\) => \{.*?\n    \};\n\n    // Los cofres usan posiciones deterministas sin confundir persistencia con ocupación\.\n    EntityFactory\.getChestPos = \(\) => \{.*?\n    \};\n\n    EntityFactory\.spawnAll = \(\) => \{.*?\n    \};\n", 'runtime EntityFactory overrides'),
    (r"\n    GameLogic\.openChest = \(idx\) => \{.*?\n    \};\n", 'runtime openChest override'),
    (r"\n    // game\.js arranca antes de esta capa; regeneramos inmediatamente con la misma seed para aplicar también los fixes de generación al primer piso\.\n    const bootSeed = GameState\.seed;\n    DOM\.log\.innerHTML = '';\n    GameLogic\.init\(bootSeed\);", 'runtime second bootstrap init'),
]

for pattern, label in removals:
    text, count = re.subn(pattern, '', text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 removal, got {count}')

path.write_text(text)
