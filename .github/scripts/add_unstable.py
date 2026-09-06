from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

path = Path('game.js')
text = path.read_text()
old = """    fallPlayer: () => {
        const traits = FloorSystem.armorTraits();
        const keepEquipped = Boolean(traits.retainEquippedOnFall);
        const itemsToScatter = [...GameState.player.inventory];
        if (!keepEquipped) {
            if (GameState.player.equipment.weapon) itemsToScatter.push(GameState.player.equipment.weapon);
            if (GameState.player.equipment.armor) itemsToScatter.push(GameState.player.equipment.armor);
            GameState.player.equipment.weapon = null;
            GameState.player.equipment.armor = null;
        }
        GameState.player.inventory = [];

        const hpLoss = FloorSystem.fallHpLoss();
        GameState.player.hp = Math.max(1, Math.ceil(GameState.player.hp * (1 - hpLoss)));"""
new = """    fallPlayer: () => {
        const traits = FloorSystem.armorTraits();
        const keepEquipped = Boolean(traits.retainEquippedOnFall);
        const hpLoss = FloorSystem.fallHpLoss();
        const itemsToScatter = [...GameState.player.inventory];
        if (!keepEquipped) {
            if (GameState.player.equipment.weapon) itemsToScatter.push(GameState.player.equipment.weapon);
            if (GameState.player.equipment.armor) itemsToScatter.push(GameState.player.equipment.armor);
            GameState.player.equipment.weapon = null;
            GameState.player.equipment.armor = null;
        }
        GameState.player.inventory = [];

        GameState.player.hp = Math.max(1, Math.ceil(GameState.player.hp * (1 - hpLoss)));"""
text = replace_once(text, old, new, 'fall resistance ordering')
path.write_text(text)

path = Path('tests/regression.test.cjs')
tests = path.read_text()
marker = "test('el arnés ligero reduce la caída y conserva el equipo puesto', () => {"
insert = """test('la resistencia a caída se calcula antes de soltar una armadura no retenida', () => {
    freshGame(19055);
    GameState.level = 9;
    GameState.floor = { type: 'UNSTABLE' };
    GameState.persistence[9] = [];
    GameState.player.hp = 100;
    GameState.player.inventory = [];
    GameState.player.equipment.weapon = null;
    GameState.player.equipment.armor = {
        type: 'armor', name: 'Protección de prueba', value: 1, symbol: ']', color: '#aaa',
        traits: { fallDamageResist: 0.5, retainEquippedOnFall: false }
    };

    FloorSystem.fallPlayer();

    assert.equal(GameState.level, 10);
    assert.equal(GameState.player.hp, 63);
    assert.equal(GameState.player.equipment.armor, null);
    assert.equal(GameState.recoveryDrops[10].length, 1);
});

""" + marker
tests = replace_once(tests, marker, insert, 'fall resistance regression')
path.write_text(tests)
