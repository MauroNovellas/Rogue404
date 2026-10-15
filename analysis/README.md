# Auditoría de balance

Esta carpeta conserva los datos originales de `8c63bb4` en `resultados/`. El informe histórico está en `../ANALISIS_BALANCE.md`; los cambios implementados, en `../BALANCE_APLICADO.md`.

La herramienta carga el motor real en una máquina virtual con una interfaz simulada. Anula dibujo y acceso a red; nunca guarda resultados en el servidor. Solo modifica la configuración de su propia máquina virtual para las comparaciones.

Con Node.js, desde la raíz del repositorio:

```bash
ROGUE_AUDIT_TAG=balance-1 node analysis/balance-audit.cjs world 300
ROGUE_AUDIT_TAG=balance-1 node analysis/balance-audit.cjs sustained
ROGUE_AUDIT_TAG=balance-1 ROGUE_AUDIT_GOALS=3,6,9 ROGUE_AUDIT_PROFILES=prudent,explorer,novice node analysis/balance-audit.cjs bots 12
ROGUE_AUDIT_TAG=balance-1 node analysis/balance-audit.cjs archive
node tests/balance.test.cjs
```

Los primeros comandos generan JSON etiquetados en `/tmp/rogue404-balance-*.json`. `archive` conserva los conjuntos disponibles en una carpeta nueva `analysis/resultados-ETIQUETA/`; nunca sobrescribe los originales ni una carpeta ya existente. Cambia la etiqueta para otro experimento. La capacidad por defecto es la del motor; `ROGUE_AUDIT_CAPACITY` permite compararla con otra.

`world.json` contiene potencial de recursos, no lo que un jugador necesariamente encuentra o recoge. `sustained.json` contrasta la IA real del Trasgo. El autómata de Balance 1 compara premios, usa reliquias y vende excedentes: su política no es idéntica a la original. Sigue sin usar dardos y prioriza Fuerza. Sus expediciones no son tasas de victoria humanas ni muestras totalmente independientes.

Los modos `duels` y `checks` se conservan como referencia del análisis histórico, pero se bloquea su ejecución: contienen cargas/supuestos anteriores y no deben presentarse como mediciones actuales. Sus JSON originales siguen disponibles sin alteraciones. Las reglas actuales se comprueban con la suite de balance.
