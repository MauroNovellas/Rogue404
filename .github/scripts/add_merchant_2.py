from pathlib import Path

GAME = Path('game.js')
TESTS = Path('tests/regression.test.cjs')

source = GAME.read_text(encoding='utf-8')

old = "levels: [3, 6, 9, 12], priceMultiplier: 1.0,"
new = "levels: [3, 6, 9, 12], priceMultiplier: 1.0, sellMultiplier: 0.5,"
assert old in source, 'shop config anchor missing'
source = source.replace(old, new, 1)

old = "persistence: {}, recoveryDrops: {}, recoveryDropSeq: 0, discoveredTypes: new Set(),"
new = "persistence: {}, shopStocks: {}, recoveryDrops: {}, recoveryDropSeq: 0, discoveredTypes: new Set(),"
assert old in source, 'GameState shopStocks anchor missing'
source = source.replace(old, new, 1)

old = "GameState.persistence = {}; GameState.recoveryDrops = {}; GameState.recoveryDropSeq = 0; GameState.discoveredTypes.clear(); Renderer.resetLegend();"
new = "GameState.persistence = {}; GameState.shopStocks = {}; GameState.recoveryDrops = {}; GameState.recoveryDropSeq = 0; GameState.discoveredTypes.clear(); Renderer.resetLegend();"
assert old in source, 'init shopStocks reset anchor missing'
source = source.replace(old, new, 1)

start = source.index('const ShopSystem = {')
end = source.index('window.ShopSystem = ShopSystem;', start)
merchant = r'''const ShopSystem = {
    stockKey: () => String(GameState.level),
    createStock: () => {
        const tier = (GameState.level / 3) - 1;
        const priceMult = CONFIG.ENTITIES.shops.priceMultiplier * Math.pow(4, tier);
        const powerMult = Math.pow(2, tier);
        return CONFIG.ENTITIES.shops.inventory.map(baseItem => {
            const variance = Utils.applyVariance(baseItem.value);
            const finalVal = Math.floor(variance.value * powerMult);
            const finalPrice = Math.floor(baseItem.price * priceMult * variance.multiplier);
            return {
                ...baseItem,
                name: `${baseItem.name} [${variance.label}]${tier > 0 ? ' +'+Math.ceil(tier) : ''}`,
                value: finalVal,
                price: finalPrice,
                qualityColor: variance.color
            };
        });
    },
    getStock: () => {
        const key = ShopSystem.stockKey();
        if (!Array.isArray(GameState.shopStocks[key])) {
            GameState.shopStocks[key] = ShopSystem.createStock();
        }
        return GameState.shopStocks[key];
    },
    baseDefinitionFor: (item) => {
        if (!item) return null;
        return CONFIG.ENTITIES.shops.inventory.find(baseItem => baseItem.type === item.type) || null;
    },
    estimateValue: (item) => {
        if (!item) return 0;
        if (Number.isFinite(item.buyPrice) && item.buyPrice > 0) return Math.round(item.buyPrice);
        const base = ShopSystem.baseDefinitionFor(item);
        if (!base) return 0;
        const value = Math.max(1, Number(item.value) || 1);
        return Math.max(1, Math.round(base.price * (value / base.value)));
    },
    sellPrice: (item) => {
        const estimated = ShopSystem.estimateValue(item);
        if (estimated <= 0) return 0;
        return Math.max(1, Math.floor(estimated * CONFIG.ENTITIES.shops.sellMultiplier));
    },
    open: () => {
        StateController.change(STATE_ENUM.SHOP);
        const container = document.getElementById('shop-items-container');
        container.innerHTML = '<div style="color:#ffd700; font-weight:bold; margin:4px 0 8px;">COMPRAR</div>';

        const stock = ShopSystem.getStock();
        GameState.ui.shopStock = stock;
        if (stock.length === 0) {
            const empty = document.createElement('div');
            empty.innerHTML = '<div style="color:#777; margin-bottom:8px;">Sin existencias</div>';
            container.appendChild(empty);
        } else {
            stock.forEach((item, i) => {
                const div = document.createElement('div');
                div.className = 'shop-item-row';
                div.innerHTML = `<div class="shop-item-info"><span style="color:${item.color}">${item.icon}</span> <span style="color:${item.qualityColor}">${item.name}</span> <small>(${item.type === 'weapon' || item.type === 'armor' ? 'Poder' : 'Recupera'}: ${item.value})</small></div><div class="shop-item-price" style="color:${item.price > GameState.score ? '#f00' : '#ff0'}">${item.price} G</div><button class="btn-buy" onclick="ShopSystem.buy(${i})">Comprar</button>`;
                container.appendChild(div);
            });
        }

        const sellTitle = document.createElement('div');
        sellTitle.innerHTML = '<div style="color:#33ff00; font-weight:bold; margin:14px 0 8px; border-top:1px dashed #555; padding-top:10px;">VENDER · 50%</div>';
        container.appendChild(sellTitle);

        if (GameState.player.inventory.length === 0) {
            const emptyBag = document.createElement('div');
            emptyBag.innerHTML = '<div style="color:#777;">No llevas nada vendible en la mochila</div>';
            container.appendChild(emptyBag);
        } else {
            GameState.player.inventory.forEach((item, i) => {
                const price = ShopSystem.sellPrice(item);
                const div = document.createElement('div');
                div.className = 'shop-item-row';
                div.innerHTML = `<div class="shop-item-info"><span style="color:${item.color || '#fff'}">${item.symbol || '?'}</span> <span style="color:${item.qualityColor || '#fff'}">${item.name}</span> <small>(Valor: ${item.value})</small></div><div class="shop-item-price" style="color:#33ff00">${price} G</div><button class="btn-buy" onclick="ShopSystem.sell(${i})" ${price <= 0 ? 'disabled' : ''}>Vender</button>`;
                container.appendChild(div);
            });
        }
    },
    buy: (idx) => {
        const stock = ShopSystem.getStock();
        const item = stock[idx];
        if (!item) return;
        if (GameState.player.inventory.length >= CONFIG.PLAYER.inventorySize) { alert('Mochila llena'); return; }
        if (GameState.score < item.price) { alert('Sin dinero'); return; }

        GameState.score -= item.price;
        GameState.player.inventory.push({
            type: item.type,
            name: item.name,
            value: item.value,
            symbol: item.icon,
            color: item.color,
            qualityColor: item.qualityColor,
            buyPrice: item.price
        });
        stock.splice(idx, 1);
        Utils.log(`Comprado: ${item.name}`, '#ffd700');
        UISystem.updateHUD();
        ShopSystem.open();
    },
    sell: (idx) => {
        const item = GameState.player.inventory[idx];
        if (!item) return;
        const price = ShopSystem.sellPrice(item);
        if (price <= 0) return;

        GameState.player.inventory.splice(idx, 1);
        GameState.score += price;
        Utils.log(`Vendido: ${item.name} (+${price} G)`, '#33ff00');
        UISystem.updateHUD();
        ShopSystem.open();
    }
};
'''
source = source[:start] + merchant + source[end:]
GAME.write_text(source, encoding='utf-8')

