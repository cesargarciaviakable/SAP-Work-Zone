# 09 — Errores y lecciones

## Qué vas a aprender

Dieciséis problemas reales que aparecieron durante el desarrollo de este
proyecto, cada uno con su síntoma exacto, su causa, su solución, y cómo
evitarlo la próxima vez. Cada lección que tiene un commit de respaldo lo
cita con su SHA y su mensaje real — verificado contra `git log`, no
inventado. Cuando una lección es puramente operativa (sin huella en el
código), se marca como tal en vez de forzar una referencia que no existe.

Si solo vas a leer un capítulo de esta guía además del 04, que sea este.

---

## 1. Work Zone da 404 "route does not exist" — las apps están detenidas, no rotas

**Síntoma**: al abrir un tile en Work Zone, error `404 - route does not
exist`.

**Causa**: en una subaccount **trial** de Cloud Foundry, las apps se
detienen automáticamente tras un período de inactividad (típicamente
durante la noche). El 404 no es un problema de configuración — el proceso
del backend simplemente no está corriendo.

**Solución**: antes de investigar nada más, comprueba el estado real:

```bash
cf apps
```

Si ves `stopped` en algún módulo (salvo el `-db-deployer`, que termina su
trabajo y se detiene por diseño), arráncalo:

```bash
cf start quality-managment-srv
```

Hay un alias en `~/.bashrc` para arrancar todo de una sola vez, excluyendo
los `db-deployer`:

```bash
alias cf-start-all='cf apps | awk "\$2==\"stopped\" && \$1 !~ /-db-deployer\$/ {print \$1}" | xargs -r -n1 cf start'
```

**Cómo prevenirlo**: recuerda que este alias **no se ejecuta solo** — no
hay ningún hook, cron, ni trigger que lo dispare al abrir tu dev space.
Tienes que invocarlo tú mismo (`cf-start-all`) cada vez que retomes el
proyecto después de inactividad.

Un segundo síntoma relacionado: Work Zone puede mostrar contenido
**cacheado** de otro proyecto (en este caso llegó a aparecer una app de
un proyecto viejo de lista de tareas) — el Content Channel de HTML5 Apps
necesita un refresco manual después de un deploy, sobre todo si el
subaccount tiene varios proyectos compartiendo el mismo canal.

*Sin evidencia de commit — es un hecho operativo de Cloud Foundry trial y
de Work Zone, no código del repositorio.*

---

## 2. Colisión de nombres de destination entre proyectos del mismo subaccount

**Síntoma**: la app cargaba pero las llamadas OData fallaban de forma
intermitente o apuntaban al backend equivocado — un destination genérico
llamado `srv-api` resolvía, en algún momento, hacia el backend de **otro**
proyecto (uno de gestión de tareas) que compartía el mismo subaccount y
también registraba un destination con ese nombre genérico.

**Causa**: nombres genéricos (`srv-api`) y un approuter standalone
(`app/router/`) no aíslan bien un proyecto de otro dentro del mismo
subaccount BTP — cualquier destination con el mismo nombre puede
sobreescribir o colisionar con el de otro proyecto.

**Solución** — commit `ce70743`, *"chore(qm): migrate to managed approuter
and scoped destinations"*:

- Se eliminó por completo el módulo `app/router/` (el diff de ese commit
  borra `app/router/xs-app.json` entero: 33 líneas eliminadas, 0
  añadidas) y se migró a **managed approuter** (`deploy_mode: html5-repo`
  en `mta.yaml`, capítulo 07).
- El destination se renombró de un genérico a
  `quality-managment-srv-api` (nombre calificado con el ID del proyecto).
- `sap.cloud.service` se fijó a `lote.inspector` (único para este
  proyecto) en el `manifest.json` de cada app y en el `mta.yaml`.
- `xs-security.json` ajustó su `xsappname` a `quality-managment`
  (namespaced) en vez de un nombre genérico.
