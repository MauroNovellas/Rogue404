# Rogue404: auditoría de equilibrio

Fecha: 15 de octubre de 2026. Versión analizada: `8c63bb4`.

Este documento analiza el juego publicado, no aplica cambios a sus reglas. Los valores propuestos son una primera configuración para contrastar, no un balance definitivo validado con jugadores.

## 1. Conclusión principal

Rogue404 no tiene un único problema de «mucha» o «poca» vida. Su dificultad oscila demasiado según el equipo conseguido, la habilidad empleada y la planta. Un mismo personaje puede volverse casi inmune a enemigos normales con una armadura afortunada y, sin ella, encontrarse con un Trasgo que exige demasiada vida para el momento en que aparece.

Los problemas más importantes, por orden, son:

1. Reglas que distorsionan cualquier ajuste: reaparición de enemigos al regresar, pérdida de premios con mochila llena, obstáculos que pueden cortar una escalera e interacción anómala de Salvaje con la iniciativa y la IA enemiga.
2. Crecimiento incoherente del equipo: los objetos del suelo apenas progresan; los cofres progresan mucho más; los comerciantes cobran cada vez más por equipo que a menudo es peor que el de un cofre.
3. Salto demasiado fuerte en la planta 5 con el Trasgo y diferencias excesivas entre ejemplares de una misma especie.
4. Mochila demasiado ajustada para combinar consumibles, reliquias y equipo situacional sin acumular frustración.
5. Economía que deja de funcionar a partir de las tiendas intermedias y una supervivencia dominada casi exclusivamente por el agua.

**No empezaría cambiando los 100 puntos de vida.** Primero corregiría las reglas, el equipo, la tienda y el escalón del Trasgo. Después volvería a medir.

## 2. Método y límites

Se han utilizado las funciones reales de `game.js`, en un entorno local sin red ni dibujo. No se ha enviado ninguna puntuación al servidor.

Se han ejecutado:

- 3.600 mapas: 300 semillas, en cada una de las plantas 1–12.
- 200.000 tiradas de variación de calidad.
- 2.000 ofertas completas de tienda por cada una de las plantas 3, 6, 9 y 12.
- 51.300 duelos: 171 casos de enemigo, equipo, talento y ataque, con 300 repeticiones por caso.
- 180 expediciones del autómata: cinco perfiles, objetivos 3/6/9 y las mismas 12 semillas.
- 24 expediciones adicionales con ocho huecos, comparadas con las de seis huecos de los perfiles Prudente y Explorador.
- 48 ensayos sostenidos de 100 acciones, con y sin botas, diferentes niveles de Velocidad y con la IA real del Trasgo o una IA de intercambio simple.
- Reproducciones específicas de pérdida de premios, reaparición de enemigos, desperdicio en tiendas y bloqueo de escaleras.

Los duelos adyacentes usan daño, críticos, descolocación e iniciativa reales, pero neutralizan la huida y el territorio: sirven para comparar intercambios, no para representar una expedición. El ensayo sostenido separado sí incluye el APLASTAR real. Los equipos de los duelos son cargas prefijadas; los escenarios fuertes no son una promesa de que esos objetos se consigan juntos.

Los bots tienen limitaciones importantes: invierten siempre en Fuerza, no usan reliquias ni dardos, no venden y gestionan mal algunos objetos sobrantes. Por tanto, **sus porcentajes no son tasas de victoria humanas**. Además, las condiciones comparten semillas: las 180 expediciones no son 180 muestras independientes del azar. La comparación de seis y ocho huecos es una exploración pequeña, no una prueba estadística definitiva.

Código reproducible: `analysis/balance-audit.cjs`. Datos completos: `analysis/resultados/`.

## 3. Vida, curación y margen de error

### Valores actuales

- Vida inicial: 100.
- Ganancia automática: +10 de vida máxima por nivel de personaje.
- Subir de nivel cura completamente.
- Descansar recupera 2 de vida por acción en plantas normales e inestables.
- En hielo y magma no se cura descansando sin la pieza especial; con ella se recupera 1.
- No existe una curación pasiva general por caminar.

En los duelos controlados iniciales, un murciélago cuesta de media aproximadamente 4,4 de vida atacando por contacto, 3,7 con Rápido o 3 con Salvaje. Esto no incluye acercamientos en picado ni grupos. Con cinco murciélagos por primera planta, los 100 de vida ofrecen un margen razonable para aprender: no hay indicios de que deban reducirse globalmente.

El problema cambia con el Trasgo: el personaje no recibe un aumento de vida proporcional al salto de daño y duración del combate. Aumentar la vida a 130–150 desde el inicio suavizaría ese salto, pero haría más irrelevantes las primeras plantas y seguiría dejando los cofres defensivos demasiado fuertes.

La curación completa al subir nivel es muy poderosa: puede valer mucho más que la recompensa de un objeto. Es una recompensa agradable y una oportunidad táctica, pero amplifica la diferencia entre matar muchos enemigos y evitarlos. También hace especialmente peligrosa la reaparición de enemigos, porque permite repetir fuentes de XP y curación.

