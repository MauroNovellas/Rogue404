from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# game.js
path = Path('game.js')
text = path.read_text()
old = """    isValidEnemyMove: (x, y) => {
        if (MapSystem.isBlocked(x, y)) return false;
        if (x === GameState.player.x && y === GameState.player.y) return false;"""
new = """    isValidEnemyMove: (x, y) => {
        if (MapSystem.isBlocked(x, y)) return false;
        // En el estrato inestable los enemigos tratan las grietas como paredes:
        // no pisan suelo debilitado y nunca provocan una caída de nivel.
        if (FloorSystem.isCracked(x, y)) return false;
        if (x === GameState.player.x && y === GameState.player.y) return false;"""
text = replace_once(text, old, new, 'enemy crack collision')
path.write_text(text)

# tests/regression.test.cjs
path = Path('tests/regression.test.cjs')
text = path.read_text()
anchor = """test('I/H alternan la ayuda sin duplicar acciones', () => {"""
test_block = """test('los enemigos tratan las grietas inestables como paredes', () => {
    freshGame(1909);
    GameState.level = 9;
    GameState.entryMethod = 'descending';
    MapSystem.initLevel();
    FloorSystem.closeWarning();

    const x = GameState.player.x + 1;
    const y = GameState.player.y;
    if (MapSystem.isBlocked(x, y)) return;

    FloorSystem.markCracked(x, y);
    assert.equal(FloorSystem.isCracked(x, y), true);
    assert.equal(GameLogic.isValidEnemyMove(x, y), false);
});

"""
text = replace_once(text, anchor, test_block + anchor, 'enemy crack regression')
path.write_text(text)
