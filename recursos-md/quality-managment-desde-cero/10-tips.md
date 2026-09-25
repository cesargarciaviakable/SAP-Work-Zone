# 10 — Tips prácticos

## Qué vas a aprender

Una colección de consejos sueltos que no encajaban en ningún capítulo
anterior pero que vale la pena tener a mano: comandos de diagnóstico,
convenciones que facilitan mantener el proyecto, y hábitos que evitan
volver a tropezar con los errores del capítulo 09.

---

## Desarrollo local

**Usa los scripts `watch-qm-<app>` en vez de `watch` genérico** cuando
estés iterando sobre una sola app — te ahorra tener que navegar desde el
launchpad local cada vez que reinicias:

```bash
npm run watch-qm-inspector
```

**Prueba cada rol por separado con los usuarios mockeados** (`bob` =
Inspector, `carol` = Supervisor, `alice` = los tres) en vez de probar todo
siempre como `alice` — es la única forma de detectar temprano un
`@restrict` mal configurado, en vez de descubrirlo en producción.

**Después de tocar cualquier `srv/*.cds`** (no solo `db/schema.cds`),
corre un redeploy local antes de asumir que un error es de lógica:

```bash
cds deploy --to sqlite:db.sqlite
```

**Nunca cambies de rama con `cds watch` corriendo** — detén el proceso
primero. El proyecto tiene ramas de feature locales obsoletas que todavía
trackean `db.sqlite-shm`/`-wal` (capítulo 09, lección 12); un checkout
accidental mientras SQLite tiene el archivo abierto en modo WAL puede
corromper tu base de desarrollo.

**Respalda `db.sqlite` antes de cualquier operación arriesgada** (cambio
de rama, redeploy, probar un script nuevo). Un patrón simple de nombre de
archivo con timestamp ISO compacto, como usa `db-backups/` en este
proyecto:

```bash
sqlite3 db.sqlite "VACUUM INTO 'db-backups/db-$(date -u +%Y%m%dT%H%M%SZ).sqlite'"
```

`VACUUM INTO` produce una copia consistente incluso con el archivo abierto
por otro proceso (`cds watch`).

---

## Modelo de datos y servicios

**Cuando definas una columna calculada con `case/when`**, navega siempre
por la ruta de asociación (`status.code`), nunca por el nombre físico de
la foreign key (`status_code`) — dentro de un `case`, CDS no resuelve el
shorthand `_code` (capítulo 09, lección 9).

**Toda columna calculada que gobierna la UI en la entidad activa
(`case/when` en el `.cds`) necesita su espejo manual en el draft** — las
columnas de la tabla `_drafts` son literales, nadie las recalcula solas.
Este proyecto centraliza ese espejo en funciones como
`aplicarControlesDraft` (capítulo 04) — sigue ese patrón en vez de
duplicar la lógica de control en cada `before` de draft.

**`@readonly` a nivel de campo es solo una pista de UI**, no una
protección real contra un `PATCH` directo al draft ni contra la
activación (`preserve_computed` de CAP la puede saltar). Si necesitas
bloquear la escritura de verdad, refuerza en el handler con algo como
`ignorarCambiosDeMaestro` (capítulo 04).

**Nunca redirijas la asociación de un hijo draft hacia otra raíz
draft-enabled del mismo servicio** — crea una proyección de solo lectura
intermedia (el patrón `ParametrosVH`, capítulo 09 lección 8) si necesitas
esa navegación.

**Cuando una entidad expone la misma tabla base varias veces en un
servicio** (por ejemplo, a través de vistas de reporte), marca la
proyección canónica con `@cds.redirection.target: true` — evita
ambigüedad de navegación OData (capítulo 03, `ReportsService`).

---

## Handlers

**Siempre `return req.error(...)`** — nunca lo llames sin `return`.
`req.error` no lanza una excepción, solo acumula el error; sin el
`return`, el código sigue ejecutándose con datos que ya deberían haberse
rechazado.

**Usa `req.reject` (no `req.error`) dentro de una función auxiliar** que
se llama desde varios handlers — `req.reject` sí lanza, así que no
depende de que el llamador recuerde comprobar el resultado antes de
seguir (ver `inspeccionPendiente` en `supervisor-service.js`, capítulo
04).

**Cuando una raíz draft tiene hijos editables, valida el documento
profundo completo en el `before(['CREATE','UPDATE'], Raíz)`** — es la
única garantía real en la activación; los `before` sobre `.drafts` de los
hijos nunca se disparan quando el draft se activa de una sola vez.

**Reserva `req.error` para bloquear, y `req.warn`/`req.info` para avisar
mientras el usuario edita.** No mezcles ambos: el bloqueo duro pertenece
al momento de activar/guardar, no a cada tecla que el usuario escribe.

---

## Anotaciones UI