**Propuesta:** mantener 100 iniciales, +10 por nivel y la curación completa en la primera revisión. Instrumentar cuánto cura realmente cada subida. Solo si, tras corregir el equipo, esta curación domina las partidas, probar una recuperación parcial —por ejemplo 25–35% del máximo—. No cambiarlo todo a la vez.

Descansar 35 de vida cuesta unas 18 acciones en una planta normal: aproximadamente 2 comida y 3 agua según el momento del contador. El Cáliz, que consume 12 comida y 8 agua, es por tanto una curación de emergencia, no un sustituto económico del descanso. Esta distinción debe conservarse y explicarse.

## 4. Monstruos: escalado y dificultad

Las fórmulas actuales, antes de redondear, son:

- Vida: `(vida base + 2 × profundidad) × variación`.
- Ataque: `(ataque base + floor(profundidad / 2)) × variación`.
- Cantidad: `3 + profundidad + azar entre 0 y 2`.
- La variación tiene media 1,25 y extremos teóricos 0,5 y 2. Vida y ataque se sortean por separado.

Medias observadas, no atributos fijos de cada ejemplar:

| Planta | Especie | Vida media | Ataque medio | Cantidad total de enemigos en la planta |
| --- | --- | ---: | ---: | ---: |
| 1 | Murciélago | 8,8 | 2,5 | 5,0 |
| 3 | Murciélago | 13,7 | 3,7 | 7,0 |
| 3 | Goblin | 26,2 | 7,5 | 7,0 |
| 5 | Murciélago | 18,6 | 5,0 | 9,0 |
| 5 | Goblin | 31,4 | 8,9 | 9,0 |
| 5 | Trasgo | 62,3 | 17,5 | 9,0 |
| 9 | Trasgo | 72,2 | 20,0 | 13,0 |

La cantidad de la última columna es la suma de especies, no el número de ejemplares de cada una. A partir de la planta 5 se elige entre las tres especies sin una cuota de dificultad por planta; en promedio, aproximadamente un tercio son Trasgos. No aparece uno como presentación controlada: pueden aparecer varios a la vez en la primera planta donde se desbloquean.

### Murciélago

Está bien como enemigo inicial. Su picado introduce una regla reconocible. Su dificultad crece, pero no es el principal cuello de botella aislado. No reduciría su vida ni su daño en la primera pasada. Sí limitaría las diferencias entre ejemplares y evitaría agrupaciones iniciales excesivas junto a la entrada.

### Goblin

Tiene una identidad útil: más resistente que el murciélago, roba y puede obligarte a elegir entre perseguirlo o conservar seguridad. Su daño medio en la planta 3 es unas dos veces el del murciélago de esa planta y su vida también casi se duplica. Es un escalón visible, pero asumible si ya existe equipo básico.

No lo rebajaría de forma general antes de medir con la nueva curva de armaduras. La persecución de oro añade coste en acciones y agua que no se ve al comparar solo vida/daño.

### Trasgo

Es el mayor salto. En su estreno tiene casi el doble de vida y daño que el Goblin y, además, APLASTAR multiplica el ataque por 1,5. El golpe reforzado ronda 26 de fuerza antes de defensa y variación por impacto, frente a unos 9 del ataque normal de un Goblin.

En el extremo teórico del sorteo, un Trasgo de planta 5 puede alcanzar 28 de ataque, 42 al aplastar y 63 con crítico antes de defensa. Dos impactos así superan 120 de vida. Son extremos, no el resultado típico, pero muestran por qué una variación tan amplia perjudica la legibilidad del riesgo.

En los duelos simplificados de planta 5, con 120 de vida, arma +3, armadura +1 y dos puntos de Fuerza, combatirlo por contacto consume de media unos 88 de vida; un 20% de esos duelos acaba en derrota. Este ensayo ni siquiera incluye APLASTAR: no debe confundirse con un combate completo contra su IA.

En las expediciones a objetivo 6, 30 de 60 terminan por un Trasgo o Trasgo Alfa. Los bots no son buenos jugadores, pero el lugar donde se atascan coincide con el salto matemático.

**Propuesta de objetivos para la primera aparición, tras estrechar la variación:** 42–48 de vida, 10–12 de ataque normal y 15–18 al aplastar. Presentar inicialmente uno o dos por planta, no un tercio de la población; aumentar su presencia después. Son objetivos de diseño para volver a simular, no cifras ya validadas.

También separaría los élites del azar normal: un Alfa debería ser reconocible y poco frecuente, con aumento controlado y recompensa superior. Ahora el nombre Alfa depende de la tirada de vida, no de la de ataque; aproximadamente un 44% de las tiradas supera el umbral que lo nombra Alfa. No es una élite realmente rara.

## 5. Ataques, iniciativa y defensa

### Contacto, Rápido y Salvaje

En un ensayo sostenido de 100 acciones, con ataque total 10, sin Velocidad ni botas, contra un blanco suficientemente resistente para no morir:

| Ataque | Daño total causado | Respuestas ofensivas enemigas |
| --- | ---: | ---: |
| Contacto | 992 | 100 |
| Rápido | 860 | 50 |
| Salvaje | 1.864 | 100 |

