from pathlib import Path
import re

js_path = Path('game.js')
html_path = Path('index.html')
css_path = Path('style.css')

text = js_path.read_text()
html = html_path.read_text()
css = css_path.read_text()


def sub_once(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')


# DOM conoce directamente el estado táctico, que ahora existe en index.html antes de cargar game.js.
sub_once(
    r"    log: document\.getElementById\('log'\),\n    menus:",
    """    log: document.getElementById('log'),
    combatStatus: document.getElementById('combat-status'),
    menus:""",
    'DOM combatStatus'
)

# FX final: guard defensivo y carriles separados para daño entrante, saliente y recogidas.
sub_once(
    r"const VisualFX = \{.*?\n\};\n\n// ============================================================================\n// 4\. NETWORK",
    """const VisualFX = {
    floatText: (x, y, text, color, kind = 'auto') => {
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
    }
};

// ============================================================================
// 4. NETWORK""",
    'VisualFX core'
)

# Red final: evita dobles envíos, elige el input correcto y escapa datos del ranking.
sub_once(
    r"const Network = \{.*?\n\};\n\n// ============================================================================\n// 5\. SISTEMA DE MAPA",
    r"""const Network = {
    isSaving: false,
    fetchScores: async (targetId) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        target.innerHTML = 'Cargando...';
        try {
            const r = await fetch('/404/rogue_api.php?v=' + Date.now());
            const d = await r.json();
            Network.renderLeaderboard(d, targetId);
        } catch (e) {
            console.error(e);
            target.innerHTML = 'Offline o Error de Conexión';
        }
    },
    saveScore: async () => {
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
    },
    renderLeaderboard: (data, targetId) => {
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
    }
};

// ============================================================================
// 5. SISTEMA DE MAPA""",
    'Network core'
)

# Recogida de comida y agua muestra feedback visual directamente desde InventorySystem.
sub_once(
    r"    pickup: \(item, arrIndex, x, y, forced = false\) => \{.*?\n    \},\n    executeAction:",
    """    pickup: (item, arrIndex, x, y, forced = false) => {
        if (GameState.player.inventory.length >= CONFIG.PLAYER.inventorySize) {
            Utils.log('¡Mochila llena!', '#f00');
            return;
        }

        const inventorySizeBefore = GameState.player.inventory.length;
        GameState.player.inventory.push(item);
        Utils.log(`Recogido: ${item.name}`, item.qualityColor || item.color);
        if (!forced && arrIndex >= 0) {
            GameState.entities.items.splice(arrIndex, 1);
            MapSystem.markTaken(x, y);
        }
        UISystem.updateHUD();

        if (item && GameState.player.inventory.length > inventorySizeBefore && (item.type === 'food' || item.type === 'water')) {
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
        }
    },
    executeAction:""",
    'InventorySystem.pickup'
)

# HUD táctico visible directamente desde UISystem.
sub_once(
    r"    updateHUD: \(\) => \{.*?\n    \},\n    renderInventory:",
    """    updateHUD: () => {
        document.getElementById('char-lvl').innerText = GameState.player.level; document.getElementById('dungeon-lvl').innerText = `-${GameState.level}`;
        document.getElementById('hp-val').innerText = `${GameState.player.hp}/${GameState.player.maxHp}`;
        document.getElementById('food-val').innerText = GameState.player.food; document.getElementById('water-val').innerText = GameState.player.water;
        document.getElementById('score').innerText = GameState.score; document.getElementById('bag-count').innerText = `${GameState.player.inventory.length}/${CONFIG.PLAYER.inventorySize}`;
        let wVal = GameState.player.equipment.weapon ? GameState.player.equipment.weapon.value : 0; let aVal = GameState.player.equipment.armor ? GameState.player.equipment.armor.value : 0;
        document.getElementById('atk-val').innerText = GameState.player.baseAtk; document.getElementById('weapon-bonus').innerText = `(+${wVal})`; document.getElementById('armor-bonus').innerText = `(+${aVal})`;
        if (document.getElementById('seed-val')) document.getElementById('seed-val').innerText = GameState.seed;

        if (!DOM.combatStatus) return;
        const parts = [];
        if (GameState.current === STATE_ENUM.TARGETING && GameState.player.combat.pendingAttack) {
            const labels = { quick: 'RÁPIDO', savage: 'SALVAJE', area: 'BARRIDO' };
            const label = labels[GameState.player.combat.pendingAttack] || String(GameState.player.combat.pendingAttack).toUpperCase();
            parts.push(`<span style="color:#00ffff">OBJETIVO: ${label}</span>`);
        }
        if (GameState.player.combat.isDefending) parts.push('<span style="color:#6fa8dc">DEFENSA</span>');
        if (GameState.player.combat.waitBonus > 0) parts.push(`<span style="color:#ddd">CARGADO +${GameState.player.combat.waitBonus}</span>`);
        if (GameState.player.combat.cooldowns.area > 0) parts.push(`<span style="color:#999">BARRIDO: ${GameState.player.combat.cooldowns.area}</span>`);
        DOM.combatStatus.innerHTML = parts.join('');
    },
    renderInventory:""",
    'UISystem.updateHUD'
)

# Un único listener de teclado sustituye el listener principal, el listener T duplicado y la captura de estabilización.
sub_once(
    r"document\.addEventListener\('keydown', \(e\) => \{\n    // \[FIX\] Evitar spam.*?\n\}\);\n\n// Corrección para tecla T \(Barrido\).*?\n\}\);\n\nwindow\.setGameState",
    """document.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    const key = e.key.toLowerCase();

    if (e.target && e.target.tagName === 'INPUT') {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.target.id === 'seed-input') window.restartWithSeed();
            else if (e.target.id === 'player-name' || e.target.id === 'winner-name') Network.saveScore();
        }
        return;
    }

    if ((GameState.current === STATE_ENUM.PLAYING || GameState.current === STATE_ENUM.CONTROLS) && ['i', 'h'].includes(key)) {
        e.preventDefault();
        StateController.change(GameState.current === STATE_ENUM.CONTROLS ? STATE_ENUM.PLAYING : STATE_ENUM.CONTROLS);
        return;
    }

    if (GameState.current === STATE_ENUM.PLAYING) {
        if (key === 'm') StateController.change(STATE_ENUM.INVENTORY);
        else if (key === 'p' || key === 'escape') StateController.change(STATE_ENUM.MENU);
        else if (key === ' ') GameLogic.interactAction();
        else if (key === 'r') CombatSystem.startTargeting('quick');
        else if (key === 'f') CombatSystem.startTargeting('savage');
        else if (key === 't') { e.preventDefault(); CombatSystem.performAreaAttack(); }
        else if (key === 'c') CombatSystem.performWait();
        else if (key === 'v') CombatSystem.performDefend();
        else {
            let dx = 0, dy = 0;
            if (['w','arrowup'].includes(key)) dy = -1;
            else if (['s','arrowdown'].includes(key)) dy = 1;
            else if (['a','arrowleft'].includes(key)) dx = -1;
            else if (['d','arrowright'].includes(key)) dx = 1;
            else if (key === 'q') { dx = -1; dy = -1; }
            else if (key === 'e') { dx = 1; dy = -1; }
            else if (key === 'z') { dx = -1; dy = 1; }
            else if (key === 'x') { dx = 1; dy = 1; }
            if (dx !== 0 || dy !== 0) GameLogic.movePlayer(dx, dy);
        }
    }
    else if (GameState.current === STATE_ENUM.TARGETING) {
        if (key === 'escape' || key === 'r' || key === 'f') {
            StateController.change(STATE_ENUM.PLAYING);
            Utils.log('Ataque cancelado.', '#aaa');
            GameState.player.combat.pendingAttack = null;
        } else {
            let dx = 0, dy = 0;
            if (['w','arrowup','k'].includes(key)) dy = -1;
            else if (['s','arrowdown','j'].includes(key)) dy = 1;
            else if (['a','arrowleft','h'].includes(key)) dx = -1;
            else if (['d','arrowright','l'].includes(key)) dx = 1;
            else if (['y','q'].includes(key)) { dx = -1; dy = -1; }
            else if (['u','e'].includes(key)) { dx = 1; dy = -1; }
            else if (['b','z'].includes(key)) { dx = -1; dy = 1; }
            else if (['n','x'].includes(key)) { dx = 1; dy = 1; }
            if (dx !== 0 || dy !== 0) CombatSystem.executeAttack(dx, dy);
        }
    }
    else if (GameState.current === STATE_ENUM.INVENTORY) {
        if (GameState.ui.actionMenuOpen) {
            if (key === 'escape') InventorySystem.closeActionMenu();
            else if (['w','arrowup'].includes(key)) { GameState.ui.actionIndex = Math.max(0, GameState.ui.actionIndex - 1); UISystem.renderActionMenu(GameState.player.inventory[GameState.ui.inventoryIndex]); }
            else if (['s','arrowdown'].includes(key)) { GameState.ui.actionIndex = Math.min(GameState.ui.currentActions.length - 1, GameState.ui.actionIndex + 1); UISystem.renderActionMenu(GameState.player.inventory[GameState.ui.inventoryIndex]); }
            else if (key === 'enter' || key === ' ') InventorySystem.executeAction();
        } else {
            if (key === 'm' || key === 'escape') StateController.change(STATE_ENUM.PLAYING);
            else if (key === 'enter' || key === ' ') InventorySystem.openActionMenu();
            else {
                let idx = GameState.ui.inventoryIndex;
                if (['d','arrowright'].includes(key) && idx % 3 < 2) idx++;
                else if (['a','arrowleft'].includes(key) && idx % 3 > 0) idx--;
                else if (['s','arrowdown'].includes(key) && idx + 3 < CONFIG.PLAYER.inventorySize) idx += 3;
                else if (['w','arrowup'].includes(key) && idx - 3 >= 0) idx -= 3;
                GameState.ui.inventoryIndex = idx;
                UISystem.renderInventory();
            }
        }
    }
    else if (GameState.current === STATE_ENUM.CONTROLS && ['enter',' ','escape'].includes(key)) StateController.change(STATE_ENUM.PLAYING);
    else if (GameState.current === STATE_ENUM.SHOP && key === 'escape') StateController.change(STATE_ENUM.PLAYING);
    else if (GameState.current === STATE_ENUM.MENU && key === 'escape') StateController.change(STATE_ENUM.PLAYING);
    else if (GameState.current === STATE_ENUM.GAMEOVER && key === 'i') GameLogic.init();
});

window.setGameState""",
    'keyboard listeners'
)

# Los botones globales quedan conectados al controlador real.
sub_once(
    r"window\.saveScore = Network\.saveScore;\nwindow\.showMenuScores = \(\) => Network\.fetchScores\('menu-leaderboard'\);",
    """window.saveScore = Network.saveScore;
window.toggleMenu = () => StateController.change(STATE_ENUM.PLAYING);
window.showMenuScores = () => {
    const container = document.getElementById('menu-scores-container');
    if (!container) return;
    const willShow = container.style.display !== 'block';
    container.style.display = willShow ? 'block' : 'none';
    if (willShow) Network.fetchScores('menu-leaderboard');
};""",
    'menu globals'
)

# Todo lo que quedaba después del arranque eran parches ya integrados.
sub_once(
    r"GameLogic\.init\(\);\n\n// ============================================================================\n// VALIDATED RUNTIME STABILIZATION.*\Z",
    "GameLogic.init();\n",
    'remove consolidated runtime patch tail'
)

js_path.write_text(text)

# El estado táctico pasa a ser DOM real, no un nodo creado a posteriori.
needle = '            <div id="fx-layer"></div>\n            <div id="game-container"></div>'
replacement = '            <div id="fx-layer"></div>\n            <div id="combat-status"></div>\n            <div id="game-container"></div>'
if html.count(needle) != 1:
    raise SystemExit(f'index combat status insertion: expected 1 match, got {html.count(needle)}')
html = html.replace(needle, replacement, 1)
html_path.write_text(html)

# Estilos antes inyectados por polish.js pasan a la hoja de estilos.
marker = '/* --- FX TÁCTICOS Y ESTADO DE COMBATE --- */'
if marker in css:
    raise SystemExit('runtime CSS already integrated')
css += r'''

/* --- FX TÁCTICOS Y ESTADO DE COMBATE --- */
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
'''
css_path.write_text(css)
