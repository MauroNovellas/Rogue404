// Rogue404 - mejoras visuales y de experiencia de juego
(() => {
    const style = document.createElement('style');
    style.textContent = `
        .float-msg.float-msg-incoming { animation: floatDown 1.0s ease-out forwards; }
        .float-msg.float-msg-pickup { font-size: 1rem; animation: floatPickup 1.0s ease-out forwards; }
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
})();