- Cada `xs-app.json` de cada app pasó de `"destination": "srv-api"` a
  `"destination": "quality-managment-srv-api"`.

**Cómo prevenirlo**: nunca uses un nombre de destination genérico
(`srv-api`) en un subaccount que va a alojar más de un proyecto CAP.
Califica siempre el nombre con el ID del proyecto, y usa un
`sap.cloud.service` único por proyecto desde el primer commit — cambiarlo
a mitad de camino, como pasó aquí, obliga a tocar los cinco
`manifest.json`, los cinco `xs-app.json`, y el `mta.yaml` a la vez.

---

## 3. DELETE 403 Forbidden — faltaba el grant en `@restrict`

**Síntoma**: `403 Forbidden` al intentar borrar un lote o una inspección,
incluso con el rol `Inspector` correcto.

**Causa**: el `@restrict` de `Lotes`/`Inspecciones` no tenía ningún grant
para `DELETE` — la regla general de `@restrict` en CAP es que lo que no se
otorga explícitamente queda denegado por defecto.

**Solución** — commit `c79bb6d`, *"fix(qm): allow status-gated delete of
lotes and inspecciones"*:

```cds
// srv/inspector-service.cds
@restrict: [
    { grant: 'READ',   to: 'Inspector' },
    { grant: 'CREATE', to: 'Inspector' },
    { grant: 'UPDATE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' },
    { grant: 'DELETE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' }
]
```

Se agregó el grant `DELETE` para `Lotes` (condicionado a
`PENDIENTE`/`EN_INSPECCION`) y el equivalente para `Inspecciones`
(condicionado a `ABIERTA`). El mismo commit agregó el arnés de tests
(`@cap-js/cds-test`) y `test/inspector-delete.test.js`.

**Nota importante que no es un bug**: si intentas editar un lote
`APROBADO` y te da 403, **eso no es un error a corregir** — es el grant
`UPDATE` funcionando exactamente como se diseñó (`where: status_code =
'PENDIENTE' or 'EN_INSPECCION'`). No confundas una restricción intencional
con un bug de permisos faltantes.

**Cómo prevenirlo**: cuando definas un `@restrict`, haz una lista
explícita de qué operaciones necesitas por rol — un servicio de escritura
casi siempre necesita `READ`, `CREATE`, `UPDATE` **y** `DELETE`; olvidar
uno no produce un error de compilación, produce un 403 silencioso en
tiempo de ejecución.

---

## 4. `cumple` no se guardaba — quién es dueño del campo según el tipo de parámetro

**Síntoma**: el resultado de "cumple" de un parámetro visual se
sobreescribía o se perdía; no había forma de distinguir claramente un
checkbox capturado por el usuario de un valor calculado por el servidor.

**Causa**: el servidor recalculaba `cumpleVisual` para **todos** los
resultados, incluidos los de parámetros `VISUAL` — pero para esos, el
valor debe ser una elección exclusiva del usuario (no hay rango contra el
cual evaluar una inspección visual).

**Solución** — dos commits:

**`5707d74`** — *"feat(qm): compute pass/fail icon for numeric
parameters"*:
> Visual parameters keep an editable checkbox that the server never
> overwrites; numeric results are always evaluated against the material
> range, with field control and criticality exposed to the UI.

Introduce `evaluarCumplimiento` en `srv/handlers/inspector-service.js`
(capítulo 04) y las columnas calculadas `esVisual`, `criticidad`,
`controlValorObtenido`, `controlCumpleVisual` en `srv/inspector-
service.cds` (capítulo 03), además de `test/cumple.test.js` completo.

**`9b0dfc1`** — *"fix(qm): block cascade delete of completed inspections
and stale cumple"*:
> Reject deleting a lote that has non-open inspecciones, and reset
> cumpleVisual when a draft resultado switches to a visual parametro.

Este es el commit que introduce el parámetro `parametroCambio` en
`aplicarControlesDraft` (el comentario `R3-param-switch-stale-cumple` que
ves en el código actual, capítulo 04) y el guardia
`before('DELETE', Lotes, ...)` (comentario `R3-lote-delete-cascade`).

