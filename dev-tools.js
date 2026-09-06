// Rogue404 - utilidades temporales de prueba para la rama dev
(() => {
    const TEST_LEVELS = new Set([3, 6, 9]);

    GameState.ui.testMode = false;

    const coreInit = GameLogic.init.bind(GameLogic);
    GameLogic.init = (seedInput = null) => {
        GameState.ui.testMode = false;
        return coreInit(seedInput);
    };

    const coreSaveScore = Network.saveScore.bind(Network);
    Network.saveScore = async () => {
        if (GameState.ui.testMode) {
            Utils.log('MODO TEST: la puntuación no se guardará.', '#ffcc00');
            return;
        }
        return coreSaveScore();
    };
    window.saveScore = Network.saveScore;

    const jumpToTestFloor = (level) => {
        if (!TEST_LEVELS.has(level)) return;

        GameState.ui.testMode = true;
        GameState.ui.movementLocked = false;
        FloorSystem.closeWarning();
        GameState.level = level;
        GameState.entryMethod = 'descending';
        MapSystem.initLevel();
        StateController.change(STATE_ENUM.PLAYING);
        Utils.log(`MODO TEST → salto directo a profundidad -${level}.`, '#ffcc00');
    };

    document.addEventListener('keydown', (event) => {
        if (event.repeat || GameState.ui.movementLocked || GameState.ui.floorWarningOpen) return;
        if (GameState.current !== STATE_ENUM.PLAYING) return;
        if (event.target && event.target.tagName === 'INPUT') return;
        if (!['3', '6', '9'].includes(event.key)) return;

        event.preventDefault();
        jumpToTestFloor(Number(event.key));
    });

    window.jumpToTestFloor = jumpToTestFloor;
})();
