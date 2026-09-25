# 08 — Testing (test/)

## Qué vas a aprender

Cómo están organizados los tests de integración del proyecto, por qué cada
archivo fuerza explícitamente una base de datos en memoria, y qué cubre
cada suite. No es una introducción genérica a `@cap-js/cds-test` — es la
explicación de las decisiones concretas que tomó este proyecto, la mayoría
motivadas por haber roto datos de desarrollo una vez (capítulo 09, lección
6).

---

## Por qué los tests son de integración, no unitarios

Ningún archivo bajo `test/` prueba una función de JavaScript aislada.
Todos levantan el servicio CAP completo (vía `cds.test()`) y hacen
peticiones HTTP reales (`POST`, `PATCH`, `GET`, `DELETE`) contra él,
autenticados como uno de los usuarios mockeados del `package.json`
(capítulo 01). Tiene sentido para este proyecto: casi toda la lógica que
importa vive en la combinación de anotaciones CDS + handlers + reglas de
`@restrict` actuando juntas sobre el protocolo OData con draft — probar
solo el handler en aislamiento no habría detectado, por ejemplo, el bug de
`DraftAdministrativeData` (lección 8), que solo aparece cuando Fiori
Elements navega de verdad por la asociación redirigida.

```
test/
├── cumple.test.js                  ← evaluación de cumplimiento (numérico/visual)
├── inspector-delete.test.js        ← reglas de borrado de lotes/inspecciones
├── supervisor-list.test.js         ← columna de decisión, criticidad, anotaciones
├── lote-edit-visibility.test.js    ← UpdateHidden/DeleteHidden según status
└── config-service.test.js          ← ConfigService completo (la suite más grande)
```

Corren todos juntos con:

```bash
npm test
```

que ejecuta:

```json
"test": "CDS_PLUGIN_UI5_ACTIVE=false CDS_REQUIRES_DB_CREDENTIALS_URL=:memory: node --test test/*.test.js"
```

`node --test` es el test runner nativo de Node.js (sin Jest/Mocha como
dependencia externa) — `describe`/`it` se importan implícitamente del
runtime.

---

## La base de datos en memoria — por partida doble

Cada archivo repite el mismo patrón al inicio:

```js
const cds = require('@sap/cds')

// SAFETY: force an in-memory db — see test/inspector-delete.test.js for why
// the documented `cds.test(__dirname + '/..')` pattern alone is not enough
// in this project (a persistent sqlite db is configured for [development]).
const { POST, GET, DELETE, expect, axios } = cds.test(__dirname + '/..', '--in-memory')
```

Y el comentario "de origen", en `test/inspector-delete.test.js`, explica
por qué hace falta el segundo flag:

```js
const cds = require('@sap/cds')

// NOTE: this project's package.json already configures `cds.requires.db`
// (sqlite with a persistent `db.sqlite` file for the default/development
// profile). cds.test()'s conditional `--in-memory?` flag only kicks in
// when NO db is configured at all (see @sap/cds/bin/serve.js `_in_memory`),
// so the documented `cds.test(__dirname + '/..')` pattern would silently
// run these tests against the real dev database file. Passing the
// unconditional `--in-memory` flag forces a transient in-memory db instead.
const { POST, GET, DELETE, expect, axios } = cds.test(__dirname + '/..', '--in-memory')
```

Dos capas de protección contra el mismo problema (ver capítulo 09, lección
6, para el incidente que las motivó):

1. La variable de entorno `CDS_REQUIRES_DB_CREDENTIALS_URL=:memory:` del
   script `test` en `package.json` — protege incluso si algún archivo de
   test se olvidara del flag.
2. El flag `'--in-memory'` explícito en cada llamada a `cds.test()` —
   protege incluso si algún día el script `test` cambiara y perdiera la
   variable de entorno.

Ninguna de las dos por sí sola bastaba: la razón exacta está en el
comentario — el patrón "de libro" (`cds.test(__dirname + '/..')`, sin
segundo argumento) solo activa el modo en memoria automáticamente cuando
el proyecto **no tiene ningún `db` configurado**. Este proyecto sí lo
tiene (`sqlite` con archivo persistente para `[development]`), así que ese
atajo automático nunca se dispara — hay que forzarlo a mano.