**Cómo prevenirlo**: cuando un mismo campo puede tener dos "dueños"
distintos según una condición (aquí, el tipo de parámetro), documenta
explícitamente en el código quién es el dueño en cada caso y refuerza esa
propiedad en cada punto donde el campo se escribe — no solo en el
`CREATE` inicial. El bug real aquí no fue el cálculo en sí, sino un caso
de borde: cambiar el parámetro de un resultado ya existente de numérico a
visual, donde un valor calculado viejo podía sobrevivir disfrazado de
elección del usuario.

---

## 5. `@assert.unique` en SQLite da un 500 crudo — hace falta un check explícito

**Síntoma**: al intentar crear un registro duplicado que viola una regla
de unicidad, el usuario recibe un error 500 genérico ("Internal Server
Error") en vez de un mensaje de negocio legible.

**Causa**: `@assert.unique` genera un constraint a nivel de base de
datos. SQLite lo hace cumplir, pero CAP no siempre traduce esa violación a
un HTTP 400 con mensaje legible — el error que llega a la UI es un 500
sin contexto.

**Solución**: verificar la condición **antes** de escribir, y devolver un
`400` con mensaje propio. El proyecto tiene dos variantes de este mismo
patrón:

```cds
// db/schema.cds
@assert.unique: { materialParametro: [material, parametro] }
entity ParametrosMaterial : cuid { /* ... */ }
```

```js
// srv/handlers/config-service.js — refuerzo explícito de esa misma regla
if (vistos.has(rango.parametro_ID)) {
    return req.error({
        code: 400,
        message: 'El parámetro no puede repetirse en el mismo material',
        target: `parametros[${i}]/parametro_ID`
    })
}
```

```js
// Un segundo caso, SIN @assert.unique de respaldo en el schema:
// Parametros.codigo no declara ninguna restricción de unicidad a nivel
// de base de datos — la unicidad es responsabilidad exclusiva del handler.
if (existentes.some((p) => p.ID !== id)) {
    return req.error({
        code: 400,
        message: `Ya existe un parámetro con el código ${req.data.codigo}`,
        target: 'codigo'
    })
}
```

**Cómo prevenirlo**: no confíes en que `@assert.unique` por sí solo te dé
un error legible para el usuario final — siempre agrega una consulta
previa (`SELECT` + comparación) en el handler que traduzca la violación a
un `req.error(400, ...)` con mensaje de negocio. Si además necesitas la
garantía a nivel de base de datos (protección contra condiciones de
carrera), usa ambas capas juntas, como en `ParametrosMaterial`; si solo
necesitas la validación de aplicación, un check en JavaScript basta, como
en `Parametros.codigo`.

*No hay un commit único que "arregle" esto de punta a punta — es un
comportamiento verificado en el código vigente, repartido en varios
commits de `config-service`.*

---

## 6. Los tests vaciaban la base de datos persistente de desarrollo

**Síntoma**: después de correr `npm test`, los datos capturados durante
el desarrollo manual (lotes, inspecciones creadas a mano probando la UI)
desaparecían del `db.sqlite`.

**Causa**: el patrón documentado de `@cap-js/cds-test`
(`cds.test(__dirname + '/..')`) solo activa una base de datos en memoria
automáticamente cuando el proyecto **no tiene ningún `db` configurado**.
Este proyecto sí tiene `cds.requires.db` configurado (SQLite persistente
para `[development]`, capítulo 01) — así que sin protección adicional, los
tests corrían contra el archivo real y lo sobreescribían con los datos de
los CSV de fixture.

**Solución** — commit `649c228`, *"test(qm): force in-memory database for
the test script"*:

```diff
-    "test": "node --test test/*.test.js"
+    "test": "CDS_PLUGIN_UI5_ACTIVE=false CDS_REQUIRES_DB_CREDENTIALS_URL=:memory: node --test test/*.test.js"
```

> A test hook that connected before cds.test bootstrapped redeployed the
> persistent development sqlite. Overriding the db url at the process
> level makes every test run use an in-memory database regardless of hook
> order.

Además, cada archivo de test pasa el flag `'--in-memory'` explícito a
`cds.test()` como segunda capa de protección (capítulo 08).

**Cómo prevenirlo**: si tu proyecto CAP tiene un `db.kind` configurado
para el perfil por defecto, **nunca** asumas que `cds.test()` sin
argumentos adicionales usa una base en memoria — verifícalo leyendo
`@sap/cds/bin/serve.js` o, más simple, fuerza explícitamente el modo en
memoria en dos capas independientes (variable de entorno + flag), como
hace este proyecto.

**Recomendación operativa adicional** (sin automatización en el repo):
respalda `db.sqlite` periódicamente con `VACUUM INTO` antes de cualquier
operación arriesgada (un redeploy, un cambio de rama, correr un script
nuevo) — es una forma consistente de copiar un SQLite incluso con `cds
watch` corriendo. El proyecto tiene una carpeta `db-backups/` con
snapshots reales, nombrados con timestamp ISO compacto:

```
db-20260924T181716Z.sqlite
db-20260924T203228Z.sqlite
db-20260924T204609Z.sqlite
db-20260924T205029Z.sqlite
```

Verifica los respaldos por **conteo de filas**, no solo por fecha de
modificación — un archivo puede tener una fecha reciente y aun así estar
vacío si algo lo truncó.

---

## 7. `no such table X_drafts` / vistas faltantes tras cambiar el `.cds`

**Síntoma**: al agregar una entidad de servicio nueva, una proyección
nueva, o una columna calculada nueva, `cds watch` local da un error tipo
`no such table: ConfigService_Materiales_drafts` o una vista referenciada
no existe.

**Causa**: `@cap-js/sqlite` sirve las entidades de un servicio a través de
**vistas SQL** generadas a partir de las proyecciones `.cds`. Esas vistas
no se regeneran solas cuando cambias el modelo — necesitas un redeploy
local explícito.

**Solución**:

```bash
cds deploy --to sqlite:db.sqlite
```

Corre esto cada vez que agregues un servicio, una proyección nueva, o una
columna calculada, **antes** de volver a levantar `cds watch`.

**Cómo prevenirlo**: cuando cambies `srv/*.cds` (no solo `db/schema.cds`)
y algo empiece a fallar con "no such table"/"no such column" apenas
arranca el servidor local, tu primer paso de diagnóstico debería ser un
redeploy local del esquema, no revisar la lógica del handler.

*Sin commit ni mención en ningún README/CLAUDE.md del repo — es
conocimiento operativo de `@cap-js/sqlite`, no un fix puntual del código.*

---

## 8. Crash de draft al cambiar el parámetro de un rango en qm-rangos

**Síntoma exacto**:

```
no such column: $p.DraftAdministrativeData_DraftUUID
```

...al cambiar el parámetro de una fila de rango (`ParametrosMaterial`) en
la app `qm-rangos`.

**Causa**: `ParametrosMaterial` es hijo de un draft (`Materiales`), y su
asociación `parametro` apuntaba directamente a `Parametros`, que **también**
tiene `@odata.draft.enabled`. Un `Common.SideEffects` disparaba una lectura
de la fila navegando `parametro/tipoParametro_code`; Fiori Elements
expandía `DraftAdministrativeData` como parte de esa lectura, y el SQL de
"lean draft" de CAP intentaba leerlo de la tabla **activa** de
`Parametros`, que no tiene esa columna — la petición fallaba.

**Solución** — commit `9bd5c78`, *"fix(qm): stop draft navigation crash
when changing a range parameter"*:

```cds
// srv/config-service.cds
parametro : redirected to ParametrosVH,
```

Se creó una proyección adicional, de solo lectura y **sin** draft
(`ParametrosVH`), exclusivamente como destino de esa navegación y como
colección del value-help correspondiente (capítulo 05d). El mismo commit
agregó el handler de feedback en vivo (`req.warn`/`req.info` sobre
duplicados y límites faltantes, capítulo 04) y un test de regresión que
reproduce el error exacto:

```js
it('reads the navigated parametro after changing a range\'s parametro, without crashing on DraftAdministrativeData', async () => {
    // ...
})
```

**Regla general para prevenirlo**: **nunca redirijas la asociación de un
hijo draft hacia otra raíz draft-enabled del mismo servicio.** Si
necesitas esa navegación (por ejemplo, para un value-help o un
`SideEffects`), crea una proyección de solo lectura, sin draft, como
intermediaria — el patrón `ParametrosVH` de este proyecto.

---

## 9. Dentro de un `case`, usa la ruta de asociación, no la FK cruda

**Síntoma**: una columna calculada con `case/when` referenciando el
código de un estado (`status_code`) no compila, o compila pero no
resuelve el valor esperado.

**Causa**: dentro de una expresión `case`, CDS no resuelve automáticamente
el shorthand `_code` que sí funciona en un `where` o en un `columns()` —
hay que navegar por la ruta de asociación completa.

```cds
// ❌ no resuelve dentro de un case
case when status_code = 'PENDIENTE' then false else true end

// ✅ correcto
case when status.code = 'PENDIENTE' then false else true end
```

**Verificación en el código actual**: una búsqueda exhaustiva sobre los
cuatro `.cds` de servicio confirma que la regla ya está aplicada de forma
consistente — ningún `case/when` del proyecto usa el nombre físico de la
FK (`status_code`, `decision_code`, etc.), todos navegan por la ruta de
asociación (`status.code`, `decision.decision.code`).

**Cómo prevenirlo**: si una columna calculada con `case` no compila o
siempre cae en la rama `else`, revisa primero si estás usando el nombre
físico de columna en vez de la ruta de asociación.

*No hay un commit de "fix" aislado para citar — es una regla ya aplicada
consistentemente en todo el código final, no un error puntual corregido
una vez.*

---

## 10. Bloquear el cambio de tipo (VISUAL ↔ numérico) de un parámetro en uso

**Síntoma**: cambiar el tipo de un parámetro que ya tiene rangos
asignados en algún material dejaba datos inconsistentes — rangos
numéricos en un parámetro que pasó a ser visual, o un parámetro sin rango
que ahora se esperaba numérico.

**Causa**: no había ninguna validación que impidiera cambiar
`tipoParametro_code` en un `Parametros` que ya estuviera referenciado por
`ParametrosMaterial`.

**Solución** — dos commits, en este orden cronológico:

**`8b478d5`** — *"fix(qm): only block actual parameter type changes to
visual"*: afina la condición para que la activación del draft (que
reenvía la fila completa, incluido `tipoParametro_code` sin cambios) no
dispare el bloqueo quando el tipo en realidad **no cambió**:

> Draft activation resends the full row, so only an actual change of
> category counts: unchanged parametros stay editable.

**`639e8f7`** — *"fix(qm): block switching in-use parameters between
visual and numeric"*: agrega la validación en ambas direcciones
(visual→numérico y numérico→visual) cuando el parámetro está en uso:

```js
if (enUso) {
    return req.error({
        code: 400,
        message: 'No se puede cambiar entre tipo visual y numérico un parámetro que ya está asignado a algún material',
        target: 'tipoParametro_code'
    })
}
```

**Cómo prevenirlo**: cuando una entidad de catálogo tiene un campo que
determina la "forma" de sus datos relacionados (aquí, si un parámetro
numérico tiene rango y uno visual no), bloquea el cambio de ese campo en
cuanto exista al menos una fila relacionada — permitir el cambio y dejar
los datos relacionados inconsistentes es peor que no permitirlo. Presta
atención también al caso de la reactivación de un draft: comparar contra
"el valor anterior" solo tiene sentido si de verdad cambió, no si
simplemente viajó de nuevo sin modificarse.

---

## 11. Build de MTA fallaba: `Missing: qm-parametros@0.0.1 / qm-rangos@0.0.1 from lock file`

**Síntoma exacto**:

```
npm ci
Missing: qm-parametros@0.0.1 from lock file
Missing: qm-rangos@0.0.1 from lock file
```

