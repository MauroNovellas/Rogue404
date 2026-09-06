from pathlib import Path
import re

path = Path('game.js')
text = path.read_text()


def sub_once(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')


sub_once(
    r"    init: \(seedInput = null\) => \{.*?    \},\n    endTurn: \(didAction = true\) => \{.*?    \},\n    movePlayer:",
    """    init: (seedInput = null) => {
        GameState.entryMethod = 'start';
        GameState.deathCause = 'Desconocido';
        GameState.ui.inventoryIndex = 0;
        GameState.ui.actionMenuOpen = false;
        GameState.ui.actionIndex = 0;
        GameState.ui.currentActions = [];
        GameState.ui.shopStock = [];
        Network.isSaving = false;

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
        MapSystem.initLevel();

        // Una partida nueva entra por las escaleras que comunican con la superficie.
        GameState.player.x = GameState.stairs.up.x;
        GameState.player.y = GameState.stairs.up.y;
        GameState.seen.forEach(row => row.fill(false));
        GameState.visible.forEach(row => row.fill(false));
        MapSystem.updateFog();
        Renderer.draw();

        StateController.change(STATE_ENUM.CONTROLS);
    },
    endTurn: (didAction = true) => {
        if (!didAction || GameState.current === STATE_ENUM.GAMEOVER) return;
        if (GameState.player.combat.cooldowns.area > 0) GameState.player.combat.cooldowns.area--;

        GameLogic.updateEnemies();
        if (GameState.current === STATE_ENUM.GAMEOVER) return;

        // Defender cubre únicamente la respuesta enemiga del turno actual.
        GameState.player.combat.isDefending = false;
        GameLogic.processSurvival();
        if (GameState.current === STATE_ENUM.GAMEOVER) return;

        MapSystem.updateFog();
        Renderer.draw();
        UISystem.updateHUD();
    },
    movePlayer:""",
    'GameLogic init/endTurn'
)

sub_once(
    r"    processSurvival: \(\) => \{.*?    \},\n    interactAction:",
    """    processSurvival: () => {
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
    },
    interactAction:""",
    'GameLogic processSurvival'
)

sub_once(
    r"    die: \(cause\) => \{.*?    \},\n    win: \(\) => \{.*?    \}\n\};",
    r"""    die: (cause) => {
        if (GameState.current === STATE_ENUM.GAMEOVER) return;
        GameState.deathCause = cause;
        StateController.change(STATE_ENUM.GAMEOVER);
        UISystem.fillEndGameStats('death');
        Network.fetchScores('leaderboard');
    },
    win: () => {
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

        GameState.deathCause = 'Vio la luz'; GameState.score += (GameState.maxLevel * 100);
        StateController.change(STATE_ENUM.GAMEOVER); DOM.menus.gameOver.classList.add('hidden'); DOM.menus.victory.classList.remove('hidden');
        UISystem.fillEndGameStats('win');
        Network.fetchScores('victory-leaderboard');
    }
};""",
    'GameLogic die/win'
)

removals = [
    (r"\n    // Una muerte solo se registra una vez; así la causa no puede ser sobrescrita después\.\n    const originalDie = GameLogic\.die\.bind\(GameLogic\);\n    GameLogic\.die = \(cause\) => \{.*?\n    \};\n", 'runtime die override'),
    (r"\n    // Defender protege únicamente durante la respuesta enemiga del turno en que se usa\.\n    GameLogic\.endTurn = \(didAction = true\) => \{.*?\n    \};\n", 'runtime endTurn override'),
    (r"\n    // Hambre y sed no pueden causar dos muertes en el mismo turno\.\n    GameLogic\.processSurvival = \(\) => \{.*?\n    \};\n", 'runtime survival override'),
    (r"\n    // Toda partida nueva debe empezar desde el estado inicial, no desde la dirección del último cambio de piso\.\n    const originalInit = GameLogic\.init\.bind\(GameLogic\);\n    GameLogic\.init = \(seedInput = null\) => \{.*?\n    \};\n", 'runtime init override'),
    (r"\n    // Salir por las escaleras de superficie termina la partida: pedimos confirmación explícita\.\n    const stabilizedWin = GameLogic\.win\.bind\(GameLogic\);\n    GameLogic\.win = \(\) => \{.*?\n    \};\n\n    const placeAtSurfaceEntrance = \(\) => \{.*?\n    \};\n\n    const stabilizedInit = GameLogic\.init\.bind\(GameLogic\);\n    GameLogic\.init = \(seedInput = null\) => \{.*?\n    \};\n\n    placeAtSurfaceEntrance\(\);", 'polish GameLogic wrappers'),
]

for pattern, label in removals:
    text, count = re.subn(pattern, '', text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 removal, got {count}')

path.write_text(text)
