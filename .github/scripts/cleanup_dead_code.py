from pathlib import Path
import re

path = Path('game.js')
text = path.read_text()


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, got {count}')
    text = text.replace(old, new, 1)


def sub_once(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 regex match, got {count}')


# El coste de Barrido nunca se consume: la habilidad se regula únicamente por cooldown.
replace_once(
    '        area:   { dmgMult: 0.5,  cooldown: 5, cost: 5,      label: "Barrido" },',
    '        area:   { dmgMult: 0.5,  cooldown: 5, label: "Barrido" },',
    'unused area cost'
)

# Buffer de mensajes abandonado: el log actual vive directamente en el DOM.
replace_once('        messageBuffer: []\n', '', 'unused messageBuffer')

# La persistencia ya no se libera al tirar objetos; no queda ninguna llamada a freePosition.
if text.count('freePosition') != 1:
    raise SystemExit(f'freePosition: expected declaration only, got {text.count("freePosition")} occurrences')
sub_once(r"\n    freePosition: \(x, y\) => \{.*?\n", '\n', 'unused freePosition')

# Targeting queda reservado a Rápido y Salvaje. Barrido es exclusivamente instantáneo con T.
sub_once(
    r"    startTargeting: \(attackType\) => \{.*?\n    \},\n\n    executeAttack:",
    """    startTargeting: (attackType) => {
        if (!['quick', 'savage'].includes(attackType)) return;

        GameState.player.combat.pendingAttack = attackType;
        StateController.change(STATE_ENUM.TARGETING);
        const label = attackType === 'quick' ? 'Rápido' : 'Salvaje';
        Utils.log(`[${label}] Selecciona dirección...`, '#0ff');
        UISystem.updateHUD();
    },

    executeAttack:""",
    'targeting only quick/savage'
)

# El antiguo Barrido direccional de executeAttack no tiene ninguna entrada desde teclado ni UI.
sub_once(
    r"\n        // BARRIDO \(Area\)\n        if \(type === 'area'\) \{.*?\n        \}\n\n        // ATAQUES DIRECCIONALES",
    '\n        // ATAQUES DIRECCIONALES',
    'dead directional area branch'
)

# El HUD de targeting tampoco necesita una etiqueta para un estado que ya no existe.
replace_once(
    "            const labels = { quick: 'RÁPIDO', savage: 'SALVAJE', area: 'BARRIDO' };",
    "            const labels = { quick: 'RÁPIDO', savage: 'SALVAJE' };",
    'dead area targeting label'
)

# Guardas estructurales: no debe quedar ningún camino de targeting de área.
if "startTargeting('area')" in text:
    raise SystemExit('unexpected area targeting call remains')
if "type === 'area'" in text:
    raise SystemExit('unexpected directional area branch remains')
if 'cost: 5' in text:
    raise SystemExit('unused area cost remains')
if 'messageBuffer' in text:
    raise SystemExit('unused messageBuffer remains')
if 'freePosition' in text:
    raise SystemExit('unused freePosition remains')

path.write_text(text)