---

## Autenticación en los tests

```js
axios.defaults.auth = { username: 'bob', password: '' }
```

Cada suite fija el usuario mockeado (`bob` = Inspector, `carol` =
Supervisor, `alice` = los tres roles) como credencial por defecto de
`axios` para todas las llamadas de ese archivo — así cada test no repite
las credenciales en cada request. El test de control de acceso en
`config-service.test.js` cambia explícitamente a `bob` para un caso
puntual y espera un `403`:

```js
describe('Access control', () => {
    it('rejects an Inspector (bob) with 403', async () => { /* ... */ })
})
```

---

## IDs de fixture fijos

Todos los archivos referencian UUIDs literales, comentados con su
significado de negocio, correspondientes a filas de los CSV de
`db/data/`:

```js
// Fixture IDs from db/data/lote.inspector-*.csv
const LOTE_PENDIENTE_SIN_INSPECCIONES = '00000000-0000-0000-0000-000000000506' // LOTE-2026-006, status PENDIENTE
const LOTE_APROBADO = '00000000-0000-0000-0000-000000000501' // LOTE-2026-001, status APROBADO
const INSPECCION_ABIERTA = '00000000-0000-0000-0000-000000000605' // lote 505, status ABIERTA
const INSPECCION_COMPLETADA = '00000000-0000-0000-0000-000000000601' // lote 501, status COMPLETADA
```

Los UUID son deliberadamente legibles (`...000501`, `...000601`) en vez de
aleatorios — facilita ubicar la fila correspondiente en el CSV a simple
vista y mantener la correspondencia lote↔inspección↔resultado a mano al
diseñar un nuevo caso de prueba. Esto solo funciona porque los CSV de
`db/data/` son datos de desarrollo fijos y controlados (capítulo 02) — no
se generan al azar en cada test.

---

## `cumple.test.js` — el corazón de la lógica numérico/visual

Cubre exactamente la función `evaluarCumplimiento` del handler de
Inspector (capítulo 04): crea un lote con una inspección abierta, agrega
resultados con distintas combinaciones de parámetro/valor, y verifica que
`cumpleVisual` se calcule bien para casos con solo mínimo, solo máximo, y
ambos límites:

```js
const PARAM_NUMERICO = '00000000-0000-0000-0000-000000000301' // DIM-001, rango 3.200-3.400 en MATERIAL_CON_RANGO
const PARAM_VISUAL = '00000000-0000-0000-0000-000000000307' // VIS-002

// Not mapped to MATERIAL_PARA_RANGOS_PARCIALES in the CSV fixtures — the
// ParametrosMaterial rows below (one bound each) are inserted by this suite.
const PARAM_SOLO_MINIMO = '00000000-0000-0000-0000-000000000303' // DIM-003
const PARAM_SOLO_MAXIMO = '00000000-0000-0000-0000-000000000305' // ELE-002
```

El `before()` de la suite hace algo que vale la pena destacar: inserta
directamente en la base de datos (sin pasar por HTTP) dos rangos
adicionales que no vienen en los CSV, para poder probar los casos "solo
mínimo" / "solo máximo":

```js
before(async () => {
    // Wait for cds.test()'s own server-start hook to finish (deploying the
    // in-memory db from the CSV fixtures) before writing to it — otherwise
    // this insert races the server bootstrap and gets wiped by it.
    await test

    const db = await cds.connect.to('db')
    await db.run(
        INSERT.into('lote.inspector.ParametrosMaterial').entries([ /* ... */ ])
    )
})
```

El comentario documenta una carrera de condición sutil propia de
`cds.test()`: el propio arranque del servidor de test **despliega** el
esquema y carga los CSV de forma asíncrona; si el `before()` de la suite
escribe antes de que ese despliegue termine, su `INSERT` corre la carrera
contra el propio bootstrap y puede perderse. `await test` espera
explícitamente a que el arranque del test-server termine antes de escribir
nada más.

---

## `inspector-delete.test.js` — reglas de borrado

Prueba, con lotes creados a través de la API real:

- Borrar un lote `PENDIENTE` sin inspecciones: permitido.
- Borrar un lote con una inspección `ABIERTA`: la composición borra en
  cascada esa inspección abierta — permitido, porque `Inspecciones` sí
  autoriza `DELETE` cuando está `ABIERTA`.