Es una secuencia reproducible, no una media de todos los posibles combates.

**Rápido:** pierde algo de daño por acción, pero cancela aproximadamente la mitad de las respuestas. Con tres rangos de Velocidad y botas del caminante, en el mismo ensayo el contacto recibe 64 ataques y Rápido solo 14. La protección de Rápido no es un pequeño detalle: puede dominar la defensa del personaje.

**Salvaje:** su contraataque inmediato resta una acción de energía al enemigo. A velocidad normal acaba sustituyendo la respuesta habitual en lugar de añadir un coste ofensivo claro. Además, obliga a ese contragolpe aunque el personaje tenga más iniciativa: en el ensayo sigue recibiendo 100 contragolpes con tres rangos de Velocidad y botas, frente a los 64 de contacto.

Hay una consecuencia todavía más importante: contra el Trasgo, Salvaje fuerza el ataque genérico y consume el turno que habría ejecutado su IA. En el ensayo sostenido, contacto permite 50 APLASTAR y Salvaje ninguno. Una habilidad está desactivando accidentalmente la identidad táctica del enemigo.

**Propuesta:** corregir primero el planificador de Salvaje. Un contragolpe no debería sustituir silenciosamente la IA ni ignorar toda la inversión en iniciativa. Después probar:

- Rápido: mantener la identidad de ataque protector, pero permitir descolocar como máximo una vez cada tres acciones en vez de cada dos.
- Salvaje: probar daño ×1,25–1,30 y crítico total de 20%, con un coste de iniciativa explícito. No conservar a la vez su ventaja actual y un contraataque meramente aparente.
- Contacto: conservarlo como opción sencilla, fiable y sin efectos ocultos.

### Redondeos y Barrido

El daño base se redondea hacia abajo antes de la variación. Con ataque 3, Rápido trabaja sobre 2 de daño y Barrido sobre 1. El Barrido puede parecer espectacular pero repartir daños tan pequeños que deja vivos a todos los atacantes. Dos impactos no siempre compensan dejar de rematar uno.

Probaría redondeo al entero más cercano y Barrido al 60% con recarga de cuatro acciones, comparándolo con concentración de daño contra dos y tres enemigos. No lo haría gratuito ni permitiría uso continuo.

### Dardo arcano

Su desbloqueo ofrece algo que Fuerza no da: alcance y seguridad. Las mejoras posteriores compiten con Fuerza, que añade el mismo +2 de potencia al dardo y además mejora el cuerpo a cuerpo. A cambio, cada rango de dardo amplía el alcance. La elección no es idéntica, pero debe comunicarse bien.

El daño del arma no se añade al dardo. Un arma extraordinaria puede hacer que el lanzamiento parezca débil, aunque su ventaja sea evitar golpes. No añadiría munición ni rebajaría el rango ahora. Tampoco lo potenciaría basándome en estos bots, porque no lo utilizan. Necesita ensayos específicos de un personaje a distancia.

### Armadura y Resistencia

La reducción plana permite llegar a cero de daño con facilidad contra enemigos débiles. Una armadura +8 contra enemigos que pegan alrededor de 4–8 no es «un poco mejor»: elimina casi todo el riesgo.

En la planta 3, con un punto de Fuerza y arma +3, el duelo simplificado contra el Goblin cuesta unos 20,7 de vida por contacto. Añadir armadura +8 lo reduce a 1,8. El murciélago pasa a hacer cero. Los resultados señalan una discontinuidad del sistema defensivo, no una necesidad de añadir vida a todos los jugadores.

Probaría un límite de mitigación permanente del 75%: seguir bloqueando mucho, pero sin inmunidad general por una sola pieza. Defender podría tener un límite superior distinto. Hay que probarlo junto con la reducción del Trasgo: imponer daño mínimo sin ajustar lo demás castigaría especialmente al personaje defensivo.

El texto de Defender también necesita precisión: actualmente suma 2 a la defensa y después multiplica por 1,5. No es simplemente «+50% defensa»; incluso sin defensa previa puede bloquear 3.

## 6. Calidad: lo épico no es raro

El multiplicador se obtiene de la media de dos números uniformes y luego se transforma al intervalo 0,5–2. El centro de ese intervalo es 1,25, no 1.

Resultados de 200.000 tiradas:

| Calidad | Frecuencia |
| --- | ---: |
| Pésimo | 2,00% |
| Malo | 8,92% |
| Mediocre | 7,02% |
| Normal | 8,86% |
| Bueno | 23,20% |
| Excelente | 35,83% |
| Épico | 14,18% |

La mitad de los objetos sale Excelente o Épico. Por tanto, los colores de rareza prometen algo que la distribución no cumple. Además, un objeto pequeño puede cambiar de etiqueta sin cambiar de valor por el redondeo: una malla con distintas calidades puede seguir aportando el mismo punto.

**Propuesta:** separar tres conceptos que hoy comparten una función:

1. Variación pequeña del poder de objetos comunes.
2. Rareza deliberada y propiedades especiales.
3. Variación y élites de monstruos.

Como reparto inicial de etiquetas se podría probar 1% Pésimo, 4% Malo, 10% Mediocre, 45% Normal, 25% Bueno, 12% Excelente y 3% Épico. El valor base debe corresponder de verdad a Normal. No basta con cambiar los colores manteniendo la curva de poder actual.

## 7. Botín y progresión del equipo

### Cuánto aparece

En promedio, cada planta normal ofrece aproximadamente:

- Ocho pilas de 10 oro: 80 oro de suelo.
- 1,4 objetos de comida y 1,5 de agua.
- 1,3 cofres normales; las plantas especiales añaden uno especial.
- Un accesorio: botas en impares, anillo en pares.
- Arma de suelo en plantas pares.
- Armadura común de suelo solo en múltiplos de cinco.

Hay armaduras en cofres y tiendas antes de la planta 5; no es correcto decir que sea imposible conseguir una antes. Lo que falta es una vía básica de suelo, independiente de conseguir/escoger un cofre o pagar una tienda. Los crampones de planta 3 son ahora botas y no aportan defensa de armadura.

No veo escasez global de recompensas. El problema es su utilidad y la dispersión de sus valores. Hay unos 480 cuadros transitables por mapa y, según la planta, entre cinco y dieciséis enemigos. Las escaleras están a unas 31–32 acciones de distancia por ruta mínima; explorar y combatir puede multiplicar mucho ese recorrido. Los números de objetos deben juzgarse sobre la ruta real, no solo sobre el tamaño del mapa.

### El equipo del suelo se queda atrás

El arma común mantiene valor base 2 a cualquier profundidad; la malla común, 1. Los cofres normales suman profundidad a su base y los especiales añaden todavía más. Ejemplos de poder medio aproximado antes de considerar efectos:

| Fuente | Planta 3: arma / armadura | Planta 6 | Planta 9 |
| --- | ---: | ---: | ---: |
| Suelo común, si aparece | 2,5 / 1,22 | 2,5 / 1,22 | 2,5 / 1,22 |
| Cofre normal: opción de equipo | 6,25 / 5 | 10 / 8,75 | 13,75 / 12,5 |
| Cofre especial | 8,75 / 7,5 | 13,75 / 12,5 | 18,75 / 17,5 |
| Tienda, media medida | 3,77 / 2,50 | 7,54 / 4,99 | 15,07 / 9,99 |

No todas las fuentes aparecen en todas esas plantas ni un cofre concede arma y armadura a la vez. La tabla compara las fórmulas cuando la pieza existe.

Esto explica que una malla corriente posterior parezca basura y que el mercader pueda ofrecer, por mucho dinero, algo peor que una recompensa anterior.

**Propuesta:** una sola curva de poder por profundidad, compartida por suelo, tiendas y cofres. El cofre especial debe ofrecer una ventaja moderada o una propiedad única, no multiplicar varias veces el valor del equipo normal.

Objetivos iniciales de prueba para equipo de suelo:

- Armas: +2–3 en planta 2, +3–4 en 4, +4–5 en 6, +5–6 en 8 y +7–8 en 12.
- Una primera armadura de +1–2 accesible hacia la planta 2–3; después crecimiento gradual.
- Equipo especial: aproximadamente un escalón por encima del disponible en ese tramo.
- En el cofre especial, elegir entre arma y armadura, viendo el valor concreto. Evitar que la recompensa defensiva que necesitas dependa solo de un lanzamiento de moneda.

No aumentaría el número de objetos hasta ordenar estas curvas. Más botín inútil solo llena la mochila.

### Probabilidad real de reliquias y trampas

La configuración conserva `relicChance: 0.08`, pero ese parámetro no se usa en el código que entrega recompensas. No hay que interpretar que las reliquias aparecen en un 8% de cofres. El cofre normal elige dos familias distintas entre ocho; una es reliquia. Por tanto, antes de considerar la trampa, la probabilidad teórica de ofrecer una reliquia es 2/8 = 25%. Con el 15% de trampas, aproximadamente el 21,25% de aperturas normales ofrecería una, si el sorteo es uniforme. Recibirla depende de la elección del jugador; no es una entrega automática.

Los cofres normales tienen un 15% de trampa y hacen 15 de daño directo, sin mitigación por armadura. Con unos 1,3 cofres normales por planta, el daño directo esperado si se abren todos ronda 2,9 de vida por planta. La distribución importa más que esa media: el golpe puede matar a un jugador herido y la trampa también despierta enemigos de toda la planta. Los cofres de bioma no tiran esta trampa; su coste es el entorno.

Mantendría de momento el daño 15 y la probabilidad 15%: no parecen el principal desequilibrio. Sí eliminaría el parámetro de reliquias sin efecto o lo conectaría explícitamente a una regla documentada. El balance debe trabajar con probabilidades que realmente se ejecutan.

## 8. Comida y agua

### Reservas y oferta