**El calificador `#Nombre` en `UI.LineItem`/`UI.FieldGroup` conecta esa
anotación con el `Target` de un `UI.Facets`** que navega por composición
— es fácil olvidarlo y terminar con una tabla anidada vacía porque el
calificador no coincide.

**`Common.SideEffects` es imprescindible cada vez que un campo calculado
depende de otro que el usuario edita** — sin él, el usuario tiene que
guardar y reabrir para ver el campo derivado actualizado.

**Revisa siempre las dos mitades de una regla de negocio: backend y
UI.** Es perfectamente posible que una regla esté bien implementada en el
handler (el dato queda correcto) y aun así le falte su
`Common.FieldControl`/`Common.SideEffects` del lado cliente — el ejemplo
real de este proyecto es la unidad de medida en `qm-parametros`, que sigue
apareciendo editable para un parámetro visual aunque el servidor la anule
al guardar (capítulo 05e).

**Cuando bloquees Create/Delete de una entidad con `Capabilities`, agrega
también `UI.CreateHidden`/`UI.DeleteHidden`** — `Capabilities` es la
protección real, pero sin los `Hidden` el usuario ve un botón que de todas
formas va a fallar con 405.

---

## Infraestructura y deploy

**Cada app nueva bajo `workspaces: ["app/*"]` necesita
`npm install --package-lock-only` de inmediato** — de lo contrario, el
`npm ci` del `before-all` del `mta.yaml` falla en build con
`Missing: <app>@<version> from lock file` (capítulo 09, lección 11).
Verifica con `npm ci --dry-run` antes de confiar en el build de CI.

**Nunca uses un nombre de destination genérico** en un subaccount que
podría alojar más de un proyecto — califícalo siempre con el ID del
proyecto (`quality-managment-srv-api`, no `srv-api`).

**El `sap.cloud.service` debe ser idéntico en tres lugares**: el
`manifest.json` de cada app, el `mta.yaml` (destination-content), y no
debe colisionar con el de otro proyecto en el mismo subaccount.

**En trial, antes de investigar un problema de Work Zone, corre `cf
apps`** — la causa más probable es que el backend está detenido, no un
error de configuración.

**Un usuario necesita dos asignaciones separadas para usar una app**: la
role collection de BTP (autoriza el backend) y el rol de Work Zone
asignado al site (muestra el tile). Ninguna sustituye a la otra (capítulo
06).

---

## Testing

**Si tu proyecto tiene un `db.kind` configurado para el perfil por
defecto, no confíes en que `cds.test()` sin argumentos use una base en
memoria** — fuerza el modo en memoria explícitamente, en más de una capa
si es posible (variable de entorno + flag, capítulo 08).

**Usa IDs de fixture legibles y comentados** (`...000501 // LOTE-2026-001`)
en vez de UUIDs aleatorios — facilita ubicar la fila correspondiente en el
CSV al diseñar un caso nuevo.

**Cuando una regla depende de una anotación CDS, verifica el `$metadata`
real (el XML), no solo el comportamiento del endpoint** — una anotación
puede fallar en compilar al metadata sin que ningún handler se entere; el
patrón `bloque()` de `test/supervisor-list.test.js` (capítulo 08) es un
buen ejemplo de cómo extraer y verificar un fragmento específico del
metadata.

**Un test de regresión merece un nombre descriptivo del bug**, no un
nombre genérico — es lo primero que alguien va a leer cuando ese test
falle meses después.

---

## Git y entorno BAS

**Configura `gh auth setup-git` una vez al principio del proyecto** si vas
a usar terminales distintas dentro de BAS — evita el error "Invalid
username or token" al hacer `git push` desde una terminal que no es la
integrada del editor.

**Borra las ramas de feature locales ya fusionadas.** Además de mantener
limpio el repositorio, evita el riesgo de un checkout accidental a una
rama vieja que todavía trackea archivos de SQLite que ya no deberían
estar versionados.

---

## Resumen / checklist rápido antes de dar por cerrada una tarea

- [ ] ¿El handler nuevo corre en la fase correcta (`before`/`on`/`after`)
      y termina en `return req.error(...)` cuando corresponde?
- [ ] ¿La columna calculada nueva del `.cds` tiene su espejo manual en el
      draft, si aplica?
- [ ] ¿La anotación de UI tiene su `Common.SideEffects` si depende de otro
      campo editable?
- [ ] ¿Corriste `cds deploy --to sqlite:db.sqlite` local después de tocar
      un `.cds` de servicio?
- [ ] ¿Corriste `npm test` (no solo probaste manualmente en el browser)?
- [ ] Si agregaste una app nueva: ¿está en `package-lock.json`,
      `sapux`, `mta.yaml` (módulo html5 + entrada en app-content), y su
      propio `xs-app.json`/`manifest.json` con el `sap.cloud.service`
      correcto?
- [ ] Si agregaste una regla de negocio: ¿está reflejada tanto en el
      backend como en la UI (Capabilities + Hidden, o FieldControl +
      SideEffects)?
