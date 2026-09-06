// game.js - VERSIÓN CORREGIDA: Input calmado, Log limpio y Corrección de Bugs

// ============================================================================
// 1. CONFIGURACIÓN
// ============================================================================
const CONFIG = {
    GRID: { cols: 70, rows: 24 },
    MAP: {
        maxRooms: 28, minRoomSize: 6, maxRoomSize: 14, viewRadius: 9,
        colors: { wall: '#222', wallVisible: '#444', floor: '#888', fog: '#222' }
    },
    PLAYER: {
        startHP: 100, startFood: 100, startWater: 100, baseAtk: 3, inventorySize: 6,
        survival: { hungerRate: 10, thirstRate: 6, starvationDmg: 2, dehydrationDmg: 3 },
        leveling: { baseXp: 100, xpScaling: 1.5, statGain: { hp: 10, atk: 2 } }
    },
    COMBAT: {
        variability: 0.2, critChance: 0.10, critMult: 1.5, baseWeaponVal: 2, baseArmorVal: 1,
        // Configuración de Habilidades
        quick:  { dmgMult: 0.8,  var: 0.05, critBonus: 0,   label: "Rápido" },
        savage: { dmgMult: 1.4,  var: 0.40, critBonus: 0.2, label: "Salvaje" },
        area:   { dmgMult: 0.5,  cooldown: 5, cost: 5,      label: "Barrido" },
        wait:   { atkBonus: 2 }, // Daño extra al siguiente turno tras esperar
        defend: { defMult: 1.5 } // Multiplicador defensa
    },
    VARIANCE: {
        enabled: true, min: 0.5, max: 2.0,
        tiers: [
            { label: "PÉSIMO",    threshold: 0.65, color: "#777777" },
            { label: "MALO",      threshold: 0.85, color: "#aaaaaa" },
            { label: "MEDIOCRE",  threshold: 0.95, color: "#ffffff" },
            { label: "NORMAL",    threshold: 1.05, color: "#ffffff" },
            { label: "BUENO",     threshold: 1.25, color: "#00ff00" },
            { label: "EXCELENTE", threshold: 1.60, color: "#0088ff" },
            { label: "ÉPICO",     threshold: 9.99, color: "#ff00ff" }
        ]
    },
    ENTITIES: {
        enemies: [
            // Behavior: 'ERRATIC' (Murciélago), 'COWARD' (Goblin), 'REGEN' (Trasgo/Troll)
            { id: 'BAT',    name: 'Murciélago', symbol: 'M', color: '#a64dff', minLevel: 1, hp: 5,  atk: 2,  xp: 10, speed: 1.0, behavior: 'ERRATIC' },
            { id: 'GOBLIN', name: 'Goblin',     symbol: 'G', color: '#00ff00', minLevel: 3, hp: 15, atk: 5,  xp: 25, speed: 1.0, behavior: 'COWARD' },
            { id: 'TROLL',  name: 'Trasgo',     symbol: 'T', color: '#0088ff', minLevel: 5, hp: 40, atk: 12, xp: 60, speed: 1.0, behavior: 'REGEN' }
        ],
        items: { foodChance: 0.4, drinkChance: 0.5, foodRestore: 40, drinkRestore: 30 },
        chests: { spawnChance: 0.3, minPerLevel: 1, trapChance: 0.15, trapDmg: 15, colors: { closed: '#DAA520', open: '#555' } },
        shops: {
            levels: [3, 6, 9, 12], priceMultiplier: 1.0,
            inventory: [
                { id: 'WEAPON', name: 'Espada',      type: 'weapon', value: 3,  price: 200, icon: '!', color: '#ff00ff' },
                { id: 'ARMOR',  name: 'Malla',       type: 'armor',  value: 2,  price: 200, icon: ']', color: '#4682b4' },
                { id: 'FOOD',   name: 'Ración',      type: 'food',   value: 50, price: 100, icon: '%', color: '#ffaa00' },
                { id: 'WATER',  name: 'Cantimplora', type: 'water',  value: 50, price: 100, icon: '~', color: '#00ffff' }
            ]
        }
    }
};

// ============================================================================
// 2. GESTIÓN DEL ESTADO
// ============================================================================
const STATE_ENUM = {
    PLAYING: 'PLAYING', CONTROLS: 'CONTROLS', INVENTORY: 'INVENTORY',
    MENU: 'MENU', SHOP: 'SHOP', GAMEOVER: 'GAMEOVER',
    TARGETING: 'TARGETING'
};

const GameState = {
    current: STATE_ENUM.CONTROLS,
    seed: 0, rng: null, level: 1, maxLevel: 1, score: 0, moves: 0,
    entryMethod: 'start', deathCause: "Desconocido",
    map: [], seen: [], visible: [], rooms: [],
    stairs: { up: {x:0, y:0}, down: {x:0, y:0} },
    persistence: {}, discoveredTypes: new Set(),
    entities: { enemies: [], items: [], chests: [], shops: [] },
    player: {
        x: 0, y: 0, hp: 0, maxHp: 0, food: 0, water: 0,
        level: 1, xp: 0, nextXp: 0, baseAtk: 0,
        inventory: [], equipment: { weapon: null, armor: null },
        stats: { kills: {}, maxWeapon: {val:0, name:'Nada'}, maxArmor: {val:0, name:'Nada'} },
        combat: {
            isDefending: false,
            waitBonus: 0,
            cooldowns: { area: 0 },
            pendingAttack: null
        }
    },
    ui: {
        inventoryIndex: 0,
        actionMenuOpen: false,
        actionIndex: 0,
        currentActions: [],
        shopStock: [],
        messageBuffer: []
    }
};

const DOM = {
    container: document.getElementById('game-container'),
    log: document.getElementById('log'),
    menus: {
        controls: document.getElementById('controls-menu'),
        inventory: document.getElementById('inventory-menu'),
        main: document.getElementById('game-menu'),
        shop: document.getElementById('shop-menu'),
        gameOver: document.getElementById('game-over'),
        victory: document.getElementById('victory-screen'),
        action: document.getElementById('action-menu')
    }
};

// ============================================================================
// 3. UTILIDADES CORE (LOG CORREGIDO)
// ============================================================================
const Utils = {
    mulberry32: (a) => { return function() { var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } },
    random: () => GameState.rng ? GameState.rng() : Math.random(),
    
    // [LOG GHOST STYLE]
    log: (msg, color="#ccc") => { 
        // Evitamos spam idéntico consecutivo rápido
        const lastMsg = DOM.log.firstElementChild;
        if (lastMsg && lastMsg.innerText === msg && lastMsg.style.opacity > 0.5) {
             // Pequeño efecto de "pulso" si se repite
             lastMsg.style.transform = "scale(1.1)";
             setTimeout(() => lastMsg.style.transform = "scale(1)", 100);
             return;
        }

        const div = document.createElement('div');
        div.innerHTML = `<span style="color:${color}">${msg}</span>`;
        DOM.log.prepend(div); // Insertar arriba (visual abajo por flex-reverse)
        
        // Mantener limpio el DOM (max 6 mensajes)
        if (DOM.log.children.length > 6) DOM.log.lastElementChild.remove();
        
        // Auto-desvanecer a los 4 segundos
        setTimeout(() => {
            if(div.parentNode) {
                div.style.transition = "opacity 1s";
                div.style.opacity = "0";
                setTimeout(() => div.remove(), 1000);
            }
        }, 4000);
    },

    applyVariance: (baseValue) => {
        if (!CONFIG.VARIANCE.enabled) return { value: baseValue, label: "NORMAL", color: "#fff", multiplier: 1 };
        const rand = (Utils.random() + Utils.random()) / 2;
        const multiplier = CONFIG.VARIANCE.min + (rand * (CONFIG.VARIANCE.max - CONFIG.VARIANCE.min));
        let newValue = Math.round(baseValue * multiplier);
        if (newValue < 1) newValue = 1;
        let tier = CONFIG.VARIANCE.tiers.find(t => multiplier <= t.threshold) || CONFIG.VARIANCE.tiers[CONFIG.VARIANCE.tiers.length - 1];
        return { value: newValue, label: tier.label, color: tier.color, multiplier: multiplier };
    }
};

const VisualFX = { // SISTEMA DE EFECTOS VISUALES (NUEVO)
    floatText: (x, y, text, color) => {
        const el = document.createElement('div');
        el.className = 'float-msg';
        el.innerText = text;
        el.style.color = color;
        
        // CALCULO MÁGICO DE POSICIÓN:
        // Asumiendo font-size: 20px en game-container y padding: 15px
        // 1ch es el ancho de un caracter (aprox 12px en courier 20px)
        // Usamos unidades relativas para que cuadre perfecto
        
        // Ajuste manual: 15px de padding + x * 0.6em (aprox ancho char)
        el.style.left = `calc(15px + ${x} * 0.6em)`; 
        el.style.top = `calc(15px + ${y} * 1.0em)`; 
        
        document.getElementById('fx-layer').appendChild(el);
        setTimeout(() => el.remove(), 1000); // Auto destruir
    }
};

// ============================================================================
// 4. NETWORK (API PHP)
// ============================================================================
const Network = {
    fetchScores: async (targetId) => {
        const target = document.getElementById(targetId);
        if(!target) return;
        target.innerHTML = "Cargando...";
        try {
            const r = await fetch('/404/rogue_api.php?v=' + Date.now());
            const d = await r.json();
            Network.renderLeaderboard(d, targetId);
        } catch (e) { console.error(e); target.innerHTML = "Offline o Error de Conexión"; }
    },
    saveScore: async () => {
        const nameInput = document.getElementById('player-name').value || document.getElementById('winner-name').value || "UNK";
        const name = nameInput.toUpperCase();
        let killsStr = Object.entries(GameState.player.stats.kills).map(([k,v]) => `${v} ${k}`).join(", ") || "Ninguna";
        let gearStr = `Arma: ${GameState.player.stats.maxWeapon.name} | Malla: ${GameState.player.stats.maxArmor.name}`;
        try {
            const r = await fetch('/404/rogue_api.php', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, score: GameState.score, level: GameState.maxLevel, seed: GameState.seed, cause: GameState.deathCause, kills: killsStr, equipment: gearStr })
            });
            if (!r.ok) throw new Error("Error en servidor");
            const d = await r.json();
            Network.renderLeaderboard(d, 'leaderboard'); Network.renderLeaderboard(d, 'victory-leaderboard');
            Utils.log("¡Legado guardado!", "#ffd700"); setTimeout(GameLogic.init, 2000);
        } catch (e) { console.error(e); alert("Error guardando datos."); }
    },
    renderLeaderboard: (data, targetId) => {
        let h = "<table><tr><th>NOM</th><th>LVL</th><th>ORO</th><th>CAUSA</th><th>FECHA</th></tr>";
        if (Array.isArray(data)) {
            data.forEach((e) => {
                let date = e.date || "--/--"; let lvl = e.level || 1; let cause = e.cause || "Desconocido";
                const detalles = `Equipo: ${e.equipment || 'Ninguno'}\nBajas: ${e.kills || 'Ninguna'}`;
                h += `<tr title="${detalles}"><td>${e.name}</td><td style='text-align:center'>${lvl}</td><td style='text-align:right; color:#ffd700'>${e.score}</td><td style='color:#aaa; font-style:italic'>${cause}</td><td style='text-align:right; font-size:0.8em'>${date}</td></tr>`;
            });
        } h += "</table>"; const target = document.getElementById(targetId); if(target) target.innerHTML = h;
    }
};