...al ejecutar `npm run build` (que corre `npm ci` como parte del
`before-all` del `mta.yaml`, capítulo 07).

**Causa**: `package.json` declara `workspaces: ["app/*"]` (capítulo 01) —
cada app bajo `app/` es un paquete del monorepo. Cuando se agregaron
`qm-rangos` y `qm-parametros`, sus `package.json` quedaron creados, pero
`package-lock.json` **no se regeneró** para incluirlos como workspaces —
y `npm ci` (a diferencia de `npm install`) es estricto: rechaza cualquier
lockfile que no esté perfectamente sincronizado con los `package.json`.

**Solución** — commit `0a7560e`, *"fix(qm): add qm-rangos and
qm-parametros workspaces to lockfile"*:

```bash
npm install --package-lock-only
```

> npm ci in the MTA before-all build rejected the lockfile because the
> two new app workspaces were missing from it.

**Cómo prevenirlo**: cada vez que agregues una app nueva bajo `app/*`
(o cualquier workspace nuevo), corre `npm install --package-lock-only`
inmediatamente y confirma con:

```bash
npm ci --dry-run
```

y, si quieres verificación completa, un `npm run build` real — no confíes
en que `npm install` local (sin `--package-lock-only`) actualizó el
lockfile de forma completa para lo que `npm ci` en CI va a exigir.

