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
