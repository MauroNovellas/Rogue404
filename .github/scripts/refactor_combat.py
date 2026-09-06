from pathlib import Path
import re

path = Path('game.js')
text = path.read_text()


def sub_once(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')


# Rápido aplica su pérdida de tempo antes del ciclo normal de energía del enemigo.
sub_once(
    r"    updateEnemies: \(\) => \{\n        GameState\.entities\.enemies\.forEach\(e => \{",
    """    updateEnemies: () => {
        GameState.entities.enemies.forEach(enemy => {
            if (enemy._rogueQuickStaggerPending) {
                enemy.energy = (enemy.energy || 0) - 1;
                enemy._rogueQuickStaggerPending = false;
                enemy._rogueQuickStaggerImmune = true;
            } else if (enemy._rogueQuickStaggerImmune) {
                enemy._rogueQuickStaggerImmune = false;
            }
        });

        GameState.entities.enemies.forEach(e => {""",
    'GameLogic.updateEnemies quick stagger'
)

# Integramos en applyDamage la identidad táctica de Rápido y la marca del contraataque Salvaje.
sub_once(
    r"    applyDamage: \(enemyIdx, type, bonus\) => \{.*?\n    \},\n\n    performDefend:",
    """    applyDamage: (enemyIdx, type, bonus) => {
        let e = GameState.entities.enemies[enemyIdx];
        if (!e) return;

        e.tookDamage = true;
        if (e.isSleeping) { e.isSleeping = false; Utils.log(`¡${e.name} despierta!`, "#fa0"); }

        let conf = CONFIG.COMBAT[type];
        let weaponVal = GameState.player.equipment.weapon ? GameState.player.equipment.weapon.value : 0;
        let baseDmg = GameState.player.baseAtk + weaponVal + bonus;

        baseDmg = Math.floor(baseDmg * conf.dmgMult);

        let vari = conf.var || CONFIG.COMBAT.variability;
        let varianceMult = 1.0 + (Utils.random() * (vari * 2) - vari);

        let finalDmg = Math.round(baseDmg * varianceMult);
        if (finalDmg < 1) finalDmg = 1;

        let critChance = CONFIG.COMBAT.critChance + (conf.critBonus || 0);
        let isCrit = Utils.random() < critChance;
        if (isCrit) {
            let mult = type === 'savage' ? 2.0 : CONFIG.COMBAT.critMult;
            finalDmg = Math.round(finalDmg * mult);
        }

        e.hp -= finalDmg;

        let dmgColor = isCrit ? "#ff00ff" : "#ffffff";
        let dmgText = isCrit ? `¡${finalDmg}!` : `${finalDmg}`;
        VisualFX.floatText(e.x, e.y, dmgText, dmgColor);
        Utils.log(`Golpeas a ${e.name}: ${finalDmg}${isCrit?' CRÍTICO':''}`, dmgColor);

        if (e.hp <= 0) {
            CombatSystem.gainXp(e.xp); GameState.score += 25;
            if (!GameState.player.stats.kills[e.name]) GameState.player.stats.kills[e.name] = 0; GameState.player.stats.kills[e.name]++;

            let currentIdx = GameState.entities.enemies.indexOf(e);
            if(currentIdx !== -1) GameState.entities.enemies.splice(currentIdx, 1);

            Utils.log(`${e.name} muere.`, "#ff0");
        }

        const enemySurvives = e.hp > 0 && GameState.entities.enemies.includes(e);
        if (type === 'quick' && enemySurvives && !e._rogueQuickStaggerImmune) {
            e._rogueQuickStaggerPending = true;
            Utils.log(`${e.name} queda descolocado.`, '#00ffff');
        }
        if (type === 'savage' && enemySurvives) {
            e._rogueSavageCounterPending = true;
        }
    },

    performDefend:""",
    'CombatSystem.applyDamage'
)

# Barrido conserva exactamente el enfriamiento validado: tras endTurn restaura 5 si el turno no acabó la partida.
sub_once(
    r"    // Barrido \(Área\) - Instantáneo, golpea las 8 casillas alrededor\n    performAreaAttack: \(\) => \{.*?\n    \},\n\n    // Bump Attack",
    """    // Barrido (Área) - Instantáneo, golpea las 8 casillas alrededor
    performAreaAttack: () => {
        if (GameState.player.combat.cooldowns.area > 0) {
            Utils.log(`Habilidad en enfriamiento (${GameState.player.combat.cooldowns.area} turnos)`, "#f00");
            return;
        }

        const cooldownBefore = GameState.player.combat.cooldowns.area;
        GameState.player.combat.cooldowns.area = CONFIG.COMBAT.area.cooldown;
        Utils.log("¡Barrido!", "#0ff");

        const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
        let hit = false;

        dirs.forEach(d => {
            let ex = GameState.player.x + d[0];
            let ey = GameState.player.y + d[1];
            let idx = GameState.entities.enemies.findIndex(e => e.x === ex && e.y === ey);
            if (idx !== -1) {
                CombatSystem.applyDamage(idx, 'area', 0);
                hit = true;
            }
        });

        if (!hit) Utils.log("El barrido no golpea a nadie.", "#777");

        GameLogic.endTurn(true);

        if (
            cooldownBefore === 0 &&
            GameState.current !== STATE_ENUM.GAMEOVER &&
            GameState.player.combat.cooldowns.area === CONFIG.COMBAT.area.cooldown - 1
        ) {
            GameState.player.combat.cooldowns.area = CONFIG.COMBAT.area.cooldown;
            UISystem.updateHUD();
        }
    },

    // Bump Attack""",
    'CombatSystem.performAreaAttack'
)

# enemyAttack incluye el guard de GAMEOVER y consume la acción normal tras el contraataque Salvaje.
sub_once(
    r"    enemyAttack: \(e\) => \{.*?\n    \},\n\n    gainXp:",
    """    enemyAttack: (e) => {
        if (GameState.current === STATE_ENUM.GAMEOVER) return;
        const isSavageCounter = Boolean(e && e._rogueSavageCounterPending);

        let armorVal = GameState.player.equipment.armor ? GameState.player.equipment.armor.value : 0;
        if (GameState.player.combat.isDefending) {
            armorVal = Math.floor((armorVal + 2) * CONFIG.COMBAT.defend.defMult);
        }

        let dmg = Math.max(0, e.atk - armorVal);
        let variance = 1.0 + (Utils.random() * 0.2 - 0.1);
        dmg = Math.round(dmg * variance);
        if (dmg < 0) dmg = 0;

        let enemyCritChance = GameState.player.combat.isDefending ? 0.0 : 0.05;
        if (Utils.random() < enemyCritChance) {
            dmg = Math.floor(dmg * 1.5);
            Utils.log(`¡CRÍTICO de ${e.name}!`, "#f00");
        }

        if (dmg > 0) {
            VisualFX.floatText(GameState.player.x, GameState.player.y, `-${dmg}`, "#ff0000");
            Utils.log(`${e.name} te hiere: -${dmg} HP`, "#f44");
        } else {
            VisualFX.floatText(GameState.player.x, GameState.player.y, "BLOCK", "#4682b4");
            Utils.log(`Bloqueas a ${e.name}`, "#888");
        }

        GameState.player.hp -= dmg;
        if (GameState.player.hp <= 0) GameLogic.die(e.name);

        if (isSavageCounter && e) {
            e._rogueSavageCounterPending = false;
            e.energy = (e.energy || 0) - 1;
        }
    },

    gainXp:""",
    'CombatSystem.enemyAttack'
)

# Retiramos los wrappers ya absorbidos en sus funciones naturales.
removals = [
    (r"\n    // Ningún enemigo puede seguir atacando después de que la partida haya terminado\.\n    const originalEnemyAttack = CombatSystem\.enemyAttack\.bind\(CombatSystem\);\n    CombatSystem\.enemyAttack = \(enemy\) => \{.*?\n    \};\n", 'runtime GAMEOVER enemyAttack override'),
    (r"\n    // Rápido sacrifica daño a cambio de tempo:.*?\n    const stabilizedApplyDamage = CombatSystem\.applyDamage\.bind\(CombatSystem\);\n    CombatSystem\.applyDamage = \(enemyIdx, type, bonus\) => \{.*?\n    \};\n", 'runtime applyDamage override'),
    (r"\n    // Aplicamos el descoloque justo antes de que se actualicen los enemigos\..*?\n    const stabilizedUpdateEnemies = GameLogic\.updateEnemies\.bind\(GameLogic\);\n    GameLogic\.updateEnemies = \(\) => \{.*?\n    \};\n", 'runtime updateEnemies override'),
    (r"\n    // Un ataque Salvaje ya incluye un contraataque inmediato\..*?\n    const stabilizedEnemyAttack = CombatSystem\.enemyAttack\.bind\(CombatSystem\);\n    CombatSystem\.enemyAttack = \(enemy\) => \{.*?\n    \};\n", 'runtime savage enemyAttack override'),
    (r"\n    // El núcleo descontaba un turno de enfriamiento en el mismo turno en que se usaba Barrido\..*?\n    const stabilizedAreaAttack = CombatSystem\.performAreaAttack\.bind\(CombatSystem\);\n    CombatSystem\.performAreaAttack = \(\) => \{.*?\n    \};\n", 'runtime area cooldown override'),
]

for pattern, label in removals:
    text, count = re.subn(pattern, '', text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 removal, got {count}')

path.write_text(text)