---

## 12. Build outputs versionados en git; cuidado al cambiar de rama con `cds watch` corriendo

**Síntoma**: repositorio con ruido de archivos generados (`dist/`,
`resources/`) versionado innecesariamente, y riesgo de corromper el
estado local del SQLite al cambiar de rama.

**Solución** — dos commits:

**`1f973d8`** — *"chore(qm): ignore ui5 dist and mta resources build
outputs"*: agrega `dist/` y `resources/` al `.gitignore`.

**`56edbb0`** — *"removiendo db.sqlite de quality-managment"*: el diff
real de este commit borra del índice de git `db.sqlite-shm` y
`db.sqlite-wal` (los archivos auxiliares de SQLite en modo WAL), y agrega
el patrón `*.sqlite` más las entradas explícitas de esos dos archivos al
`.gitignore`. **Matización importante**: pese al mensaje del commit,
`db.sqlite` en sí **nunca estuvo versionado** en esa ruta — solo sus dos
archivos auxiliares lo estaban.

**Estado real verificado hoy**: la rama `main` está limpia — no trackea
ningún archivo `*.sqlite*`. El riesgo real no está en `main`, sino en
varias ramas de feature locales, ya fusionadas y obsoletas
(`feat/qm-rangos-parametros`, `feat/qm-rangos-parametros-01-approuter-
delete`, y similares), que **sí** siguen trackeando `db.sqlite-shm`/
`db.sqlite-wal` desde antes del commit `56edbb0`.

**Cómo prevenirlo**: si tienes ramas de feature locales viejas ya
fusionadas, bórralas (`git branch -d`) — no solo por limpieza, sino porque
un `git checkout` accidental a una de ellas mientras `cds watch` tiene el
SQLite abierto en modo WAL puede sobrescribir `-shm`/`-wal` con una
versión vieja y corromper el estado local de tu base de desarrollo. Nunca
cambies de rama con `cds watch` corriendo sin antes detenerlo.

---

## 13. UX: ocultar edición en lotes cerrados; decisión como última columna con criticidad

