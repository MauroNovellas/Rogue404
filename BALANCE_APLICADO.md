# Balance 1 aplicado

Primera revisión basada en `ANALISIS_BALANCE.md`. Mantiene la vida inicial, el dardo, el Cáliz, la Campana y los valores de los anillos. No pretende cerrar el balance sin pruebas humanas.

## Cambios de reglas

- Cada planta conserva enemigos vivos, heridas, posiciones, botín, cofres y exploración. Las bajas no reaparecen al regresar; los objetos tirados tampoco desaparecen.
- Cofres y comerciantes se colocan comprobando conexiones transitables. Un cofre abierto permite caminar y disparar. La primera auditoría posterior encontró cero rutas bloqueadas en las 3.600 combinaciones de mapa comprobadas, frente a cuatro antes.
- Los cofres especiales permiten elegir arma o armadura. Sus valores se sortean una vez y se muestran antes de elegir. Aplazar conserva las opciones, indicadas con `?`.
- Si la mochila está llena, el premio elegido queda sobre el cofre, visible y recuperable. No se elimina.
- Subir y bajar escaleras no reinicia la recarga de habilidades. Cada profundidad nueva concede 25 XP una sola vez por partida; repetir escaleras no concede XP.

## Personaje y combate

- Vida inicial 100, +10 por nivel y curación completa al subir: conservados.
- Mochila de 6 a 8 huecos; navegación adaptada a la última fila incompleta.
- Armadura básica disponible desde la planta 2.
- Variación de monstruos acotada a ±15%; Alfas explícitos con 8% de probabilidad, +25% vida, +10% ataque y recompensas superiores.
- En planta 5 aparece un Trasgo, y en 6 como máximo dos; la presencia aumenta gradualmente. Su vida inicial ronda 45 y su ataque 11, en lugar de aproximadamente 62 y 17,5. Los murciélagos y Goblins conservan su potencia media aproximada.
- Defensa permanente: no puede mitigar más del 75%; Defender puede llegar al 90%. Se respetan estos límites tras el redondeo.
- Rápido puede descolocar una vez cada tres acciones.
- Salvaje: ×1,3 daño, 20% crítico total y +0,25 de energía al objetivo si sobrevive y no está aturdido. La respuesta usa la iniciativa y la IA reales; no sustituye APLASTAR por un contragolpe genérico.
- Barrido: ×0,6 daño, recarga 4. El daño base de habilidades se redondea al entero más próximo.
- Esperar también carga el siguiente ataque por contacto, no solo los especiales.

## Botín y tiendas

- Calidades: 1% Pésimo, 4% Malo, 10% Mediocre, 45% Normal, 25% Bueno, 12% Excelente, 3% Épico. Normal representa el valor base.
- Armas de suelo: crecen desde +2 en planta 2 hasta +7 en 12, antes de calidad. Armaduras de suelo: crecimiento gradual.
- Los cofres normales y especiales usan escalones moderados sobre la curva de suelo, no la antigua multiplicación de poder.
- Tiendas: arma normal a 225 / 350 / 500 / 700 oro en plantas 3 / 6 / 9 / 12, con modificación por calidad. Agua de 60 puntos a 90 / 110 / 130 / 150 oro. Los consumibles de tienda no superan la capacidad total de reserva.
- Los accesorios suben solo 20 oro por escalón de tienda, sin multiplicar su precio por cuatro.
- Las botas ambientales aparecen cerca de su bioma, no varias plantas antes de poder utilizarlas.
- Las raciones y el agua del suelo usan bases 45 y 35 para compensar la nueva distribución de calidad y conservar aproximadamente la oferta anterior.
- Oro y puntuación están separados: comprar, vender o sufrir un robo no resta puntos ni permite fabricarlos vendiendo objetos. Bajas de murciélago/Goblin/Trasgo: 10/20/40 oro y 20/40/80 puntos, con premio mayor para Alfas. Recuperar el mismo oro robado no lo puntúa de nuevo.
- Se conservan las puntuaciones históricas. Los nuevos envíos incluyen la versión `balance-1`; no se borra el historial.

## Supervivencia y reliquias

- Sed normal conservada; magma pasa de presión ×2 a ×1,5.
- Sed y calor acumulan fracciones: equipar, salir de una fumarola o cambiar de planta no elimina la exposición pendiente. Una protección térmica del 60% ahorra realmente ese porcentaje del coste adicional.
- Caída: 50% de vida actual, en vez de 75%, conservando dispersión y bajada. Arnés y botas mantienen sus resistencias multiplicativas.
- Piedra de Guardia: coste de 6 agua, en vez de 10; conserva +3 defensa durante tres respuestas y carga de +2.
- Comida y agua no se consumen con la reserva llena; sus fichas muestran la recuperación aprovechable.

## Verificación

Se añaden pruebas de persistencia, conectividad, recompensas, recargas, rareza, defensa, IA, economía y exposición fraccional, además de mantener las suites anteriores. Se comprueban los menús en Chromium entre 320 y 1366 píxeles y se repiten las comprobaciones de dardos, escaleras y guardado.

Las 28 pruebas específicas de balance y todas las suites anteriores pasan. Se conserva una nueva medición en `analysis/resultados-balance-1/`: 3.600 mapas sin escaleras bloqueadas; exactamente un Trasgo en cada planta 5, con medias de 45,46 vida y 11,05 ataque contando Alfas. La calidad Épica aparece en 6.002 de 200.000 tiradas (3,001%).

En el ensayo sostenido de 100 acciones contra la IA territorial, sin Velocidad ni botas, Salvaje permite 125 respuestas y 62 APLASTAR, frente a las 100 respuestas genéricas y ningún APLASTAR anteriores. Rápido permite 66 respuestas, no 50. Son blancos artificiales de mucha vida, no combates normales: verifican el planificador y las ventajas relativas.

El autómata aprende a comparar recompensas, utilizar reliquias, vender equipo común sobrante y no perseguir objetos que no caben. Las comparaciones posteriores deben identificar este cambio de política: no se presentan como una estimación directa de victorias humanas ni como una comparación perfectamente aislada de un solo valor.

Las expediciones exploratorias siguen encontrando dificultad en los tramos profundos. No se ha aumentado la vida ni facilitado todo el final para hacer ganar al autómata: el siguiente ajuste necesita partidas humanas, especialmente con Resistencia, Velocidad y Dardo.