// ============================================================================
// 5. SISTEMA DE MAPA Y GENERACIÓN
// ============================================================================
const MapSystem = {
    initLevel: () => {
        GameState.rng = Utils.mulberry32(GameState.seed + GameState.level);
        if (GameState.level > GameState.maxLevel) GameState.maxLevel = GameState.level;
        GameState.map = []; GameState.seen = []; GameState.visible = []; GameState.rooms = [];
        GameState.entities = { enemies: [], items: [], chests: [], shops: [] };
        if (!GameState.persistence[GameState.level]) GameState.persistence[GameState.level] = [];
        for(let y=0; y<CONFIG.GRID.rows; y++) {
            GameState.seen.push(new Array(CONFIG.GRID.cols).fill(false));
            GameState.visible.push(new Array(CONFIG.GRID.cols).fill(false));
            GameState.map.push(new Array(CONFIG.GRID.cols).fill('#'));
        }
        MapSystem.generateDungeon(); EntityFactory.spawnAll();
        const stairs = GameState.entryMethod === 'descending' ? GameState.stairs.up : GameState.stairs.down;
        GameState.player.x = stairs.x; GameState.player.y = stairs.y;
        GameState.player.combat = { isDefending: false, waitBonus: 0, cooldowns: { area: 0 }, pendingAttack: null };
        MapSystem.updateFog(); Renderer.draw(); UISystem.updateHUD();
        Utils.log(`Profundidad -${GameState.level}`, "#fff");
    },
    generateDungeon: () => {
        for (let i = 0; i < CONFIG.MAP.maxRooms; i++) {
            let w = Math.floor(Utils.random() * (CONFIG.MAP.maxRoomSize - CONFIG.MAP.minRoomSize + 1)) + CONFIG.MAP.minRoomSize;
            let h = Math.floor(Utils.random() * (CONFIG.MAP.maxRoomSize - CONFIG.MAP.minRoomSize + 1)) + CONFIG.MAP.minRoomSize;
            let x = Math.floor(Utils.random() * (CONFIG.GRID.cols - w - 2)) + 1;
            let y = Math.floor(Utils.random() * (CONFIG.GRID.rows - h - 2)) + 1;
            let newRoom = { x, y, w, h, center: {x: Math.floor(x+w/2), y: Math.floor(y+h/2)} };
            let failed = GameState.rooms.some(other => newRoom.x <= other.x + other.w && newRoom.x + newRoom.w >= other.x && newRoom.y <= other.y + other.h && newRoom.y + newRoom.h >= other.y);
            if (!failed) {
                MapSystem.carveRoom(newRoom);
                if (GameState.rooms.length > 0) {
                    let prev = GameState.rooms[GameState.rooms.length - 1];
                    if (Utils.random() > 0.5) { MapSystem.carveHCorridor(prev.center.x, newRoom.center.x, prev.center.y); MapSystem.carveVCorridor(prev.center.y, newRoom.center.y, newRoom.center.x); } 
                    else { MapSystem.carveVCorridor(prev.center.y, newRoom.center.y, prev.center.x); MapSystem.carveHCorridor(prev.center.x, newRoom.center.x, newRoom.center.y); }
                } GameState.rooms.push(newRoom);
            }
        }
        if (GameState.rooms.length > 0) {
            GameState.stairs.up = { x: GameState.rooms[0].center.x, y: GameState.rooms[0].center.y };
            let last = GameState.rooms[GameState.rooms.length - 1];
            GameState.stairs.down = { x: last.center.x, y: last.center.y };
        }
    },
    carveRoom: (r) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) GameState.map[y][x] = '.'; },
    carveHCorridor: (x1, x2, y) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) GameState.map[y][x] = '.'; },
    carveVCorridor: (y1, y2, x) => { for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) GameState.map[y][x] = '.'; },
    updateFog: () => {
        for(let y=0; y<CONFIG.GRID.rows; y++) GameState.visible[y].fill(false);
        const px = GameState.player.x, py = GameState.player.y;
        GameState.visible[py][px] = true; GameState.seen[py][px] = true;
        for (let i = 0; i < 360; i += 0.5) {
            let angle = i * (Math.PI / 180);
            let dx = Math.cos(angle), dy = Math.sin(angle);
            let x = px + 0.5, y = py + 0.5;
            for (let j = 0; j < CONFIG.MAP.viewRadius; j++) {
                x += dx; y += dy;
                let mx = Math.floor(x), my = Math.floor(y);
                if (mx < 0 || mx >= CONFIG.GRID.cols || my < 0 || my >= CONFIG.GRID.rows) break;
                GameState.visible[my][mx] = true; GameState.seen[my][mx] = true;
                if (GameState.map[my][mx] === '#') break;
            }
        }
    },
    isBlocked: (x, y) => { if (x < 0 || x >= CONFIG.GRID.cols || y < 0 || y >= CONFIG.GRID.rows) return true; return GameState.map[y][x] === '#'; },
    isTaken: (keyOrX, y) => { let key = (y !== undefined) ? `${keyOrX},${y}` : keyOrX; return GameState.persistence[GameState.level].includes(key); },
    markTaken: (keyOrX, y) => { let key = (y !== undefined) ? `${keyOrX},${y}` : keyOrX; if (!GameState.persistence[GameState.level].includes(key)) GameState.persistence[GameState.level].push(key); },
    freePosition: (x, y) => { let key = `${x},${y}`; const idx = GameState.persistence[GameState.level].indexOf(key); if (idx > -1) GameState.persistence[GameState.level].splice(idx, 1); }
};