**Síntoma**: no era un bug funcional, sino una carencia de experiencia —
los botones de editar/eliminar seguían visibles en lotes ya decididos
(confuso, porque el backend los rechazaba igual con un 403 —
`test/inspector-delete.test.js` confirma `403` para este caso, distinto
del `409` que sí devuelve el guardia de borrado en cascada de la lección
4), y la columna de decisión del supervisor no se distinguía visualmente
por color ni prioridad.

**Solución** — tres commits, en orden cronológico:

**`bf7827b`** — *"feat(qm): hide edit and delete actions on closed
lotes"*: introduce la columna calculada `edicionOculta` en
`srv/inspector-service.cds` y la anota con `UI.UpdateHidden`/
`UI.DeleteHidden` en `app/qm-inspector/annotations.cds` (capítulo 05a).

**`317e337`** — *"feat(qm): show decision as last high-importance column
in supervisor list"*: reordena el `UI.LineItem` de
`app/qm-supervisor/annotations.cds` para que la columna "Decisión" sea la
última columna de dato.

**`cf1e5e4`** — *"feat(qm): color supervisor decisions by criticality"*:
introduce `criticidadDecision` en `srv/supervisor-service.cds` y la
enlaza con `Criticality` en el `UI.LineItem` (capítulo 05b).

**Cómo prevenirlo**: cuando una regla de negocio ya bloquea una operación
en el backend (como el `@restrict` con `where` sobre el estado del lote),
no des por hecho que la UI la refleja automáticamente — agrega
explícitamente la columna calculada y la anotación `UI.UpdateHidden`/
`UI.DeleteHidden` correspondiente. Dejar un botón visible que el backend
va a rechazar es peor UX que ocultarlo.

---

## 14. qm-rangos solo mantiene rangos, no materiales

**Síntoma**: no era un bug — fue una decisión de alcance tomada
explícitamente para evitar que `qm-rangos` se convirtiera en un
mantenedor de datos maestros que en realidad viven en otro sistema.

**Solución** — commit `17c40f0` (el más reciente de la rama), *"feat(qm):
maintain only ranges in qm-rangos, not materials"*:

> Materials come from the master data: Create and Delete are hidden and
> rejected with 405 through the capability annotations CAP enforces, and
> material header fields are read-only and stripped server-side on draft
> edits and activation. Tests seed their own materials and edit them.

Tres capas, ya detalladas en los capítulos 03/04/05d:
`Capabilities.InsertRestrictions.Insertable: false` /
`DeleteRestrictions.Deletable: false` en `app/qm-rangos/annotations.cds`,
`@readonly` a nivel de campo en `srv/config-service.cds`, y
`ignorarCambiosDeMaestro`/`CAMPOS_MAESTRO` en
`srv/handlers/config-service.js`.

**Cómo prevenirlo**: cuando una app UI solo necesita mantener una parte de
una entidad (aquí, la composición `parametros` de `Materiales`, no
`Materiales` en sí), bloquea explícitamente el resto con `Capabilities` —
no confíes en que "nadie va a hacer clic ahí" sin la anotación real.

---

## 15. `git push` desde BAS falla con "Invalid username or token"

**Síntoma**: ejecutar `git push` desde una terminal de BAS que **no** es
la integrada del editor (por ejemplo, una terminal externa o un panel
distinto) falla con un error de autenticación tipo "Invalid username or
token", aunque el usuario tiene acceso al repositorio.

**Causa**: el credential helper de git que usa la terminal integrada de
BAS depende de un socket local que esa terminal específica expone — una
terminal distinta no tiene acceso a ese socket y no puede completar la
autenticación.

**Solución**:

```bash
gh auth login
gh auth setup-git
```

Autenticar con la CLI de GitHub y configurar git para usarla como
credential helper resuelve el problema independientemente de qué terminal
uses.

**Cómo prevenirlo**: si vas a trabajar con varias terminales/paneles
dentro de BAS, configura `gh auth setup-git` una vez al principio del
proyecto en vez de descubrir el problema a mitad de un `git push` urgente.

*Fix de entorno local (BAS) — no hay evidencia ni necesidad de evidencia
en el repositorio.*