Con 100 de reserva, sin recoger nada y sin efectos de suelo, la primera pérdida periódica de vida por deshidratación llega alrededor de la acción 600, y por hambre alrededor de la 1.000. En magma, el agua se agota hacia la 300. El daño por reserva vacía ocurre en cada acción posterior, no una vez cada seis/diez acciones.

Los objetos de una planta aportan de media unos 67–72 comida y 54–57 agua, antes de recortes por el límite de 100. A consumo normal, eso representa unas 670–720 acciones de comida y 324–342 de agua. El agua es aproximadamente el doble de restrictiva que la comida a largo plazo.

Además, la oferta varía mucho. En planta 1, el 10% inferior aporta como mucho aproximadamente 37 comida y 30 agua, y el 10% superior ronda 109 comida y 88 agua o más. Es oferta potencial: hay que encontrarla, poder recogerla y no desperdiciarla.

### Valoración

En plantas normales no parece faltar comida de manera estructural. El agua puede ser apropiada para rutas eficientes y excesivamente dura con exploración larga, persecuciones, inventario bloqueado o regreso con monstruos reaparecidos.

En las 180 expediciones de referencia no hubo muertes por hambre; sí las hubo por sed. Esto no demuestra que el hambre nunca importe, pero coincide con la relación entre oferta y consumo.

**Propuesta:** mantener inicialmente hambre cada diez acciones y sed normal cada seis. No subir ambos consumos para fabricar dificultad. Para magma, probar una presión de sed del 150% en vez del 200%, equivalente aproximadamente a perder agua cada cuatro acciones. La exposición de fumarolas debe medirse aparte.

Las resistencias tienen redondeos relevantes: si se baja el coste de una fumarola de 2 a 1 y se sigue redondeando hacia arriba, una resistencia del 50% puede dejar de ahorrar absolutamente nada. Para valores fraccionales conviene acumular exposición y consumir agua al alcanzar una unidad, no redondear cada acción por separado.

Los consumibles normales también deberían mostrar cuánto recuperarían ahora, para evitar gastar una ración potente por una carencia mínima. Las reliquias ya tienen esta protección; comida y agua todavía se pueden desperdiciar.

## 9. Mochila: seis frente a ocho huecos

Seis huecos eran razonables para arma, armadura y dos tipos de recurso. Con los sistemas actuales, una carga normal puede ser:

1. Comida.
2. Agua.
3. Una reliquia.
4. Una armadura alternativa para el ambiente.
5. Un par de botas alternativas.
6. Un objeto para vender o comparar.

No queda margen para una segunda reliquia, otro recurso o probar un anillo distinto. Las cuatro piezas equipadas no ocupan mochila, lo cual ayuda, pero los efectos de bioma fomentan conservar alternativas durante varias plantas.

En las expediciones con objetivo 6, la mochila de los bots estuvo llena alrededor del 65% de los pasos registrados. Hubo 3.012 intentos de recogida rechazados: **no son 3.012 objetos diferentes perdidos**; el bot puede insistir sobre el mismo objeto.

Comparación pareada con las mismas doce semillas:

| Perfil | Capacidad | Tiempo/pasos con mochila llena | Profundidad media máxima | Regresos desde objetivo 6 |
| --- | ---: | ---: | ---: | ---: |
| Prudente | 6 | 64,3% | 4,42 | 1/12 |
| Prudente | 8 | 28,8% | 4,50 | 1/12 |
| Explorador | 6 | 65,0% | 4,33 | 1/12 |
| Explorador | 8 | 43,1% | 4,75 | 1/12 |

Ocho reduce la presión y mejora algo el avance en este ensayo, pero no arregla el cuello de botella del combate. Los bots no venden ni usan reliquias, así que exageran parte de la saturación que un humano competente resolvería.

**Recomendación:** ocho huecos, sin apilar todavía cualquier cosa de forma ilimitada. Si sigue habiendo saturación tras varias partidas humanas, probar como alternativa pilas pequeñas de comida/agua con un máximo de dos, cuidando las calidades. No saltaría directamente a doce huecos.

Antes de ampliar, hay que corregir la pérdida de recompensas. Se ha reproducido que elegir una Piedra de Guardia con la mochila llena elimina la opción del cofre, no entrega el objeto y no lo deja en el suelo. Esto es una pérdida injusta, no una decisión de inventario. La recompensa debe quedar pendiente o aparecer en una casilla segura junto al cofre.

## 10. Economía y puntuación

Los precios de las tiendas escalan ×4 en cada nueva tienda, y el poder ×2. El oro de suelo permanece en 80 por planta. Cada enemigo concede 25 oro, sea murciélago o Trasgo.

| Tienda | Arma: precio medio | Agua: precio medio | Agua nominal media | Oro acumulado orientativo limpiando todas las plantas hasta allí |
| --- | ---: | ---: | ---: | ---: |
| Planta 3 | 251 | 125 | 63 | 690 |
| Planta 6 | 1.004 | 503 | 126 | 1.605 |
| Planta 9 | 4.016 | 2.012 | 252 | 2.745 |
| Planta 12 | 16.064 | 8.048 | 503 | 4.109 |

