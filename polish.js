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