---

## 16. Visibilidad de Work Zone vs. autorización del backend — dos capas separadas

**Síntoma**: un usuario con el rol de BTP correcto no veía el tile de su
app en Work Zone; o, al revés, veía el tile pero todas las llamadas OData
le devolvían 403.

**Causa**: confundir las dos capas de autorización de una app Fiori en
BTP (desarrollado en detalle en el capítulo 06):

1. **Role collections de BTP** (`QM_Inspector`, `QM_Supervisor`,
   `QM_Administrador` — nombres exactos verificados contra
   `xs-security.json`) — autorizan las llamadas OData del backend.
2. **Roles de Work Zone** (creados aparte, en Site Manager) — controlan
   qué tiles ve el usuario en su launchpad.

**Solución**: asignar **ambas** capas a cada usuario real — la role
collection de BTP desde el Cockpit, y el rol de Work Zone desde el Site
Manager, asegurándose además de que ese rol de Work Zone esté realmente
**asignado al site** (no solo creado). Este último paso — la asignación al
site — fue el bloqueador final encontrado en este proyecto: los roles de
Work Zone existían y estaban bien configurados, pero no estaban asignados
en la configuración del site, y por eso ningún usuario veía los tiles
hasta corregirlo.

**Cómo prevenirlo**: documenta explícitamente, para cualquier persona que
retome el proyecto, que dar de alta un usuario nuevo requiere **dos**
pasos independientes en dos herramientas distintas (BTP Cockpit y Work
Zone Site Manager) — ver el diagrama y checklist del capítulo 06.

*Configuración operativa de BTP/Work Zone, sin huella en el
repositorio — pero los nombres exactos de role-collection sí están
verificados contra el `xs-security.json` real del proyecto.*

---

## Resumen / checklist de prevención

- [ ] Antes de investigar un 404 en Work Zone, revisa `cf apps` — puede
      ser solo que la app trial está detenida.
- [ ] Usa siempre nombres de destination/`sap.cloud.service` calificados
      con el ID del proyecto, nunca genéricos, desde el primer commit.
- [ ] Haz una lista explícita de grants (`READ`/`CREATE`/`UPDATE`/`DELETE`)
      al escribir un `@restrict` — un grant faltante no da error de
      compilación, da 403 en runtime.
- [ ] Cuando un campo puede tener distintos "dueños" según una condición,
      documenta y refuerza esa propiedad en cada punto donde se escribe,
      no solo en la creación.
- [ ] `@assert.unique` no basta para un mensaje de error legible — agrega
      siempre un check explícito en el handler.
- [ ] Si tu proyecto tiene un `db.kind` configurado, fuerza el modo en
      memoria de los tests en dos capas independientes.
- [ ] Después de tocar `srv/*.cds`, corre `cds deploy --to sqlite:
      db.sqlite` local antes de asumir que el error es de lógica.
- [ ] Nunca redirijas la asociación de un hijo draft hacia otra raíz
      draft-enabled — usa una proyección de solo lectura intermedia.
- [ ] Dentro de un `case`, navega por la ruta de asociación
      (`status.code`), nunca por el nombre físico de la FK.
- [ ] Bloquea el cambio de un campo "estructural" (que determina la forma
      de datos relacionados) en cuanto exista al menos una fila
      relacionada.
- [ ] Cada app nueva bajo `workspaces: ["app/*"]` necesita
      `npm install --package-lock-only` de inmediato.
- [ ] Borra las ramas de feature locales ya fusionadas — evita
      sobrescrituras accidentales de `db.sqlite-shm`/`-wal`.
- [ ] Si el backend ya bloquea una operación, refleja ese bloqueo también
      en la UI con `UI.UpdateHidden`/`UI.DeleteHidden`.
- [ ] Un usuario BTP necesita **dos** asignaciones independientes para
      usar una app Fiori en Work Zone: role collection + rol de Work Zone
      asignado al site.