El oro orientativo suma suelo y bajas esperadas; excluye ventas, oro de cofres, gastos, robos y repetir plantas. No es una cuenta de lo que realmente llevará cada jugador. Aun así, deja claro que el precio crece mucho más que la economía ordinaria.

La tienda de planta 9 puede pedir unos 4.000 por un arma mientras limpiar las nueve plantas solo genera unos 2.745 antes de esas otras fuentes. Botas y anillos conservan sus propiedades, pero también multiplican su precio ×4: un anillo que cuesta 180 en la primera tienda cuesta 2.880 en la tercera sin mejorar su efecto.

Hay además crecimiento ficticio de consumibles: el agua de planta 12 promete unos 503 puntos, pero la reserva máxima es 100. La mayor parte del supuesto poder nunca puede aprovecharse. Desde planta 9, incluso las peores ofertas de agua del muestreo exceden 100.

### Propuesta de precios de ensayo

| Planta de tienda | Agua: recuperación / precio | Arma orientativa: precio | Armadura orientativa: precio |
| --- | ---: | ---: | ---: |
| 3 | 60 / 90 oro | 225 | 200 |
| 6 | 60 / 110 oro | 350 | 320 |
| 9 | 60 / 130 oro | 500 | 460 |
| 12 | 60 / 150 oro | 700 | 650 |

Estos precios deben acompañarse de la curva de poder coherente del apartado 7, no aplicarse a las armas desproporcionadas actuales. Los accesorios sin mejoras deberían subir poco de precio, no exponencialmente.

También separaría dinero y puntuación. Hoy comprar resta el mismo número usado como resultado final. Eso incentiva ahorrar para el ranking en lugar de disfrutar del equipo. Una baja de Trasgo debería premiar más que una de murciélago: una primera tabla a probar sería 10 / 20 / 40 oro para murciélago / Goblin / Trasgo, con bonificación explícita para élites. El resultado total de esa tabla debe simularse junto con tiendas: no es una promesa de más oro en todas las plantas.

La bolsa de oro del cofre siempre da 75. En cambio, una armadura de cofre normal de planta 3, con valor aproximado 5, se puede vender por unos 250 según la fórmula actual. Llevarla requiere un hueco y llegar al mercader, de modo que no es una superioridad absoluta, pero hay una diferencia de valoración importante. La bolsa, el equipo vendido y el dinero por bajas deben pertenecer a la misma economía, en vez de tener curvas desconectadas.

La puntuación puede valorar profundidad, regreso, descubrimientos y amenazas superadas sin ser simplemente el saldo de la cartera. No financiaría la inflación multiplicando indiscriminadamente el oro: ordenaría primero precios y utilidad.

## 11. Reliquias, botas y anillos

### Cáliz de Sangre

Su papel es bueno: recuperación inmediata a cambio de reservas. Al curar al menos 35 o el 35% del máximo, no se vuelve irrelevante con el nivel. Es caro frente al descanso, pero esa es una distinción legítima. Mantendría su curación. Si tras jugar casi nadie lo usa, probaría bajar el coste de 12 comida + 8 agua a 8 comida + 6 agua antes de aumentar la vida curada.

### Campana Hueca

Es probablemente la reliquia más universal: no consume reservas y protege frente a todos los enemigos visibles, además de cortar el rugido. Sus dos respuestas incluyen la de invocación, por lo que normalmente compra una acción adicional segura; no son dos acciones adicionales gratuitas después de activarla.

No la nerfearía ahora: es un consumible de un uso y el juego necesita herramientas para salir de un cerco. Hay que medir uso y desenlace de encuentros, no solo daño.

### Piedra de Guardia

Contra un solo enemigo que golpee en sus tres respuestas, +3 defensa evita como máximo unos 9 puntos antes de otros multiplicadores, más el siguiente golpe cargado. Cuesta 10 agua. Puede ser buena ante un grupo, pero su eficiencia contra un enemigo aislado es baja y los turnos se gastan aunque todavía no haya contacto.

Probaría bajar su coste a 6 agua manteniendo los tres turnos. No haría simultáneamente más duración, más defensa y menos coste; sería imposible saber qué ajuste funcionó. La mitigación de grupos y su interacción con Defender deben entrar en la prueba.

### Botas

- Caminante: +10% de iniciativa es útil casi siempre y tiene una interacción especialmente potente con Rápido.
- Polares: reducen la probabilidad normal de resbalón del 35% al 8,75%, y la de cámara del 70% al 17,5%; son una solución muy fuerte y comprensible para ese ambiente.
- Ceniza: son útiles en magma, pero casi no aportan fuera de él.
- Roca: reducen la pérdida de caída del 75% al 56,25% de la vida actual. No significan «solo pierdes 25%».

El problema principal no es aumentar sus cifras, sino dónde aparecen. Encontrar botas de roca muchas plantas antes de la primera zona inestable puede sentirse como botín inútil y ocupar un hueco durante demasiado tiempo. Propondría orientar las botas ambientales a su planta o a una/dos anteriores, manteniendo el caminante como opción generalista.

### Anillos