// ============================================================================
// 6. FACTORÍA DE ENTIDADES (CORREGIDO BUG DE COFRES)
// ============================================================================
const EntityFactory = {
    spawnAll: () => {
        let count = 3 + GameState.level + Math.floor(Utils.random() * 3);
        for(let i=0; i<count; i++) EntityFactory.spawnEnemy();
        const spawns = [
            { count: 8, type: 'GOLD', chance: 1.0 }, { count: 1, type: 'FOOD', chance: 1.0 }, { count: 1, type: 'WATER', chance: 1.0 },
            { count: 1, type: 'FOOD', chance: CONFIG.ENTITIES.items.foodChance }, { count: 1, type: 'WATER', chance: CONFIG.ENTITIES.items.drinkChance },
            { count: 1, type: 'WEAPON', chance: (GameState.level % 2 === 0) ? 1.0 : 0 }, { count: 1, type: 'ARMOR', chance: (GameState.level % 5 === 0) ? 1.0 : 0 }
        ];
        spawns.forEach(s => {
            if(Utils.random() < s.chance) {
                for(let k=0; k<s.count; k++) {
                    let pos = EntityFactory.getEmptyPos(); if(!pos || MapSystem.isTaken(pos.x, pos.y)) continue;
                    if (s.type === 'GOLD') EntityFactory.createItem(pos, 'GOLD', 10);
                    else if (s.type === 'FOOD') EntityFactory.createSmartItem(pos, 'food', CONFIG.ENTITIES.items.foodRestore, 'Comida', '%', '#ffaa00');
                    else if (s.type === 'WATER') EntityFactory.createSmartItem(pos, 'water', CONFIG.ENTITIES.items.drinkRestore, 'Agua', '~', '#00ffff');
                    else if (s.type === 'WEAPON') EntityFactory.createSmartItem(pos, 'weapon', CONFIG.COMBAT.baseWeaponVal, 'Arma', '!', '#ff00ff');
                    else if (s.type === 'ARMOR') EntityFactory.createSmartItem(pos, 'armor', CONFIG.COMBAT.baseArmorVal, 'Malla', ']', '#4682b4');
                }
            }
        });
        if (CONFIG.ENTITIES.shops.levels.includes(GameState.level)) { let p = EntityFactory.getRoomPos(); if(p) GameState.entities.shops.push({ x: p.x, y: p.y, name: "Mercader" }); }
        
        let chestCount = CONFIG.ENTITIES.chests.minPerLevel + (Utils.random() < CONFIG.ENTITIES.chests.spawnChance ? 1 : 0);
        for(let i=0; i<chestCount; i++) { 
            let p = EntityFactory.getRoomPos(); 
            // [FIX] Comprobamos que no esté ocupado Y lo marcamos como ocupado
            if(p && !MapSystem.isTaken(p.x, p.y)) {
                GameState.entities.chests.push({ x: p.x, y: p.y, name: "Cofre", isOpen: false });
                MapSystem.markTaken(p.x, p.y); // <-- IMPORTANTE
            }
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
        while(limit-- > 0) {
            let x = Math.floor(Utils.random() * (CONFIG.GRID.cols-2)) + 1; let y = Math.floor(Utils.random() * (CONFIG.GRID.rows-2)) + 1;
            if (GameState.map[y][x] === '.' && !EntityFactory.isStartEnd(x,y)) return {x,y};
        } return null;
    },
    getRoomPos: () => {
        if (GameState.rooms.length === 0) return EntityFactory.getEmptyPos();
        let limit = 100;
        while(limit-- > 0) {
            let r = GameState.rooms[Math.floor(Utils.random() * GameState.rooms.length)]; let x = r.x + Math.floor(Utils.random() * r.w); let y = r.y + Math.floor(Utils.random() * r.h);
            if (!MapSystem.isTaken(x, y) && !EntityFactory.isStartEnd(x,y)) return {x,y};
        } return null;
    },
    isStartEnd: (x, y) => { return (x === GameState.stairs.up.x && y === GameState.stairs.up.y) || (x === GameState.stairs.down.x && y === GameState.stairs.down.y); }
};

// ============================================================================
// 7. SISTEMA DE JUEGO PRINCIPAL
// ============================================================================
const GameLogic = {
    init: (seedInput = null) => {
        GameState.seed = seedInput !== null ? seedInput : Math.floor(Math.random() * 999999);
        GameState.level = 1; GameState.score = 0; GameState.moves = 0; GameState.maxLevel = 1;
        const pConf = CONFIG.PLAYER;
        GameState.player = {
            ...GameState.player, hp: pConf.startHP, maxHp: pConf.startHP, food: pConf.startFood, water: pConf.startWater,
            level: 1, xp: 0, nextXp: pConf.leveling.baseXp, baseAtk: pConf.baseAtk, inventory: [],
            equipment: { weapon: null, armor: null }, stats: { kills: {}, maxWeapon: {val:0, name:'Nada'}, maxArmor: {val:0, name:'Nada'} },
            combat: { isDefending: false, waitBonus: 0, cooldowns: { area: 0 }, pendingAttack: null }
        };
        GameState.persistence = {}; GameState.discoveredTypes.clear(); Renderer.resetLegend();
        MapSystem.initLevel(); StateController.change(STATE_ENUM.CONTROLS);
    },
    endTurn: (didAction = true) => {
        if (!didAction) return;
        if (!GameState.player.combat.isDefending) GameState.player.combat.isDefending = false;
        if (GameState.player.combat.cooldowns.area > 0) GameState.player.combat.cooldowns.area--;

        GameLogic.updateEnemies();
        GameLogic.processSurvival();
        
        MapSystem.updateFog();
        Renderer.draw();
        UISystem.updateHUD();
    },
    movePlayer: (dx, dy) => {
        let nx = GameState.player.x + dx; let ny = GameState.player.y + dy;
        
        // 1. Chequeo de Muros
        if (MapSystem.isBlocked(nx, ny)) return false;
        
        // 2. Chequeo de Tiendas
        if (GameState.entities.shops.some(s => s.x === nx && s.y === ny)) { ShopSystem.open(); return false; }
        
        // 3. Chequeo de Cofres
        let chest = GameState.entities.chests.find(c => c.x === nx && c.y === ny);
        if (chest) { if (!chest.isOpen) Utils.log("Cofre cerrado. Presiona ESPACIO.", CONFIG.ENTITIES.chests.colors.closed); else Utils.log("Cofre vacío.", "#777"); return false; }
        
        // 4. Chequeo de Enemigos → Bump Attack (forma natural de pelear)
        let enemy = GameState.entities.enemies.find(e => e.x === nx && e.y === ny);
        if (enemy) { 
            CombatSystem.bumpAttack(enemy);
            GameLogic.endTurn(true);
            return false; 
        }

        // --- MOVIMIENTO REALIZADO ---
        GameState.player.x = nx; GameState.player.y = ny;
        GameState.player.combat.waitBonus = 0; 
        GameState.player.combat.isDefending = false; 

        // 5. RECOGER ITEMS (AQUÍ ES DONDE VA EL CÓDIGO NUEVO)
        for(let i = GameState.entities.items.length - 1; i >= 0; i--) {
            let item = GameState.entities.items[i];
            if (item.x === nx && item.y === ny) {
                if (item.type === 'GOLD') { 
                    GameState.score += item.value; 
                    
                    // --- NUEVO: EFECTO VISUAL ---
                    VisualFX.floatText(nx, ny, `+$${item.value}`, "#ffd700"); 
                    // ----------------------------
                    
                    Utils.log("¡Oro!", "#ffd700"); 
                    GameState.entities.items.splice(i, 1); 
                    MapSystem.markTaken(nx, ny); 
                }
                else { 
                    // Nota: También puedes añadir FX aquí si quieres ver el nombre del item flotando
                    // VisualFX.floatText(nx, ny, item.name, item.color);
                    InventorySystem.pickup(item, i, nx, ny); 
                }
            }
        }
        
        GameLogic.endTurn(true);
        return true;
    },
    updateEnemies: () => {
        GameState.entities.enemies.forEach(e => {
            e.tookDamage = false; 
            let dist = Math.max(Math.abs(GameState.player.x - e.x), Math.abs(GameState.player.y - e.y));
            if (e.isSleeping) { if (dist <= 3) { e.isSleeping = false; Utils.log(`${e.name} despierta!`, "#ff8800"); } else { if(e.hp < e.maxHp && Utils.random() < 0.1) e.hp++; return; } }
            
            e.energy += e.speed; let actions = 0;
            while(e.energy >= 1.0 && actions < 5) {
                e.energy -= 1.0; actions++;
                dist = Math.max(Math.abs(GameState.player.x - e.x), Math.abs(GameState.player.y - e.y));
                
                if (dist <= 1) { 
                    if (e.behavior === 'COWARD' && e.hp < e.maxHp * 0.3) {
                         if(!GameLogic.moveEnemyAway(e)) CombatSystem.enemyAttack(e); 
                    } else {
                        CombatSystem.enemyAttack(e); 
                    }
                    continue; 
                }

                if (dist < 10) {
                    if (e.behavior === 'ERRATIC' && Utils.random() < 0.5) { GameLogic.moveEnemyRandom(e); } 
                    else if (e.behavior === 'COWARD' && e.hp < e.maxHp * 0.3) { GameLogic.moveEnemyAway(e); }
                    else { GameLogic.moveEnemyTowards(e, GameState.player.x, GameState.player.y); }
                }
            }
            if (e.behavior === 'REGEN' && !e.tookDamage && e.hp < e.maxHp) { e.hp += 1; }
        });
    },
    moveEnemyTowards: (e, targetX, targetY) => {
        let bestMove = null; let minD = 999; 
        const moves = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
        moves.sort(() => Utils.random() - 0.5);
        for(let m of moves) {
            let tx = e.x + m[0], ty = e.y + m[1];
            if (GameLogic.isValidEnemyMove(tx, ty)) { 
                let d = Math.max(Math.abs(targetX - tx), Math.abs(targetY - ty)); 
                if (d < minD) { minD = d; bestMove = {x:tx, y:ty}; } 
            }
        }
        if (bestMove) { e.x = bestMove.x; e.y = bestMove.y; }
    },
    moveEnemyAway: (e) => {
        let bestMove = null; let maxD = -1;
        const moves = [[0,1],[0,-1],[1,0],[-1,0]]; 
        for(let m of moves) {
            let tx = e.x + m[0], ty = e.y + m[1];
            if (GameLogic.isValidEnemyMove(tx, ty)) {
                let d = Math.abs(GameState.player.x - tx) + Math.abs(GameState.player.y - ty);
                if (d > maxD) { maxD = d; bestMove = {x:tx, y:ty}; }
            }
        }
        if (bestMove) { e.x = bestMove.x; e.y = bestMove.y; return true; }
        return false;
    },
    moveEnemyRandom: (e) => {
        const moves = [[0,1],[0,-1],[1,0],[-1,0]];
        let valid = moves.filter(m => GameLogic.isValidEnemyMove(e.x + m[0], e.y + m[1]));
        if (valid.length > 0) {
            let m = valid[Math.floor(Utils.random() * valid.length)];
            e.x += m[0]; e.y += m[1];
        }
    },
    isValidEnemyMove: (x, y) => {
        if (MapSystem.isBlocked(x, y)) return false;
        if (x === GameState.player.x && y === GameState.player.y) return false;
        if (GameState.entities.enemies.some(e => e.x === x && e.y === y)) return false;
        if (GameState.entities.shops.some(s => s.x === x && s.y === y)) return false;
        if (GameState.entities.chests.some(c => c.x === x && c.y === y)) return false;
        return true;
    },
    processSurvival: () => {
        const s = CONFIG.PLAYER.survival; GameState.moves++;
        if (GameState.moves % s.hungerRate === 0) GameState.player.food--;
        if (GameState.moves % s.thirstRate === 0) GameState.player.water--;
        if (GameState.player.food <= 0) { GameState.player.food = 0; GameState.player.hp -= s.starvationDmg; if(GameState.player.hp <= 0) GameLogic.die("Hambre"); }
        if (GameState.player.water <= 0) { GameState.player.water = 0; GameState.player.hp -= s.dehydrationDmg; if(GameState.player.hp <= 0) GameLogic.die("Sed"); }
    },
    interactAction: () => {
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        for(let d of dirs) {
            let tx = GameState.player.x + d[0], ty = GameState.player.y + d[1];
            let chestIdx = GameState.entities.chests.findIndex(c => c.x === tx && c.y === ty && !c.isOpen);
            if (chestIdx !== -1) { GameLogic.openChest(chestIdx); GameLogic.endTurn(true); return; }
        }
        if (GameState.player.x === GameState.stairs.down.x && GameState.player.y === GameState.stairs.down.y) { GameState.level++; GameState.entryMethod = 'descending'; MapSystem.initLevel(); }
        else if (GameState.player.x === GameState.stairs.up.x && GameState.player.y === GameState.stairs.up.y) { if (GameState.level === 1) GameLogic.win(); else { GameState.level--; GameState.entryMethod = 'ascending'; MapSystem.initLevel(); } }
        else {
            if (GameState.player.food > 0 && GameState.player.water > 0) { GameState.player.hp = Math.min(GameState.player.hp + 2, GameState.player.maxHp); Utils.log("Descansas..."); GameLogic.endTurn(true); }
            else { Utils.log("¡Demasiada hambre para descansar!", "#f00"); }
        }
    },
    openChest: (idx) => {
        let chest = GameState.entities.chests[idx]; chest.isOpen = true;
        if (Utils.random() < CONFIG.ENTITIES.chests.trapChance) {
            Utils.log("¡TRAMPA! El cofre explota.", "#f00"); GameState.player.hp -= CONFIG.ENTITIES.chests.trapDmg;
            GameState.entities.enemies.forEach(e => { if(e.isSleeping) e.isSleeping = false; });
            if (GameState.player.hp <= 0) GameLogic.die("Cofre Trampa");
        } else {
            Utils.log("Abres el cofre...", CONFIG.ENTITIES.chests.colors.closed);
            let r = Utils.random();
            if (r < 0.3) EntityFactory.createSmartItem({x:0,y:0}, 'food', CONFIG.ENTITIES.items.foodRestore, 'Comida', '%', '#ffaa00');
            else if (r < 0.5) EntityFactory.createSmartItem({x:0,y:0}, 'water', CONFIG.ENTITIES.items.drinkRestore, 'Agua', '~', '#00ffff');
            else if (r < 0.7) EntityFactory.createSmartItem({x:0,y:0}, 'weapon', CONFIG.COMBAT.baseWeaponVal + GameState.level, 'Arma Rara', '!', '#ff00ff');
            else if (r < 0.9) EntityFactory.createSmartItem({x:0,y:0}, 'armor', CONFIG.COMBAT.baseArmorVal + GameState.level, 'Malla Rara', ']', '#4682b4');
            if (r < 0.9) { let newItem = GameState.entities.items.pop(); InventorySystem.pickup(newItem, -1, -1, -1, true); }
            else { GameState.score += 50; Utils.log("¡Encuentras oro!", "#ffd700"); }
        }
    },
    die: (cause) => {
        GameState.deathCause = cause;
        StateController.change(STATE_ENUM.GAMEOVER);
        UISystem.fillEndGameStats('death'); 
        Network.fetchScores('leaderboard');
    },
    win: () => {
        GameState.deathCause = "Vio la luz"; GameState.score += (GameState.maxLevel * 100);
        StateController.change(STATE_ENUM.GAMEOVER); DOM.menus.gameOver.classList.add('hidden'); DOM.menus.victory.classList.remove('hidden');
        UISystem.fillEndGameStats('win');
        Network.fetchScores('victory-leaderboard');
    }
};

// ============================================================================
// 8. COMBATE (CORREGIDO BUG DE ÍNDICES)
// ============================================================================

const CombatSystem = {
    startTargeting: (attackType) => {
        if (attackType === 'area' && GameState.player.combat.cooldowns.area > 0) {
            Utils.log(`Habilidad en enfriamiento (${GameState.player.combat.cooldowns.area} turnos)`, "#f00");
            return;
        }
        GameState.player.combat.pendingAttack = attackType;
        StateController.change(STATE_ENUM.TARGETING);
        let label = attackType === 'quick' ? "Rápido" : (attackType === 'savage' ? "Salvaje" : "Barrido");
        Utils.log(`[${label}] Selecciona dirección...`, "#0ff");
        UISystem.updateHUD(); 
    },

    executeAttack: (dx, dy) => {
        StateController.change(STATE_ENUM.PLAYING);
        const type = GameState.player.combat.pendingAttack;
        GameState.player.combat.pendingAttack = null;
        
        let tx = GameState.player.x + dx; let ty = GameState.player.y + dy;
        let enemyIdx = GameState.entities.enemies.findIndex(e => e.x === tx && e.y === ty);
        
        let bonusDmg = GameState.player.combat.waitBonus;
        GameState.player.combat.waitBonus = 0; 
        GameState.player.combat.isDefending = false;

        // BARRIDO (Area)
        if (type === 'area') {
            Utils.log("¡Ataque de barrido!", "#0ff");
            GameState.player.combat.cooldowns.area = CONFIG.COMBAT.area.cooldown;
            const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
            let hit = false;
            dirs.forEach(d => {
                let ex = GameState.player.x + d[0], ey = GameState.player.y + d[1];
                let idx = GameState.entities.enemies.findIndex(e => e.x === ex && e.y === ey);
                if (idx !== -1) {
                    CombatSystem.applyDamage(idx, 'area', bonusDmg);
                    hit = true;
                }
            });
            if(!hit) Utils.log("El barrido no golpea nada.", "#777");
            GameLogic.endTurn(true);
            return;
        }

        // ATAQUES DIRECCIONALES
        if (enemyIdx === -1) {
            Utils.log("Ataque fallido: No hay objetivo.", "#777");
            GameLogic.endTurn(true);
            return;
        }

        // [FIX] Guardamos la referencia porque si muere, el índice cambia
        let targetEnemy = GameState.entities.enemies[enemyIdx];

        CombatSystem.applyDamage(enemyIdx, type, bonusDmg);
        
        if (type === 'savage') {
             // Usamos la referencia guardada para verificar vida
             if (targetEnemy && targetEnemy.hp > 0) {
                 Utils.log("¡El ataque salvaje provoca un contraataque!", "#fa0");
                 CombatSystem.enemyAttack(targetEnemy);
             }
        }
        
        GameLogic.endTurn(true);
    },

    applyDamage: (enemyIdx, type, bonus) => {
        let e = GameState.entities.enemies[enemyIdx];
        if (!e) return;
        
        e.tookDamage = true; 
        if (e.isSleeping) { e.isSleeping = false; Utils.log(`¡${e.name} despierta!`, "#fa0"); }

        let conf = CONFIG.COMBAT[type];
        let weaponVal = GameState.player.equipment.weapon ? GameState.player.equipment.weapon.value : 0;
        let baseDmg = GameState.player.baseAtk + weaponVal + bonus;
        
        baseDmg = Math.floor(baseDmg * conf.dmgMult);
        
        let vari = conf.var || CONFIG.COMBAT.variability;
        let varianceMult = 1.0 + (Utils.random() * (vari * 2) - vari);
        
        let finalDmg = Math.round(baseDmg * varianceMult);
        if (finalDmg < 1) finalDmg = 1;

        let critChance = CONFIG.COMBAT.critChance + (conf.critBonus || 0);
        let isCrit = Utils.random() < critChance;
        if (isCrit) {
            let mult = type === 'savage' ? 2.0 : CONFIG.COMBAT.critMult;
            finalDmg = Math.round(finalDmg * mult);
        }

        e.hp -= finalDmg;
        
        // --- VISUAL FX: Daño al enemigo ---
        let dmgColor = isCrit ? "#ff00ff" : "#ffffff";
        let dmgText = isCrit ? `¡${finalDmg}!` : `${finalDmg}`;
        VisualFX.floatText(e.x, e.y, dmgText, dmgColor);
        // ----------------------------------

        Utils.log(`Golpeas a ${e.name}: ${finalDmg}${isCrit?' CRÍTICO':''}`, dmgColor);

        if (e.hp <= 0) {
            CombatSystem.gainXp(e.xp); GameState.score += 25;
            if (!GameState.player.stats.kills[e.name]) GameState.player.stats.kills[e.name] = 0; GameState.player.stats.kills[e.name]++;
            
            let currentIdx = GameState.entities.enemies.indexOf(e);
            if(currentIdx !== -1) GameState.entities.enemies.splice(currentIdx, 1);
            
            Utils.log(`${e.name} muere.`, "#ff0");
        }
    },

    performDefend: () => {
        GameState.player.combat.isDefending = true;
        GameState.player.combat.waitBonus = 0;
        Utils.log("Posición defensiva (+50% Def).", "#4682b4");
        GameLogic.endTurn(true);
    },

    performWait: () => {
        GameState.player.combat.waitBonus = CONFIG.COMBAT.wait.atkBonus;
        GameState.player.combat.isDefending = false;
        Utils.log("Esperas el momento oportuno...", "#888");
        GameLogic.endTurn(true);
    },

    // Barrido (Área) - Instantáneo, golpea las 8 casillas alrededor
    performAreaAttack: () => {
        if (GameState.player.combat.cooldowns.area > 0) {
            Utils.log(`Habilidad en enfriamiento (${GameState.player.combat.cooldowns.area} turnos)`, "#f00");
            return;
        }

        GameState.player.combat.cooldowns.area = CONFIG.COMBAT.area.cooldown;
        Utils.log("¡Barrido!", "#0ff");

        const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
        let hit = false;

        dirs.forEach(d => {
            let ex = GameState.player.x + d[0];
            let ey = GameState.player.y + d[1];
            let idx = GameState.entities.enemies.findIndex(e => e.x === ex && e.y === ey);
            if (idx !== -1) {
                // Usamos daño de área (más bajo pero golpea varios)
                CombatSystem.applyDamage(idx, 'area', 0);
                hit = true;
            }
        });

        if (!hit) Utils.log("El barrido no golpea a nadie.", "#777");

        GameLogic.endTurn(true);
    },

    // Bump Attack - Mejorado: forma principal y natural de combatir
    bumpAttack: (enemy) => {
        if (!enemy) return;

        let weaponVal = GameState.player.equipment.weapon ? GameState.player.equipment.weapon.value : 0;
        let baseDmg = GameState.player.baseAtk + weaponVal;

        // Bump es decente pero no tan fuerte como un ataque especial
        let finalDmg = Math.max(1, Math.round(baseDmg * 0.9 + Utils.random() * 2));

        enemy.hp -= finalDmg;
        enemy.tookDamage = true;

        if (enemy.isSleeping) {
            enemy.isSleeping = false;
            Utils.log(`¡${enemy.name} despierta!`, "#fa0");
        }

        VisualFX.floatText(enemy.x, enemy.y, `${finalDmg}`, "#ccc");
        Utils.log(`Golpeas a ${enemy.name}: ${finalDmg}`, "#ddd");

        if (enemy.hp <= 0) {
            CombatSystem.gainXp(enemy.xp);
            GameState.score += 25;
            if (!GameState.player.stats.kills[enemy.name]) GameState.player.stats.kills[enemy.name] = 0;
            GameState.player.stats.kills[enemy.name]++;

            let idx = GameState.entities.enemies.indexOf(enemy);
            if (idx !== -1) GameState.entities.enemies.splice(idx, 1);

            Utils.log(`${enemy.name} muere.`, "#ff0");
        }
    },

    enemyAttack: (e) => {
        let armorVal = GameState.player.equipment.armor ? GameState.player.equipment.armor.value : 0;
        if (GameState.player.combat.isDefending) {
            armorVal = Math.floor((armorVal + 2) * CONFIG.COMBAT.defend.defMult); 
        }

        let dmg = Math.max(0, e.atk - armorVal);
        let variance = 1.0 + (Utils.random() * 0.2 - 0.1);
        dmg = Math.round(dmg * variance);
        if (dmg < 0) dmg = 0; 

        let enemyCritChance = GameState.player.combat.isDefending ? 0.0 : 0.05;
        if (Utils.random() < enemyCritChance) {
            dmg = Math.floor(dmg * 1.5);
            Utils.log(`¡CRÍTICO de ${e.name}!`, "#f00");
        }

        // --- VISUAL FX: Daño al Jugador ---
        if (dmg > 0) {
            VisualFX.floatText(GameState.player.x, GameState.player.y, `-${dmg}`, "#ff0000");
            Utils.log(`${e.name} te hiere: -${dmg} HP`, "#f44");
        } else {
            VisualFX.floatText(GameState.player.x, GameState.player.y, "BLOCK", "#4682b4");
            Utils.log(`Bloqueas a ${e.name}`, "#888");
        }
        // ----------------------------------

        GameState.player.hp -= dmg; 
        if (GameState.player.hp <= 0) GameLogic.die(e.name);
    },

    gainXp: (amount) => {
        GameState.player.xp += amount;
        if (GameState.player.xp >= GameState.player.nextXp) {
            GameState.player.level++; GameState.player.xp -= GameState.player.nextXp;
            GameState.player.nextXp = Math.floor(GameState.player.nextXp * CONFIG.PLAYER.leveling.xpScaling);
            GameState.player.maxHp += CONFIG.PLAYER.leveling.statGain.hp; GameState.player.hp = GameState.player.maxHp;
            GameState.player.baseAtk += CONFIG.PLAYER.leveling.statGain.atk;
            Utils.log(`¡NIVEL UP! Nivel ${GameState.player.level}`, "#3f0");
        }
    }
};

// ============================================================================
// 9. INVENTARIO Y TIENDA
// ============================================================================
const InventorySystem = {
    pickup: (item, arrIndex, x, y, forced = false) => {
        if (GameState.player.inventory.length >= CONFIG.PLAYER.inventorySize) { Utils.log("¡Mochila llena!", "#f00"); return; }
        GameState.player.inventory.push(item);
        Utils.log(`Recogido: ${item.name}`, item.qualityColor || item.color);
        if(!forced && arrIndex >= 0) { GameState.entities.items.splice(arrIndex, 1); MapSystem.markTaken(x, y); }
        UISystem.updateHUD();
    },
    executeAction: () => {
        const actions = GameState.ui.currentActions; const selectedAction = actions[GameState.ui.actionIndex]; const itemIdx = GameState.ui.inventoryIndex;
        if (selectedAction.code === 'USE') InventorySystem.useItem(itemIdx); else if (selectedAction.code === 'DROP') InventorySystem.dropItem(itemIdx);
    },
    useItem: (idx) => {
        let item = GameState.player.inventory[idx]; let consumed = false;
        if (item.type === 'food') { GameState.player.food = Math.min(GameState.player.food + item.value, 100); Utils.log(`Comes ${item.name}`, "#fa0"); consumed = true; }
        else if (item.type === 'water') { GameState.player.water = Math.min(GameState.player.water + item.value, 100); Utils.log(`Bebes ${item.name}`, "#0ff"); consumed = true; }
        else if (item.type === 'weapon') {
            let old = GameState.player.equipment.weapon; GameState.player.equipment.weapon = item;
            if (item.value > GameState.player.stats.maxWeapon.val) GameState.player.stats.maxWeapon = {name: item.name, val: item.value};
            Utils.log(`Equipas ${item.name}`, "#f0f"); consumed = true;
            if(old) GameState.player.inventory.push(old);
        } else if (item.type === 'armor') {
            let old = GameState.player.equipment.armor; GameState.player.equipment.armor = item;
            if (item.value > GameState.player.stats.maxArmor.val) GameState.player.stats.maxArmor = {name: item.name, val: item.value};
            Utils.log(`Vistes ${item.name}`, "#468"); consumed = true;
            if(old) GameState.player.inventory.push(old);
        }
        if (consumed) { 
            GameState.player.inventory.splice(idx, 1); 
            InventorySystem.closeActionMenu(); 
            UISystem.updateHUD();
            GameLogic.endTurn(true); 
        }
    },
    dropItem: (idx) => {
        let item = GameState.player.inventory[idx]; Utils.log(`Tiras ${item.name}`, "#888");
        GameState.entities.items.push({ ...item, x: GameState.player.x, y: GameState.player.y });
        MapSystem.freePosition(GameState.player.x, GameState.player.y);
        GameState.player.inventory.splice(idx, 1); InventorySystem.closeActionMenu(); Renderer.draw();
        GameLogic.endTurn(true);
    },
    openActionMenu: () => {
        if (GameState.ui.inventoryIndex >= GameState.player.inventory.length) return;
        GameState.ui.actionMenuOpen = true; GameState.ui.actionIndex = 0;
        UISystem.renderActionMenu(GameState.player.inventory[GameState.ui.inventoryIndex]);
    },
    closeActionMenu: () => { GameState.ui.actionMenuOpen = false; DOM.menus.action.classList.add('hidden'); UISystem.renderInventory(); }
};

const ShopSystem = {
    open: () => {
        StateController.change(STATE_ENUM.SHOP);
        const container = document.getElementById('shop-items-container'); container.innerHTML = "";
        const tier = (GameState.level / 3) - 1; const priceMult = CONFIG.ENTITIES.shops.priceMultiplier * Math.pow(4, tier); const powerMult = Math.pow(2, tier);
        GameState.ui.shopStock = [];
        CONFIG.ENTITIES.shops.inventory.forEach(baseItem => {
            if (MapSystem.isTaken(`SHOP_${baseItem.id}`)) return;
            let v = Utils.applyVariance(baseItem.value);
            let finalVal = Math.floor(v.value * powerMult); let finalPrice = Math.floor(baseItem.price * priceMult * v.multiplier);
            let item = { ...baseItem, name: `${baseItem.name} [${v.label}]${tier > 0 ? ' +'+Math.ceil(tier) : ''}`, value: finalVal, price: finalPrice, qualityColor: v.color };
            GameState.ui.shopStock.push(item);
        });
        if (GameState.ui.shopStock.length === 0) container.innerHTML = "<div>Sin existencias</div>";
        else {
            GameState.ui.shopStock.forEach((item, i) => {
                let div = document.createElement('div'); div.className = 'shop-item-row';
                div.innerHTML = `<div class="shop-item-info"><span style="color:${item.color}">${item.icon}</span> <span style="color:${item.qualityColor}">${item.name}</span> <small>(${item.type === 'weapon' || item.type === 'armor' ? 'Poder' : 'Recupera'}: ${item.value})</small></div><div class="shop-item-price" style="color:${item.price > GameState.score ? '#f00' : '#ff0'}">${item.price} G</div><button class="btn-buy" onclick="ShopSystem.buy(${i})">Comprar</button>`;
                container.appendChild(div);
            });
        }
    },
    buy: (idx) => {
        let item = GameState.ui.shopStock[idx]; if (!item) return;
        if (GameState.player.inventory.length >= CONFIG.PLAYER.inventorySize) { alert("Mochila llena"); return; }
        if (GameState.score < item.price) { alert("Sin dinero"); return; }
        GameState.score -= item.price;
        GameState.player.inventory.push({ type: item.type, name: item.name, value: item.value, symbol: item.icon, color: item.color, qualityColor: item.qualityColor });
        MapSystem.markTaken(`SHOP_${item.id}`); Utils.log(`Comprado: ${item.name}`, "#ffd700");
        UISystem.updateHUD(); ShopSystem.open();
    }
};
window.ShopSystem = ShopSystem;

// ============================================================================
// 10. RENDERER Y UI
// ============================================================================
const Renderer = {
    draw: () => {
        let html = "";
        for (let y = 0; y < CONFIG.GRID.rows; y++) {
            for (let x = 0; x < CONFIG.GRID.cols; x++) {
                if (GameState.visible[y][x]) Renderer.checkDiscovery(x, y);
                if (!GameState.seen[y][x]) { html += " "; continue; }
                let char = GameState.map[y][x]; let color = ""; let isVis = GameState.visible[y][x];
                if (x === GameState.player.x && y === GameState.player.y) { char = "@"; color = "color:#ff0; font-weight:bold"; } 
                else if (isVis) {
                    let enemy = GameState.entities.enemies.find(e => e.x === x && e.y === y);
                    if (enemy) { char = enemy.isSleeping ? "z" : enemy.symbol; color = `color:${enemy.isSleeping ? '#888' : enemy.color}; font-weight:bold`; } 
                    else {
                        let shop = GameState.entities.shops.find(s => s.x === x && s.y === y);
                        if (shop) { char = "S"; color = "color:#ffd700; font-weight:bold"; }
                        else {
                            let chest = GameState.entities.chests.find(c => c.x === x && c.y === y);
                            if (chest) { char = chest.isOpen ? "_" : "="; color = `color:${chest.isOpen ? CONFIG.ENTITIES.chests.colors.open : CONFIG.ENTITIES.chests.colors.closed}; font-weight:bold`; } 
                            else {
                                let item = GameState.entities.items.find(i => i.x === x && i.y === y);
                                if (item) { char = item.symbol; color = `color:${item.color}; font-weight:bold`; }
                                else if (x === GameState.stairs.down.x && y === GameState.stairs.down.y) { char = ">"; color = "color:#fff"; }
                                else if (x === GameState.stairs.up.x && y === GameState.stairs.up.y) { char = "<"; color = "color:#fff"; }
                            }
                        }
                    }
                }
                if (!color) {
                    if (char === '#') { char = "█"; color = isVis ? `color:${CONFIG.MAP.colors.wallVisible}` : `color:${CONFIG.MAP.colors.wall}`; }
                    else { char = "."; color = isVis ? `color:${CONFIG.MAP.colors.floor}` : `color:${CONFIG.MAP.colors.fog}`; }
                }
                html += `<span style="${color}">${char}</span>`;
            } html += "\n";
        } DOM.container.innerHTML = html;
    },
    checkDiscovery: (x, y) => {
        let id = null, data = null, type = 'item';
        let e = GameState.entities.enemies.find(e => e.x === x && e.y === y);
        if (e) {
            let def = CONFIG.ENTITIES.enemies.find(def => def.id === e.typeId);
            if(def) { id = def.id; data = {symbol:def.symbol, color:def.color, name:def.name, stats:`HP:${def.hp}`}; type = 'monster'; }
        }
        else if (GameState.entities.shops.some(s => s.x === x && s.y === y)) { 
            id = 'SHOP'; data = {symbol:'S', color:'#ffd700', name:'Tienda', stats:'Comercio'}; 
        }
        else if (GameState.entities.chests.some(c => c.x === x && c.y === y)) { 
            id = 'CHEST'; data = {symbol:'=', color:CONFIG.ENTITIES.chests.colors.closed, name:'Cofre', stats:'Botín'}; 
        }
        else {
            let item = GameState.entities.items.find(i => i.x === x && i.y === y);
            if (item) {
                if (item.type === 'GOLD') { id = 'GOLD'; data = {symbol:'$', color:'#ffd700', name:'Oro', stats:'Riqueza'}; } 
                else if (item.type === 'food') { id = 'FOOD'; data = {symbol:'%', color:'#ffaa00', name:'Ración', stats:'Comida'}; } 
                else if (item.type === 'water') { id = 'WATER'; data = {symbol:'~', color:'#00ffff', name:'Agua', stats:'Bebida'}; } 
                else if (item.type === 'weapon') { id = 'WEAPON_DROP'; data = {symbol:'!', color:'#ff00ff', name:'Arma', stats:'Ataque'}; } 
                else if (item.type === 'armor') { id = 'ARMOR_DROP'; data = {symbol:']', color:'#4682b4', name:'Malla', stats:'Defensa'}; }
            }
            else if (x === GameState.stairs.down.x && y === GameState.stairs.down.y) { id = 'STAIRS_DOWN'; data = {symbol:'>', color:'#fff', name:'Bajada', stats:'Profundidad'}; }
            else if (x === GameState.stairs.up.x && y === GameState.stairs.up.y) { id = 'STAIRS_UP'; data = {symbol:'<', color:'#fff', name:'Subida', stats:'Salida'}; }
        }
        
        if (id && !GameState.discoveredTypes.has(id)) { 
            GameState.discoveredTypes.add(id); 
            Renderer.addToLegend(type, data); 
        }
    },
    addToLegend: (type, data) => {
        const panel = document.getElementById(type === 'monster' ? 'legend-monsters' : 'legend-items');
        const div = document.createElement('div'); div.className = 'legend-item';
        div.innerHTML = `<div class="legend-symbol" style="color: ${data.color}">${data.symbol}</div><div class="legend-desc"><span class="legend-name">${data.name}</span><span class="legend-stats">${data.stats}</span></div>`;
        panel.appendChild(div);
    },
    resetLegend: () => { document.getElementById('legend-monsters').innerHTML = '<div class="legend-title">Amenazas</div>'; document.getElementById('legend-items').innerHTML = '<div class="legend-title">Entorno</div>'; }
};

const UISystem = {
    updateHUD: () => {
        document.getElementById('char-lvl').innerText = GameState.player.level; document.getElementById('dungeon-lvl').innerText = `-${GameState.level}`;
        document.getElementById('hp-val').innerText = `${GameState.player.hp}/${GameState.player.maxHp}`;
        document.getElementById('food-val').innerText = GameState.player.food; document.getElementById('water-val').innerText = GameState.player.water;
        document.getElementById('score').innerText = GameState.score; document.getElementById('bag-count').innerText = `${GameState.player.inventory.length}/${CONFIG.PLAYER.inventorySize}`;
        let wVal = GameState.player.equipment.weapon ? GameState.player.equipment.weapon.value : 0; let aVal = GameState.player.equipment.armor ? GameState.player.equipment.armor.value : 0;
        document.getElementById('atk-val').innerText = GameState.player.baseAtk; document.getElementById('weapon-bonus').innerText = `(+${wVal})`; document.getElementById('armor-bonus').innerText = `(+${aVal})`;
        if(document.getElementById('seed-val')) document.getElementById('seed-val').innerText = GameState.seed;

        let combatStatus = "";
        if (GameState.current === STATE_ENUM.TARGETING) combatStatus += `<span style="color:#0ff">[OBJETIVO: ${GameState.player.combat.pendingAttack.toUpperCase()}]</span> `;
        if (GameState.player.combat.isDefending) combatStatus += `<span style="color:#4682b4">[DEFENDIENDO]</span> `;
        if (GameState.player.combat.waitBonus > 0) combatStatus += `<span style="color:#aaa">[CARGADO]</span> `;
        if (GameState.player.combat.cooldowns.area > 0) combatStatus += `<span style="color:#555">[Barrido CD: ${GameState.player.combat.cooldowns.area}]</span>`;
    },
    renderInventory: () => {
        const grid = document.getElementById('inv-grid'); grid.innerHTML = "";
        document.getElementById('inv-capacity').innerText = `${GameState.player.inventory.length}/${CONFIG.PLAYER.inventorySize}`;
        const w = GameState.player.equipment.weapon; const a = GameState.player.equipment.armor;
        document.getElementById('equip-weapon').innerHTML = `Arma: <span class="${w?'equip-active':''}">${w?w.name:'Puños'}</span>`;
        document.getElementById('equip-armor').innerHTML = `Armadura: <span class="${a?'equip-active':''}">${a?a.name:'Ropa'}</span>`;
        for (let i = 0; i < CONFIG.PLAYER.inventorySize; i++) {
            let div = document.createElement('div'); div.className = "inv-slot";
            if (i === GameState.ui.inventoryIndex) div.classList.add('selected');
            if (i < GameState.player.inventory.length) {
                let item = GameState.player.inventory[i];
                div.innerHTML = `<div class="inv-item-symbol" style="color:${item.color}">${item.symbol}</div><div class="inv-item-name" style="color:${item.qualityColor||'#ccc'}">${item.name}</div>`;
            } else { div.classList.add('empty'); }
            grid.appendChild(div);
        }
    },
    renderActionMenu: (item) => {
        const list = document.getElementById('action-list');
        document.getElementById('action-title').innerText = item.name;
        list.innerHTML = "";
        let actions = [];
        if (['food', 'water', 'weapon', 'armor'].includes(item.type)) actions.push({label: "Usar/Equipar", code: "USE"});
        actions.push({label: "Tirar", code: "DROP"});
        GameState.ui.currentActions = actions;
        actions.forEach((act, idx) => {
            let div = document.createElement('div');
            div.className = `action-option ${idx === GameState.ui.actionIndex ? 'selected' : ''}`;
            div.innerText = act.label;
            div.onclick = () => { if(act.code==='USE') InventorySystem.useItem(GameState.ui.inventoryIndex); else InventorySystem.dropItem(GameState.ui.inventoryIndex); };
            list.appendChild(div);
        });
        DOM.menus.action.classList.remove('hidden');
    },
    fillEndGameStats: (prefix) => {
        const id = prefix === 'win' ? 'win' : 'death';
        let kills = Object.entries(GameState.player.stats.kills).map(([k,v]) => `${v} ${k}`).join(", ") || "Ninguna";
        let w = GameState.player.stats.maxWeapon.val > 0 ? `${GameState.player.stats.maxWeapon.name}` : "Nada";
        let a = GameState.player.stats.maxArmor.val > 0 ? `${GameState.player.stats.maxArmor.name}` : "Nada";
        document.getElementById(`${id}-kills-list`).innerText = kills;
        document.getElementById(`${id}-best-gear`).innerText = `Arma: ${w} | Malla: ${a}`;
        if(prefix === 'death') { document.getElementById('final-score').innerText = GameState.score; document.getElementById('final-level').innerText = GameState.maxLevel; } 
        else { document.getElementById('victory-score').innerText = GameState.score; }
    }
};

// ============================================================================
// 11. CONTROLADOR DE ESTADO
// ============================================================================
const StateController = {
    change: (newState) => {
        GameState.current = newState;
        Object.values(DOM.menus).forEach(el => el.classList.add('hidden'));
        switch (newState) {
            case STATE_ENUM.CONTROLS: DOM.menus.controls.classList.remove('hidden'); break;
            case STATE_ENUM.INVENTORY: DOM.menus.inventory.classList.remove('hidden'); UISystem.renderInventory(); break;
            case STATE_ENUM.MENU: DOM.menus.main.classList.remove('hidden'); document.getElementById('menu-seed-display').innerText = GameState.seed; Network.fetchScores('menu-leaderboard'); break;
            case STATE_ENUM.SHOP: DOM.menus.shop.classList.remove('hidden'); break;
            case STATE_ENUM.GAMEOVER: DOM.menus.gameOver.classList.remove('hidden'); break;
            case STATE_ENUM.PLAYING: DOM.container.focus(); break;
            case STATE_ENUM.TARGETING: DOM.container.focus(); break;
        }
        UISystem.updateHUD();
    }
};

document.addEventListener('keydown', (e) => {
    // [FIX] Evitar spam si se mantiene la tecla pulsada
    if (e.repeat) return;

    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') Network.saveScore(); return; }
    
    const key = e.key.toLowerCase();
    
    // --- ESTADO JUGANDO ---
    if (GameState.current === STATE_ENUM.PLAYING) {
        
        // SISTEMA Y MENÚS
        if (key === 'm') StateController.change(STATE_ENUM.INVENTORY);
        else if (key === 'p' || key === 'escape') StateController.change(STATE_ENUM.MENU);
        else if (key === ' ') GameLogic.interactAction();
        
        // ACCIONES DE COMBATE
        else if (key === 'r') CombatSystem.startTargeting('quick');
        else if (key === 'f') CombatSystem.startTargeting('savage');
        else if (key === 't') CombatSystem.performAreaAttack();   // Barrido instantáneo (sin targeting)
        else if (key === 'c') CombatSystem.performWait();
        else if (key === 'v') CombatSystem.performDefend();
        
        // MOVIMIENTO
        else {
            let dx=0, dy=0;
            if (['w','arrowup'].includes(key)) dy=-1; 
            else if (['s','arrowdown'].includes(key)) dy=1;
            else if (['a','arrowleft'].includes(key)) dx=-1; 
            else if (['d','arrowright'].includes(key)) dx=1; 
            
            else if (key==='q') {dx=-1; dy=-1;} else if (key==='e') {dx=1; dy=-1;} 
            else if (key==='z') {dx=-1; dy=1;} else if (key==='x') {dx=1; dy=1;}
            
            if(dx!==0 || dy!==0) GameLogic.movePlayer(dx, dy);
        }
    } 
    
    // --- ESTADO SELECCIÓN DE OBJETIVO ---
    else if (GameState.current === STATE_ENUM.TARGETING) {
        if (key === 'escape' || key === 'r' || key === 'f') { 
            StateController.change(STATE_ENUM.PLAYING); 
            Utils.log("Ataque cancelado.", "#aaa"); 
            GameState.player.combat.pendingAttack = null;
        }
        else {
            let dx=0, dy=0;
            if (['w','arrowup', 'k'].includes(key)) dy=-1; 
            else if (['s','arrowdown', 'j'].includes(key)) dy=1;
            else if (['a','arrowleft', 'h'].includes(key)) dx=-1; 
            else if (['d','arrowright', 'l'].includes(key)) dx=1;
            
            else if (['y','q'].includes(key)) {dx=-1; dy=-1;} else if (['u','e'].includes(key)) {dx=1; dy=-1;} 
            else if (['b','z'].includes(key)) {dx=-1; dy=1;} else if (['n','x'].includes(key)) {dx=1; dy=1;}

            if(dx!==0 || dy!==0) CombatSystem.executeAttack(dx, dy);
        }
    }
    
    // --- MENÚ INVENTARIO ---
    else if (GameState.current === STATE_ENUM.INVENTORY) {
        if (GameState.ui.actionMenuOpen) {
            if (key === 'escape') InventorySystem.closeActionMenu();
            else if (['w', 'arrowup'].includes(key)) { GameState.ui.actionIndex = Math.max(0, GameState.ui.actionIndex - 1); UISystem.renderActionMenu(GameState.player.inventory[GameState.ui.inventoryIndex]); }
            else if (['s', 'arrowdown'].includes(key)) { GameState.ui.actionIndex = Math.min(GameState.ui.currentActions.length - 1, GameState.ui.actionIndex + 1); UISystem.renderActionMenu(GameState.player.inventory[GameState.ui.inventoryIndex]); }
            else if (key === 'enter' || key === ' ') { InventorySystem.executeAction(); }
        } else {
            if (key === 'm' || key === 'escape') StateController.change(STATE_ENUM.PLAYING);
            else if (key === 'enter' || key === ' ') InventorySystem.openActionMenu();
            else {
                let idx = GameState.ui.inventoryIndex;
                if (['d','arrowright'].includes(key) && idx % 3 < 2) idx++;
                else if (['a','arrowleft'].includes(key) && idx % 3 > 0) idx--;
                else if (['s','arrowdown'].includes(key) && idx + 3 < CONFIG.PLAYER.inventorySize) idx+=3;
                else if (['w','arrowup'].includes(key) && idx - 3 >= 0) idx-=3;
                GameState.ui.inventoryIndex = idx; UISystem.renderInventory();
            }
        }
    }
    // --- OTROS MENÚS ---
    else if (GameState.current === STATE_ENUM.CONTROLS && ['enter',' ','escape'].includes(key)) StateController.change(STATE_ENUM.PLAYING);
    else if (GameState.current === STATE_ENUM.SHOP && key === 'escape') StateController.change(STATE_ENUM.PLAYING);
    else if (GameState.current === STATE_ENUM.MENU && key === 'escape') StateController.change(STATE_ENUM.PLAYING);
    else if (GameState.current === STATE_ENUM.GAMEOVER && key === 'i') GameLogic.init();
});

// Corrección para tecla T (Barrido)
// Si quieres que T inicie targeting de area:
document.addEventListener('keydown', (e) => {
    if(GameState.current === STATE_ENUM.PLAYING && e.key.toLowerCase() === 't') {
        // Opción A: Targeting
        CombatSystem.startTargeting('area');
        // Opción B: Inmediato (descomentar si prefieres instantáneo)
        // CombatSystem.startTargeting('area'); CombatSystem.executeAttack(0,0);
    }
});

window.setGameState = (s) => StateController.change(s);
window.restartWithSeed = () => { let v = parseInt(document.getElementById('seed-input').value); if(!isNaN(v)) { GameLogic.init(v); StateController.change(STATE_ENUM.PLAYING); } };
window.saveScore = Network.saveScore;
window.showMenuScores = () => Network.fetchScores('menu-leaderboard');
window.closeShop = () => StateController.change(STATE_ENUM.PLAYING);
window.harakiri = () => { if(confirm("¿Rendirse?")) GameLogic.die("Harakiri"); };

GameLogic.init();

// ============================================================================
// VALIDATED RUNTIME STABILIZATION (consolidated from stability.js)
// ============================================================================
// Rogue404 - capa de estabilización
// Correcciones aisladas sobre el núcleo original para mantener main intacta y dev fácil de revisar.
(() => {
    // Los FX no deben romper la partida si la capa visual no está disponible.
    VisualFX.floatText = (x, y, text, color) => {
        const layer = document.getElementById('fx-layer');
        if (!layer) return;

        const el = document.createElement('div');
        el.className = 'float-msg';
        el.innerText = text;
        el.style.color = color;
        el.style.left = `calc(15px + ${x} * 0.6em)`;
        el.style.top = `calc(15px + ${y} * 1.0em)`;
        layer.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    };

    // Evita dobles envíos y usa el nombre de la pantalla final realmente visible.
    Network.isSaving = false;
    Network.saveScore = async () => {
        if (GameState.current !== STATE_ENUM.GAMEOVER || Network.isSaving) return;

        const isVictory = !DOM.menus.victory.classList.contains('hidden');
        const input = document.getElementById(isVictory ? 'winner-name' : 'player-name');
        const name = ((input && input.value.trim()) || 'UNK').toUpperCase();
        const killsStr = Object.entries(GameState.player.stats.kills).map(([k, v]) => `${v} ${k}`).join(', ') || 'Ninguna';
        const gearStr = `Arma: ${GameState.player.stats.maxWeapon.name} | Malla: ${GameState.player.stats.maxArmor.name}`;

        Network.isSaving = true;
        try {
            const r = await fetch('/404/rogue_api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    score: GameState.score,
                    level: GameState.maxLevel,
                    seed: GameState.seed,
                    cause: GameState.deathCause,
                    kills: killsStr,
                    equipment: gearStr
                })
            });
            if (!r.ok) throw new Error('Error en servidor');

            const d = await r.json();
            Network.renderLeaderboard(d, 'leaderboard');
            Network.renderLeaderboard(d, 'victory-leaderboard');
            Utils.log('¡Legado guardado!', '#ffd700');
            setTimeout(() => GameLogic.init(), 2000);
        } catch (e) {
            Network.isSaving = false;
            console.error(e);
            alert('Error guardando datos.');
        }
    };
    window.saveScore = Network.saveScore;

    // Repara acciones de botones del menú que habían quedado desconectadas del controlador de estado.
    window.toggleMenu = () => StateController.change(STATE_ENUM.PLAYING);
    window.showMenuScores = () => {
        const container = document.getElementById('menu-scores-container');
        if (!container) return;
        const willShow = container.style.display !== 'block';
        container.style.display = willShow ? 'block' : 'none';
        if (willShow) Network.fetchScores('menu-leaderboard');
    };

    // El ranking recibe datos de una API pública: escapamos todo lo que acaba en HTML/atributos.
    Network.renderLeaderboard = (data, targetId) => {
        const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);

        let h = '<table><tr><th>NOM</th><th>LVL</th><th>ORO</th><th>CAUSA</th><th>FECHA</th></tr>';
        if (Array.isArray(data)) {
            data.forEach((e) => {
                const name = escapeHtml(e.name || 'UNK');
                const date = escapeHtml(e.date || '--/--');
                const lvl = Number.isFinite(Number(e.level)) ? Number(e.level) : 1;
                const score = Number.isFinite(Number(e.score)) ? Number(e.score) : 0;
                const cause = escapeHtml(e.cause || 'Desconocido');
                const details = escapeHtml(`Equipo: ${e.equipment || 'Ninguno'}\nBajas: ${e.kills || 'Ninguna'}`);
                h += `<tr title="${details}"><td>${name}</td><td style='text-align:center'>${lvl}</td><td style='text-align:right; color:#ffd700'>${score}</td><td style='color:#aaa; font-style:italic'>${cause}</td><td style='text-align:right; font-size:0.8em'>${date}</td></tr>`;
            });
        }
        h += '</table>';
        const target = document.getElementById(targetId);
        if (target) target.innerHTML = h;
    };

    // Una muerte solo se registra una vez; así la causa no puede ser sobrescrita después.
    const originalDie = GameLogic.die.bind(GameLogic);
    GameLogic.die = (cause) => {
        if (GameState.current === STATE_ENUM.GAMEOVER) return;
        originalDie(cause);
    };

    // Ningún enemigo puede seguir atacando después de que la partida haya terminado.
    const originalEnemyAttack = CombatSystem.enemyAttack.bind(CombatSystem);
    CombatSystem.enemyAttack = (enemy) => {
        if (GameState.current === STATE_ENUM.GAMEOVER) return;
        originalEnemyAttack(enemy);
    };

    // Defender protege únicamente durante la respuesta enemiga del turno en que se usa.
    GameLogic.endTurn = (didAction = true) => {
        if (!didAction || GameState.current === STATE_ENUM.GAMEOVER) return;
        if (GameState.player.combat.cooldowns.area > 0) GameState.player.combat.cooldowns.area--;

        GameLogic.updateEnemies();
        if (GameState.current === STATE_ENUM.GAMEOVER) return;

        GameState.player.combat.isDefending = false;
        GameLogic.processSurvival();
        if (GameState.current === STATE_ENUM.GAMEOVER) return;

        MapSystem.updateFog();
        Renderer.draw();
        UISystem.updateHUD();
    };

    // Hambre y sed no pueden causar dos muertes en el mismo turno.
    GameLogic.processSurvival = () => {
        if (GameState.current === STATE_ENUM.GAMEOVER) return;

        const s = CONFIG.PLAYER.survival;
        GameState.moves++;
        if (GameState.moves % s.hungerRate === 0) GameState.player.food--;
        if (GameState.moves % s.thirstRate === 0) GameState.player.water--;

        if (GameState.player.food <= 0) {
            GameState.player.food = 0;
            GameState.player.hp -= s.starvationDmg;
            if (GameState.player.hp <= 0) {
                GameLogic.die('Hambre');
                return;
            }
        }

        if (GameState.player.water <= 0) {
            GameState.player.water = 0;
            GameState.player.hp -= s.dehydrationDmg;
            if (GameState.player.hp <= 0) {
                GameLogic.die('Sed');
                return;
            }
        }
    };

    // Tirar un objeto no debe borrar el registro de un objeto ya recogido en esa casilla.
    InventorySystem.dropItem = (idx) => {
        const item = GameState.player.inventory[idx];
        if (!item) return;

        Utils.log(`Tiras ${item.name}`, '#888');
        GameState.entities.items.push({ ...item, x: GameState.player.x, y: GameState.player.y });
        GameState.player.inventory.splice(idx, 1);
        InventorySystem.closeActionMenu();
        Renderer.draw();
        GameLogic.endTurn(true);
    };

    // Evita que enemigos, objetos, cofres y tiendas aparezcan apilados en la misma casilla.
    EntityFactory.isOccupied = (x, y) => {
        return GameState.entities.enemies.some(e => e.x === x && e.y === y) ||
               GameState.entities.items.some(i => i.x === x && i.y === y) ||
               GameState.entities.chests.some(c => c.x === x && c.y === y) ||
               GameState.entities.shops.some(s => s.x === x && s.y === y);
    };

    EntityFactory.getEmptyPos = () => {
        let limit = 500;
        while (limit-- > 0) {
            const x = Math.floor(Utils.random() * (CONFIG.GRID.cols - 2)) + 1;
            const y = Math.floor(Utils.random() * (CONFIG.GRID.rows - 2)) + 1;
            if (GameState.map[y][x] === '.' && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };
        }
        return null;
    };

    EntityFactory.getRoomPos = () => {
        if (GameState.rooms.length === 0) return EntityFactory.getEmptyPos();
        let limit = 100;
        while (limit-- > 0) {
            const r = GameState.rooms[Math.floor(Utils.random() * GameState.rooms.length)];
            const x = r.x + Math.floor(Utils.random() * r.w);
            const y = r.y + Math.floor(Utils.random() * r.h);
            if (!MapSystem.isTaken(x, y) && !EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };
        }
        return null;
    };

    // Los cofres usan posiciones deterministas sin confundir persistencia con ocupación.
    EntityFactory.getChestPos = () => {
        if (GameState.rooms.length === 0) return EntityFactory.getEmptyPos();
        let limit = 100;
        while (limit-- > 0) {
            const r = GameState.rooms[Math.floor(Utils.random() * GameState.rooms.length)];
            const x = r.x + Math.floor(Utils.random() * r.w);
            const y = r.y + Math.floor(Utils.random() * r.h);
            if (!EntityFactory.isStartEnd(x, y) && !EntityFactory.isOccupied(x, y)) return { x, y };
        }
        return null;
    };

    EntityFactory.spawnAll = () => {
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
    };

    GameLogic.openChest = (idx) => {
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
    };

    // Toda partida nueva debe empezar desde el estado inicial, no desde la dirección del último cambio de piso.
    const originalInit = GameLogic.init.bind(GameLogic);
    GameLogic.init = (seedInput = null) => {
        GameState.entryMethod = 'start';
        GameState.deathCause = 'Desconocido';
        GameState.ui.inventoryIndex = 0;
        GameState.ui.actionMenuOpen = false;
        GameState.ui.actionIndex = 0;
        GameState.ui.currentActions = [];
        GameState.ui.shopStock = [];
        Network.isSaving = false;
        return originalInit(seedInput);
    };

    // Captura antes de los listeners antiguos: T queda como barrido instantáneo y Enter hace lo correcto según el input.
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        if (GameState.current === STATE_ENUM.PLAYING && key === 't') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!e.repeat) CombatSystem.performAreaAttack();
            return;
        }

        if ((GameState.current === STATE_ENUM.PLAYING || GameState.current === STATE_ENUM.CONTROLS) && ['i', 'h'].includes(key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!e.repeat) {
                StateController.change(GameState.current === STATE_ENUM.CONTROLS ? STATE_ENUM.PLAYING : STATE_ENUM.CONTROLS);
            }
            return;
        }

        if (e.target && e.target.tagName === 'INPUT' && e.key === 'Enter') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.target.id === 'seed-input') window.restartWithSeed();
            else if (e.target.id === 'player-name' || e.target.id === 'winner-name') Network.saveScore();
        }
    }, true);

    // game.js arranca antes de esta capa; regeneramos inmediatamente con la misma seed para aplicar también los fixes de generación al primer piso.
    const bootSeed = GameState.seed;
    DOM.log.innerHTML = '';
    GameLogic.init(bootSeed);
})();