tests = TESTS.read_text(encoding='utf-8')
old = "GameLogic, CombatSystem, InventorySystem, UISystem, StateController };`,"
new = "GameLogic, CombatSystem, InventorySystem, ShopSystem, UISystem, StateController };`,"
assert old in tests, 'test VM export anchor missing'
tests = tests.replace(old, new, 1)

old = "    InventorySystem,\n    UISystem,"
new = "    InventorySystem,\n    ShopSystem,\n    UISystem,"
assert old in tests, 'test destructuring anchor missing'
tests = tests.replace(old, new, 1)

anchor = "\n(async () => {\n"
assert anchor in tests, 'test runner anchor missing'
new_tests = r'''

test('el stock del mercader queda congelado tras la primera apertura', () => {
    freshGame(2401);
    GameState.level = 3;
    GameState.shopStocks = {};
    ShopSystem.open();
    const first = JSON.stringify(GameState.ui.shopStock.map(item => ({ name: item.name, value: item.value, price: item.price })));

    const originalRandom = Utils.random;
    Utils.random = () => 0.999;
    try {
        ShopSystem.open();
        const second = JSON.stringify(GameState.ui.shopStock.map(item => ({ name: item.name, value: item.value, price: item.price })));
        assert.equal(second, first);
    } finally {
        Utils.random = originalRandom;
    }
});

test('comprar elimina el objeto del stock persistente de esa planta', () => {
    freshGame(2402);
    GameState.level = 3;
    GameState.shopStocks = {};
    GameState.score = 99999;
    GameState.player.inventory = [];
    ShopSystem.open();

    const stock = ShopSystem.getStock();
    const before = stock.length;
    const bought = { ...stock[0] };
    ShopSystem.buy(0);

    assert.equal(ShopSystem.getStock().length, before - 1);
    assert.equal(GameState.player.inventory.length, 1);
    assert.equal(GameState.player.inventory[0].buyPrice, bought.price);
    ShopSystem.open();
    assert.equal(GameState.ui.shopStock.some(item => item.name === bought.name && item.price === bought.price), false);
});

test('vender devuelve el 50% del precio pagado y retira el objeto de la mochila', () => {
    freshGame(2403);
    GameState.level = 3;
    GameState.shopStocks = {};
    GameState.score = 10;
    GameState.player.inventory = [{
        type: 'weapon', name: 'Espada comprada', value: 3, symbol: '!', color: '#ff00ff', buyPrice: 200
    }];

    assert.equal(ShopSystem.sellPrice(GameState.player.inventory[0]), 100);
    ShopSystem.sell(0);
    assert.equal(GameState.score, 110);
    assert.equal(GameState.player.inventory.length, 0);
});

test('los objetos encontrados se valoran por tipo y potencia, no por profundidad actual', () => {
    freshGame(2404);
    GameState.level = 9;
    const found = { type: 'weapon', name: 'Arma encontrada', value: 3, symbol: '!', color: '#ff00ff' };
    assert.equal(ShopSystem.estimateValue(found), 200);
    assert.equal(ShopSystem.sellPrice(found), 100);
});

test('una partida nueva limpia todos los stocks persistentes de mercader', () => {
    freshGame(2405);
    GameState.level = 3;
    ShopSystem.open();
    assert.ok(Object.keys(GameState.shopStocks).length > 0);
    GameLogic.init(2406);
    assert.equal(Object.keys(GameState.shopStocks).length, 0);
});
'''
tests = tests.replace(anchor, new_tests + anchor, 1)
TESTS.write_text(tests, encoding='utf-8')
