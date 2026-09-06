const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');

assert.equal((source.match(/document\.addEventListener\('keydown'/g) || []).length, 1, 'Debe existir un único listener keydown');
assert.equal(source.includes('VALIDATED RUNTIME STABILIZATION'), false, 'No deben volver las capas runtime');
assert.equal(source.trimEnd().endsWith('GameLogic.init();'), true, 'game.js debe terminar en un único arranque normal');

assert.equal(source.includes("startTargeting('area')"), false, 'Barrido no debe volver a targeting');
assert.equal(source.includes("type === 'area'"), false, 'No debe volver la rama direccional de Barrido');
assert.equal(source.includes('cost: 5'), false, 'No debe reaparecer el coste de Barrido sin consumidor');
assert.equal(source.includes('messageBuffer'), false, 'No debe reaparecer el buffer de log abandonado');
assert.equal(source.includes('freePosition'), false, 'No debe reaparecer la liberación de persistencia obsoleta');
assert.equal(source.includes("if (!['quick', 'savage'].includes(attackType)) return;"), true, 'Targeting debe aceptar solo Rápido y Salvaje');

assert.equal(source.includes("behavior: 'WARDEN'"), true, 'El Trasgo debe conservar su identidad de guardián territorial');
assert.equal(source.includes('handleTrollAction: (e) =>'), true, 'Debe existir la IA territorial del Trasgo');
assert.equal(source.includes("behavior: 'REGEN'"), false, 'El Trasgo no debe volver a la regeneración genérica');
assert.equal(source.includes('RUGIDO · APLASTAR INMINENTE'), true, 'El APLASTAR del Trasgo debe permanecer telegráfico en el HUD');

console.log('✓ estructura del núcleo protegida');