// Rogue404 - mejoras visuales y de experiencia de juego
(() => {
    const style = document.createElement('style');
    style.textContent = `
        .float-msg.float-msg-incoming { animation: floatDown 1.0s ease-out forwards; }
        .float-msg.float-msg-pickup { font-size: 1rem; animation: floatPickup 1.0s ease-out forwards; }

        #combat-status {
            position: absolute;
            top: 8px;
            right: 10px;
            z-index: 15;
            pointer-events: none;
            font-size: 0.78rem;
            font-weight: bold;
            font-family: 'Courier New', Courier, monospace;
            text-align: right;
            text-shadow: 2px 2px 0 #000;
            line-height: 1.35;
        }
        #combat-status:empty { display: none; }
        #combat-status span {
            display: inline-block;
            margin-left: 6px;
            padding: 2px 5px;
            background: rgba(0, 0, 0, 0.72);
            border: 1px solid #333;
        }

        @keyframes floatDown {
            0% { transform: translate(-18px, 0) scale(1); opacity: 1; }
            30% { transform: translate(-24px, 12px) scale(1.3); opacity: 1; }
            100% { transform: translate(-30px, 38px) scale(1); opacity: 0; }
        }
        @keyframes floatPickup {
            0% { transform: translate(8px, 0) scale(1); opacity: 1; }
            30% { transform: translate(12px, -12px) scale(1.15); opacity: 1; }
            100% { transform: translate(16px, -34px) scale(1); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    const gameWrapper = document.getElementById('game-wrapper');
    const combatStatus = document.createElement('div');
    combatStatus.id = 'combat-status';
    if (gameWrapper) gameWrapper.appendChild(combatStatus);

    VisualFX.floatText = (x, y, text, color, kind = 'auto') => {
        const layer = document.getElementById('fx-layer');
        if (!layer) return;

        const textValue = String(text);
        const isPlayerPosition = x === GameState.player.x && y === GameState.player.y;
        const autoIncoming = isPlayerPosition && (textValue.startsWith('-') || textValue === 'BLOCK');
        const resolvedKind = kind === 'auto' ? (autoIncoming ? 'incoming' : 'outgoing') : kind;

        const el = document.createElement('div');
        el.className = 'float-msg';
        if (resolvedKind === 'incoming') el.classList.add('float-msg-incoming');
        if (resolvedKind === 'pickup') el.classList.add('float-msg-pickup');

        el.innerText = textValue;
        el.style.color = color;
        el.style.left = `calc(15px + ${x} * 0.6em)`;
        el.style.top = `calc(15px + ${y} * 1.0em)`;

        if (resolvedKind === 'incoming') {
            el.style.marginLeft = '-18px';
            el.style.marginTop = '8px';
        } else if (resolvedKind === 'pickup') {
            el.style.marginLeft = '10px';
            el.style.marginTop = '-5px';
        } else {
            el.style.marginLeft = '6px';
            el.style.marginTop = '-4px';
        }

        layer.appendChild(el);
        setTimeout(() => el.remove(), 1100);
    };

    const originalPickup = InventorySystem.pickup.bind(InventorySystem);
    InventorySystem.pickup = (item, arrIndex, x, y, forced = false) => {
        const inventorySizeBefore = GameState.player.inventory.length;
        originalPickup(item, arrIndex, x, y, forced);

        if (!item || GameState.player.inventory.length <= inventorySizeBefore) return;
        if (item.type !== 'food' && item.type !== 'water') return;

        const fxX = forced ? GameState.player.x : x;
        const fxY = forced ? GameState.player.y : y;
        const isFood = item.type === 'food';

        VisualFX.floatText(
            fxX,
            fxY,
            isFood ? '+COMIDA' : '+AGUA',
            isFood ? '#ffaa00' : '#00ffff',
            'pickup'
        );
    };

    // El estado táctico ya se calculaba en el núcleo, pero nunca se mostraba.
    const stabilizedUpdateHUD = UISystem.updateHUD.bind(UISystem);
    UISystem.updateHUD = () => {
        stabilizedUpdateHUD();
        if (!combatStatus) return;

        const parts = [];
        if (GameState.current === STATE_ENUM.TARGETING && GameState.player.combat.pendingAttack) {
            const labels = { quick: 'RÁPIDO', savage: 'SALVAJE', area: 'BARRIDO' };
            const label = labels[GameState.player.combat.pendingAttack] || String(GameState.player.combat.pendingAttack).toUpperCase();
            parts.push(`<span style="color:#00ffff">OBJETIVO: ${label}</span>`);
        }
        if (GameState.player.combat.isDefending) {
            parts.push('<span style="color:#6fa8dc">DEFENSA</span>');
        }
        if (GameState.player.combat.waitBonus > 0) {
            parts.push(`<span style="color:#ddd">CARGADO +${GameState.player.combat.waitBonus}</span>`);
        }
        if (GameState.player.combat.cooldowns.area > 0) {
            parts.push(`<span style="color:#999">BARRIDO: ${GameState.player.combat.cooldowns.area}</span>`);
        }
        combatStatus.innerHTML = parts.join('');
    };

    // Rápido sacrifica daño a cambio de tempo: si el objetivo sobrevive, pierde una acción.
    // Para que no pueda bloquearse indefinidamente al mismo enemigo, no se puede descolocar
    // en dos turnos consecutivos.
    const stabilizedApplyDamage = CombatSystem.applyDamage.bind(CombatSystem);
    CombatSystem.applyDamage = (enemyIdx, type, bonus) => {
        const enemy = GameState.entities.enemies[enemyIdx];
        const result = stabilizedApplyDamage(enemyIdx, type, bonus);
        const enemySurvives = enemy && enemy.hp > 0 && GameState.entities.enemies.includes(enemy);

        if (type === 'quick' && enemySurvives && !enemy._rogueQuickStaggerImmune) {
            enemy._rogueQuickStaggerPending = true;
            Utils.log(`${enemy.name} queda descolocado.`, '#00ffff');
        }

        if (type === 'savage' && enemySurvives) {
            enemy._rogueSavageCounterPending = true;
        }
        return result;
    };

    // Aplicamos el descoloque justo antes de que se actualicen los enemigos. Restar una unidad
    // de energía elimina una acción con la velocidad actual (1.0). La inmunidad dura un turno.
    const stabilizedUpdateEnemies = GameLogic.updateEnemies.bind(GameLogic);
    GameLogic.updateEnemies = () => {
        GameState.entities.enemies.forEach(enemy => {
            if (enemy._rogueQuickStaggerPending) {
                enemy.energy = (enemy.energy || 0) - 1;
                enemy._rogueQuickStaggerPending = false;
                enemy._rogueQuickStaggerImmune = true;
            } else if (enemy._rogueQuickStaggerImmune) {
                enemy._rogueQuickStaggerImmune = false;
            }
        });
        return stabilizedUpdateEnemies();
    };

    // Un ataque Salvaje ya incluye un contraataque inmediato. Ese golpe consume la acción
    // normal del enemigo para evitar que el mismo enemigo ataque dos veces en el mismo turno.
    const stabilizedEnemyAttack = CombatSystem.enemyAttack.bind(CombatSystem);
    CombatSystem.enemyAttack = (enemy) => {
        const isSavageCounter = Boolean(enemy && enemy._rogueSavageCounterPending);
        const result = stabilizedEnemyAttack(enemy);

        if (isSavageCounter && enemy) {
            enemy._rogueSavageCounterPending = false;
            enemy.energy = (enemy.energy || 0) - 1;
        }
        return result;
    };

    // El núcleo descontaba un turno de enfriamiento en el mismo turno en que se usaba Barrido.
    // Restauramos el valor anunciado para que sean realmente 5 turnos completos.
    const stabilizedAreaAttack = CombatSystem.performAreaAttack.bind(CombatSystem);
    CombatSystem.performAreaAttack = () => {
        const cooldownBefore = GameState.player.combat.cooldowns.area;
        const result = stabilizedAreaAttack();

        if (
            cooldownBefore === 0 &&
            GameState.current !== STATE_ENUM.GAMEOVER &&
            GameState.player.combat.cooldowns.area === CONFIG.COMBAT.area.cooldown - 1
        ) {
            GameState.player.combat.cooldowns.area = CONFIG.COMBAT.area.cooldown;
            UISystem.updateHUD();
        }
        return result;
    };

    // Salir por las escaleras de superficie termina la partida: pedimos confirmación explícita.
    const stabilizedWin = GameLogic.win.bind(GameLogic);
    GameLogic.win = () => {
        const atSurfaceExit =
            GameState.level === 1 &&
            GameState.player.x === GameState.stairs.up.x &&
            GameState.player.y === GameState.stairs.up.y;

        if (atSurfaceExit) {
            const confirmed = window.confirm(
                'SALIR A LA SUPERFICIE?\n\n' +
                'Si abandonas la mazmorra, la partida termina y se calculará tu puntuación final.'
            );
            if (!confirmed) {
                Utils.log('Decides continuar explorando la mazmorra.', '#aaa');
                return;
            }
        }

        return stabilizedWin();
    };

    const placeAtSurfaceEntrance = () => {
        if (GameState.level !== 1 || GameState.entryMethod !== 'start') return;

        GameState.player.x = GameState.stairs.up.x;
        GameState.player.y = GameState.stairs.up.y;

        GameState.seen.forEach(row => row.fill(false));
        GameState.visible.forEach(row => row.fill(false));
        MapSystem.updateFog();
        Renderer.draw();
        UISystem.updateHUD();
    };

    const stabilizedInit = GameLogic.init.bind(GameLogic);
    GameLogic.init = (seedInput = null) => {
        const result = stabilizedInit(seedInput);
        placeAtSurfaceEntrance();
        return result;
    };

    placeAtSurfaceEntrance();
    UISystem.updateHUD();
})();
