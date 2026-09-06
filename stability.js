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