- Fuerza +1: gran mejora temprana, menor mejora relativa al final. Afecta también al dardo.
- Guardián +1: muy fuerte frente a ataques de 2–3, modesto frente a ataques de 18–20. Su valor cambia por la reducción plana y por la armadura disponible.
- Eco +2 de dardo: pasa un dardo básico de potencia 5 a 7, una mejora del 40%; requiere haber aprendido la habilidad y no sirve para un personaje exclusivamente de contacto.

Mantendría estas cifras en la primera revisión. Mostrar el requisito es esencial y ya está hecho. No convertiría cada anillo en una mejora acumulativa universal: tiene que existir elección de estilo.

## 12. Ambientes y castigos acumulados

El ciclo especial actual es hielo en 3/12, magma en 6/15 e inestable en 9/18; las otras plantas son normales.

### Hielo

El 35% de los movimientos puede resbalar; en cámara es 70%. Sin equipo polar no se cura descansando. El deslizamiento no consume un turno adicional por casilla: puede ser perjudicial por la trayectoria, pero a veces también ahorrar acciones. No es correcto valorarlo como puro daño.

Mantendría la identidad de hielo, pero comprobaría que el jugador tenga una ruta razonable a los crampones antes de exponerse al cofre. Probar 25% de resbalón normal y 50% en cámara sería una segunda opción si las partidas humanas muestran más pérdida de control que decisiones interesantes. No lo cambiaría solo porque los bots naveguen peor.

### Magma

Combina ausencia de descanso, doble sed y gasto extra de agua por acción en fumarolas. Diez acciones dentro de una fumarola añaden 20 de agua gastada antes de la sed normal: una parte importante de una planta que aporta unos 55 de agua en total.

Recomiendo probar primero sed ×1,5 y medir el recorrido de la zona opcional. Si se rebaja el poder del cofre especial, también hay que revisar su coste de acceso: no conservaría un castigo enorme por una recompensa ya moderada.

### Inestable

La caída pierde 75% de la **vida actual**, dispersa mochila y equipo, cambia de planta y puede dejar al personaje junto a nuevas amenazas. Son varios castigos superpuestos. El arnés reduce la pérdida al 37,5% y conserva lo equipado; con arnés y botas de roca queda en un 28,125% de pérdida.

Probaría una pérdida base del 50%, conservando la dispersión y la bajada. Seguiría siendo un error grave, pero dejaría más opciones de recuperación. Con el arnés actual la pérdida quedaría en 25%. No eliminaría toda la consecuencia ni transformaría las grietas en decoración.

Los bots de referencia no llegaron a esta zona: esta recomendación está basada en la acumulación de castigos y en las fórmulas, **no** en una tasa de muertes medida allí. Se necesitan partidas específicas entrando en planta 9 con equipo plausible.

## 13. Progresión y estilos de personaje

Coste acumulado de XP para niveles de personaje 2/3/4/5/6/7/8: 100 / 250 / 475 / 812 / 1.317 / 2.074 / 3.209.

Si se eliminan todos los enemigos, la oferta media acumulada de XP ronda 234 al terminar planta 3, 971 en 6 y 2.104 en 9: aproximadamente niveles 2, 5 y 7, con puntos pendientes según el momento exacto. Eso es un ritmo razonable para quien limpia plantas, pero el explorador que evita combates o huye de Trasgos puede llegar con muchas menos opciones de personalización.

No aumentaría indiscriminadamente toda la XP. Probaría una pequeña recompensa de 25 XP por descubrir por primera vez una nueva profundidad, una sola vez por partida y desde la planta 2, si queremos que explorar también construya al personaje. No darla al repetir escaleras.

Fuerza mejora el daño y acorta las respuestas recibidas; Resistencia compite con armaduras que a veces ya bloquean todo; Velocidad tiene combinaciones muy fuertes con Rápido y muy pobres con el Salvaje actual. Antes de declarar que una rama necesita +2 en lugar de +1, hay que corregir esas interacciones.

Como posible segunda iteración, Resistencia podría añadir además +5 de vida máxima por rango: una utilidad que no desaparece al encontrar una buena malla. No la aplicaría junto con todos los otros ajustes sin una prueba separada.

## 14. Problemas de reglas que hay que corregir primero

### Enemigos que reaparecen

El mapa conserva objetos recogidos y cofres abiertos, pero vuelve a crear enemigos al reentrar. En una reproducción, matar un enemigo de una planta de ocho deja siete; reinicializar la planta devuelve los ocho.

Esto tiene dos efectos opuestos: hace más costoso el regreso, porque ya no quedan los mismos recursos, y permite repetir bajas para conseguir XP y dinero. Hay que persistir el estado enemigo o, como mínimo, las bajas y el botín ya concedido. No es una cuestión de ponerles 5 menos de vida.

### Cofre con mochila llena

Se ha reproducido la desaparición de una recompensa sin entrar en la mochila ni quedar en el suelo. Mantener la elección pendiente o depositar el premio de forma segura debe ser obligatorio.

### Cofres que bloquean rutas