- Borrar un lote con una inspección `COMPLETADA`: rechazado — es el
  guardia `before('DELETE', Lotes)` de `inspector-service.js` (capítulo
  04) que impide eludir el `@restrict` de `Inspecciones` borrando el
  lote entero.

---

## `lote-edit-visibility.test.js` — `edicionOculta`

```js
const edicionOculta = async (id) => {
    const { data } = await GET(`/inspector/Lotes(ID=${id},IsActiveEntity=true)?$select=edicionOculta`)
    return data.edicionOculta
}

describe('Lotes — Edit/Delete button visibility', () => {

    it('hides edit and delete for closed lotes', async () => {
        expect(await edicionOculta(LOTE_APROBADO)).to.equal(true)
        expect(await edicionOculta(LOTE_RECHAZADO)).to.equal(true)
    })

    it('shows edit and delete for PENDIENTE and EN_INSPECCION lotes', async () => {
        expect(await edicionOculta(LOTE_PENDIENTE)).to.equal(false)
        expect(await edicionOculta(LOTE_EN_INSPECCION)).to.equal(false)
    })

    it('exposes UpdateHidden and DeleteHidden bound to edicionOculta', async () => {
        const { data } = await GET('/inspector/$metadata')
        expect(data).to.match(/Target="InspectorService\.Lotes"[\s\S]*?UI\.UpdateHidden" Path="edicionOculta"/)
        expect(data).to.match(/Target="InspectorService\.Lotes"[\s\S]*?UI\.DeleteHidden" Path="edicionOculta"/)
    })
})
```

Tres niveles de verificación para una sola regla de UX (capítulo 09,
lección 13): (1) el **valor** del campo calculado es correcto para cada
estado; (2) el `$metadata` realmente **expone** las anotaciones
`UI.UpdateHidden`/`UI.DeleteHidden` apuntando a ese campo — el tercer test
lee el XML del metadata OData con una expresión regular en vez de solo
confiar en que la anotación CDS "debería" compilar bien. Es un patrón que
se repite en `supervisor-list.test.js` y en `config-service.test.js`: no
basta con probar el dato, también hay que probar que la anotación llegó
al metadata que la UI realmente consume.

---

## `supervisor-list.test.js` — columna de decisión

```js
// Extracts the <Annotations Target="..."> block for one target
const bloque = (metadata, target) => {
    const inicio = metadata.indexOf(`<Annotations Target="${target}">`)
    expect(inicio, `annotations for ${target}`).to.be.greaterThan(-1)
    return metadata.slice(inicio, metadata.indexOf('</Annotations>', inicio))
}

describe('Supervisor list report — decision column', () => {

    it('shows the decision as the last, high-importance column', async () => { /* ... */ })
    it('displays the decision text instead of its code', async () => { /* ... */ })
    it('returns the decision text for decided inspections', async () => { /* ... */ })
    it('colors each decision: green release, yellow deviation, red reject, neutral pending', async () => {
        /* ... */
        expect(porDecision).to.deep.equal({
            LIBERAR: 3,
            LIBERAR_CON_DESVIACION: 2,
            RECHAZAR: 1,
            SIN_DECISION: 0
        })
    })
    it('binds the decision column criticality to criticidadDecision', async () => { /* ... */ })
})
```

El helper `bloque()` recorta del XML del `$metadata` solo el fragmento
`<Annotations Target="...">` correspondiente a la entidad que interesa —
así cada test puede aserciones textuales precisas (`.to.include(...)`)
sin que un cambio de anotación en otra entidad rompa por casualidad un
test que no la involucra. Este archivo confirma exactamente la regla de
negocio del capítulo 05 (columna "Decisión" al final del `UI.LineItem`,
con `Criticality` e `Importance: High`) contra el `$metadata` real, no
contra el archivo `.cds` fuente — la diferencia importa porque una
anotación mal escrita puede compilar sin error y aun así no producir el
XML esperado.

---

## `config-service.test.js` — la suite más grande

Es, con diferencia, el archivo de test más largo del proyecto (25 KB) —
cubre el servicio con más reglas de negocio (`ConfigService`). Sus grupos
`describe`:

| Grupo | Qué verifica |
|---|---|
| `Materiales — rangos de aceptación` | Crear rangos con solo mínimo/solo máximo/ambos; rechazar numérico sin ningún límite; rechazar mínimo > máximo; rechazar límites en un parámetro `VISUAL`; rechazar parámetro repetido en el mismo material. |
| `Materiales — no se crean ni se eliminan (T10)` | Crear un material nuevo se rechaza; borrar un material existente se rechaza; los campos de maestro (`codigo`, `descripcion`, `unidad`, `activo`) se ignoran silenciosamente al editar; sigue permitido agregar/quitar rangos de un material existente. |
| `ParametrosMaterial — control de campo (draft)` | `esVisual`/`controlRango` correctos al crear una fila numérica o visual; se recalculan en vivo al cambiar el parámetro; **y el caso de regresión exacto de la lección 8**: *"reads the navigated parametro after changing a range's parametro, without crashing on DraftAdministrativeData"*. |
| `ParametrosMaterial — mensajes al cambiar el parámetro (draft)` | Los `req.info`/`req.warn` del capítulo 04 se disparan en los momentos correctos. |
| `Parametros — catálogo` | CRUD básico; código duplicado rechazado; bloqueo de cambio de tipo visual↔numérico cuando el parámetro está en uso (en ambas direcciones); permitido si no está en uso o si es un cambio entre tipos numéricos. |
| `Access control` | `bob` (Inspector) recibe `403` al intentar usar `ConfigService`. |
| `UI annotations — qm-rangos/qm-parametros metadata` | Los términos de field control y side-effects existen en el `$metadata`; Create/Delete de `Materiales` están ocultos en la lista y en el object page. |

El nombre `T10` en el segundo grupo hace referencia a una tarea/ticket
interno del proyecto (la regla "los materiales no se crean ni se eliminan
desde esta app" — capítulo 09, lección 14) — una convención útil si tu
equipo numera sus historias: el nombre del `describe` queda trazable hasta
el requisito que lo originó.

El test de la lección 8 merece leerse completo porque es el ejemplo más
claro de "test de regresión con nombre":

```js
it('reads the navigated parametro after changing a range\'s parametro, without crashing on DraftAdministrativeData', async () => {
    /* cambia el parametro_ID de un ParametrosMaterial.drafts existente
       y confirma que la lectura subsiguiente (la que dispara
       Common.SideEffects) no lanza el error de
       DraftAdministrativeData_DraftUUID */
})
```

El nombre del test **es** la descripción del bug original — si alguien en
el futuro revierte por error la redirección a `ParametrosVH` (capítulo
03), este test es el que primero va a fallar y el que va a decir
exactamente qué se rompió.

---

## Cómo correr los tests

```bash
cd quality-managment
npm test
```

No requiere ningún servicio externo, ningún `cds watch` corriendo, ni
tocar el `db.sqlite` real — todo corre contra la base en memoria descrita
arriba, se levanta y se destruye en el proceso de test.

**Nunca** ejecutes `npm test` esperando que reutilice tu `db.sqlite` de
desarrollo para "ver los datos actualizados" — es exactamente el
comportamiento que las dos capas de protección de este capítulo evitan a
propósito.

---

## Resumen / checklist

- [ ] Los tests son de integración: levantan el servicio completo y hacen
      peticiones HTTP reales, autenticadas con los usuarios mockeados.
- [ ] Cada archivo fuerza SQLite en memoria con el flag `'--in-memory'` de
      `cds.test()`, además de la variable de entorno del script `test` —
      ninguna de las dos capas sobra.
- [ ] Los fixtures usan UUIDs legibles y comentados, alineados con las
      filas de los CSV de `db/data/`.
- [ ] Cuando una regla depende de una anotación CDS, el test verifica el
      `$metadata` real (el XML), no solo el comportamiento del endpoint —
      una anotación puede fallar en compilar al metadata sin que el
      handler se entere.
- [ ] Un test de regresión que reproduce un bug real merece un nombre
      descriptivo del bug, no un nombre genérico — facilita rastrear por
      qué existe cuando alguien lo vea fallar meses después.