En cuatro de los 3.600 mapas analizados, al tratar cofres y tiendas como obstáculos igual que hace el movimiento, las escaleras no quedan comunicadas. No se está contando la ocupación temporal de enemigos.

Ejemplos: semilla 80, planta 3; semillas 104 y 288, planta 9; semilla 261, planta 12. En el primer caso, la distancia geométrica es 27, pero un cofre en (61,11) corta la ruta. Abrir el cofre no soluciona el problema porque los cofres abiertos siguen bloqueando el movimiento.

El 0,11% del muestreo no estima con precisión la frecuencia global, pero basta para demostrar que existe el caso. La conectividad debe comprobarse con los obstáculos reales. Permitir pasar sobre cofres abiertos y evitar colocar comerciantes/cofres en conexiones únicas son soluciones a valorar.

### Contraataque que salta la IA

Salvaje altera la respuesta, el uso de APLASTAR y el valor de Velocidad. Debe corregirse antes de ajustar la fuerza de los monstruos, para no equilibrar el juego alrededor de una vía que accidentalmente los neutraliza.

## 15. Qué muestran las expediciones automáticas

| Objetivo: llegar y regresar | Partidas | Regresos | Profundidad máxima media |
| --- | ---: | ---: | ---: |
| Planta 3 | 60 | 45 (75%) | 2,80 |
| Planta 6 | 60 | 5 (8,3%) | 4,30 |
| Planta 9 | 60 | 0 | 4,30 |

El desplome entre objetivos 3 y 6 coincide con el Trasgo, la falta de equipo útil en varias rutas del bot y su saturación de mochila. No significa que un humano tenga un 8,3% de probabilidades de llegar y volver de la planta 6. Los bots tampoco explotan el dardo, las reliquias, las ventas ni una selección inteligente entre las dos recompensas del cofre.

La lección práctica es dónde investigar y qué comparar después. No «hacer ganar al bot» a cualquier precio.

## 16. Primera configuración de prueba recomendada

No aplicaría todo este documento de una vez. Este sería el primer paquete, por orden:

| Área | Cambio inicial propuesto | Motivo |
| --- | --- | --- |
| Reglas | Persistir enemigos; no perder premios; garantizar rutas reales | Quitar castigos y ventajas accidentales |
| Salvaje | Integrar su coste en iniciativa y preservar la IA | Comparar ataques y monstruos de forma válida |
| Vida | Mantener 100 y +10 por nivel | No tapar los otros problemas con una reserva mayor |
| Mochila | 6 → 8 huecos | Dejar sitio para probar los sistemas añadidos |
| Monstruos | Estrechar variación y presentar 1–2 Trasgos en planta 5 | Reducir picos; no rebajar a todas las especies |
| Trasgo inicial | Objetivo 42–48 HP y 10–12 ataque; APLASTAR 15–18 | Un enemigo fuerte, no un salto desproporcionado |
| Equipo | Una curva común; primera armadura básica antes de planta 5 | Que el progreso no dependa tanto de un cofre |
| Defensa | Ensayar límite de mitigación permanente del 75% | Evitar que una malla elimine todo el riesgo |
| Tiendas | Precios moderados y consumibles de tamaño aprovechable | Volver a dar decisiones reales al dinero |
| Agua | Mantener normal; ensayar magma ×1,5 | Concentrar el ajuste donde se acumulan costes |

Después, con esa referencia estable, probaría Rápido, Barrido, Piedra, caída, XP por exploración y rareza mediante cambios separados o pequeños grupos coherentes. No cambiaría los anillos ni nerfearía la Campana sin datos de uso real.

## 17. Cómo validar el siguiente balance

Registrar por partida:

- Acciones y tiempo real por planta; separar ida y regreso.
- Daño recibido de cada especie, APLASTAR, trampas y supervivencia.
- Curación por descanso, nivel y Cáliz.
- Poder de arma y defensa al entrar en cada planta; fuente del equipo.
- Reservas al entrar/salir y recursos desaprovechados por el límite de 100.
- Tiempo con mochila llena, recogidas rechazadas y objetos tirados/vendidos.
- Uso y resultado de cada ataque, talento y reliquia.
- Compras posibles, compras realizadas y oro restante.
- Muertes, huidas exitosas y decisiones previas, no solo puntuación final.

Ampliar el autómata para que use dardos/reliquias, elija recompensas, venda sobrantes y no insista en recoger objetos que no caben. Repetir con las mismas semillas para comparar versiones. Incluir entradas controladas a plantas 6 y 9 con equipo plausible: las expediciones desde nivel 1 no bastan si mueren antes.

Después realizar partidas humanas de primera vez y de jugadores que ya conocen las reglas. Como objetivo de diseño —no como dato del sector— propondría que la expedición corta enseñe y permita regresar a la mayoría de jugadores que han entendido el combate; que la de planta 6 exija decisiones; y que la de planta 9 sea un reto, no una lotería de armadura.

**Veredicto:** hay suficientes recursos y sistemas para un buen juego. Lo que falta no es inflar la vida ni llenar más salas: es hacer que el poder, el riesgo y la recompensa crezcan con la misma lógica.
