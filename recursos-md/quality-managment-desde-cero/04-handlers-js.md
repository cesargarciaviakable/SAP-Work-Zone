# 04 — La lógica de negocio (`srv/handlers/*.js`)

**Qué vas a aprender**: qué hace cada handler de los cuatro archivos
JavaScript, en qué fase del ciclo de vida de CAP corre (`before`,
`on`, `after`), y —sobre todo— **por qué existe**: casi todos nacieron
para cerrar un hueco que las anotaciones o el `@restrict` del capítulo
03 no podían cubrir por sí solos.

Cada archivo de servicio (`srv/<nombre>.cds`) tiene su handler
homónimo en `srv/handlers/<nombre>.js`. CAP los conecta
automáticamente por convención de nombre — no hace falta registrarlos
en ningún lado.

---

## Vocabulario rápido antes de empezar

| Concepto CAP | Qué significa aquí |
|---|---|
| `this.before(evento, Entidad, handler)` | Corre antes de que CAP ejecute la operación — para validar o transformar `req.data` |
| `this.on(evento, Entidad, handler)` | Reemplaza la ejecución por defecto — se usa para acciones custom |
| `this.after(evento, Entidad, handler)` | Corre después de leer/escribir — para enriquecer la respuesta |
| `Entidad.drafts` | La entidad "de borrador": lo que el usuario edita antes de guardar (Save) |
| `req.error(codigo, mensaje)` | Registra un error y **detiene** la operación (usado con `return`) |
| `req.reject(codigo, mensaje)` | Igual que `req.error`, pero **lanza** una excepción — corta el flujo inmediatamente, incluso dentro de un `await` |
| `req.warn(...)` / `req.info(...)` | Mensajes no bloqueantes que llegan al usuario vía el header `sap-messages` |

---

## `srv/handlers/inspector-service.js`

Es el handler más largo (casi 500 líneas) porque `Lotes` tiene draft y
tres niveles de composición (`Lotes → Inspecciones → ResultadosInspeccion`)
cuya consistencia hay que garantizar en cada paso de edición **y** en
el momento final de activar el draft.

### Funciones auxiliares

```js
const evaluarCumplimiento = async (materialId, parametroId, valorObtenido) => {

    if (!parametroId) return {}

    const parametro = await SELECT.one
        .from(Parametros)
        .columns('tipoParametro_code')
        .where({ ID: parametroId })

    if (parametro?.tipoParametro_code === TIPO_VISUAL) return { tipoVisual: true }

    if (!materialId || valorObtenido === null || valorObtenido === undefined) {
        return { tipoVisual: false, cumple: null }
    }

    const rango = await SELECT.one
        .from(ParametrosMaterial)
        .columns('valorMinimo', 'valorMaximo')
        .where({
            material_ID: materialId,
            parametro_ID: parametroId
        })

    if (!rango) return { tipoVisual: false, cumple: null }

    const v = Number(valorObtenido)
    const min = rango.valorMinimo ?? -Infinity
    const max = rango.valorMaximo ?? Infinity

    return { tipoVisual: false, cumple: v >= Number(min) && v <= Number(max) }
}
```

Esta función es la **única fuente de verdad** sobre si un resultado
cumple o no. Se llama desde varios handlers distintos (para no
duplicar la lógica) y devuelve tres formas posibles según el caso,
documentadas en el comentario que la precede en el código:

- `{ tipoVisual: true }` → el parámetro es visual: el servidor no
  calcula nada, `cumpleVisual` es del usuario.
- `{ tipoVisual: false, cumple: true|false }` → numérico, con rango:
  el valor está dentro o fuera.
- `{ tipoVisual: false, cumple: null }` → numérico, pero sin material
  o sin rango definido todavía: no se puede evaluar.
- `{}` → ni siquiera hay parámetro elegido aún.

```js
const aplicarControlesDraft = (data, { tipoVisual, cumple } = {}, cumpleVisualPrevio, parametroCambio = false) => {

    if (tipoVisual === undefined) {
        data.esVisual = false
        data.controlValorObtenido = 3
        data.controlCumpleVisual = 1
        data.criticidad = 0
        return
    }

    data.esVisual = tipoVisual
    data.controlValorObtenido = tipoVisual ? 1 : 3
    data.controlCumpleVisual = tipoVisual ? 3 : 1

    if (!tipoVisual) {
        // Numeric: the server always owns cumpleVisual, a stale/forged
        // client value must never persist.
        data.cumpleVisual = cumple ?? null
    } else if (parametroCambio && !('cumpleVisual' in data)) {
        // VISUAL, and this PATCH just switched the parametro away
        // from a numeric one (R3-param-switch-stale-cumple): a
        // leftover server-computed cumpleVisual must not survive
        // the switch and be mistaken for a user choice. An
        // explicit cumpleVisual sent in the same PATCH wins.
        data.cumpleVisual = null
    }

    const cumpleFinal = 'cumpleVisual' in data ? data.cumpleVisual : cumpleVisualPrevio
    data.criticidad = cumpleFinal === true ? 3 : cumpleFinal === false ? 1 : 0
}
```

Por qué existe esta función y no solo `evaluarCumplimiento`: los
campos calculados de `srv/inspector-service.cds` (`esVisual`,
`criticidad`, `controlValorObtenido`, `controlCumpleVisual`) se
calculan con `case/when` **solo en la entidad activa** — pero mientras
el usuario edita un draft, esas columnas son campos reales y
persistidos en la tabla `_drafts`, no algo que se recalcule en cada
lectura. Por eso hay que "aplicarlos a mano" (`aplicarControlesDraft`)
cada vez que el draft cambia, para que la UI vea el estado correcto
*mientras edita*, no solo después de guardar. El comentario
`R3-param-switch-stale-cumple` documenta un caso límite real: si el
usuario cambia el parámetro de un resultado de uno numérico a uno
visual en la misma edición, un `cumpleVisual` calculado por el
servidor para el parámetro anterior no debe sobrevivir el cambio y
hacerse pasar por una elección del usuario.

```js
const assertInspeccionAbierta = async (req, inspeccionId) => {

    const inspeccion = await SELECT.one
        .from(Inspecciones.drafts)
        .columns('status_code')
        .where({
            ID: inspeccionId
        })

    if (inspeccion && inspeccion.status_code !== 'ABIERTA') {
        return req.error(
            409,
            `La inspección está ${inspeccion.status_code} y ya no puede modificarse`
        )
    }
}
```

Guardián reutilizado por varios `before` de draft: si la inspección ya
no está `ABIERTA`, corta con 409. Se usa antes de crear, editar o
borrar un resultado, y antes de editar/borrar la propia inspección en
draft.

```js
const mismoValor = (a, b) => (a ?? null) === (b ?? null)
const mismoNumero = (a, b) => (a ?? null) === null || (b ?? null) === null
    ? mismoValor(a, b)
    : Number(a) === Number(b)
const mismaFecha = (a, b) => (a ?? null) === null || (b ?? null) === null
    ? mismoValor(a, b)
    : new Date(a).getTime() === new Date(b).getTime()

const inspeccionModificada = (guardada, entrante) => {

    if (
        !mismoValor(guardada.status_code, entrante.status_code) ||
        !mismoValor(guardada.observaciones, entrante.observaciones) ||
        !mismaFecha(guardada.fechaInspeccion, entrante.fechaInspeccion)
    ) return true

    // Resultados omitted from the payload are left untouched
    if (!entrante.resultados) return false

    if (guardada.resultados.length !== entrante.resultados.length) return true

    return guardada.resultados.some((r) => {
        const e = entrante.resultados.find((x) => x.ID === r.ID)
        return !e ||
            !mismoValor(r.parametro_ID, e.parametro_ID) ||
            !mismoNumero(r.valorObtenido, e.valorObtenido) ||
            !mismoValor(r.cumpleVisual, e.cumpleVisual) ||
            !mismoValor(r.observacion, e.observacion)
    })
}
```

Comparadores "tolerantes" a diferencias de tipo (string vs. number,
`null` vs. `undefined`, formatos de fecha) — necesarios porque el
payload que llega en la activación del draft no siempre tiene
exactamente el mismo tipo de dato que lo leído de la base con
`SELECT`. `inspeccionModificada` es el corazón de una validación que
se explica a continuación.

### `before(['CREATE', 'UPDATE'], Lotes, ...)` — el handler que lo hace casi todo

```js
this.before(['CREATE', 'UPDATE'], Lotes, async (req) => {

    const lote = req.data
    // ... (ver más abajo)
})
```

El comentario de sección explica por qué este único handler concentra
tanta lógica:

> *Draft activation sends the whole document (lote + inspecciones +
> resultados) as a deep CREATE/UPDATE on the root, so child handlers
> never run: all derivations live here.*

Es decir: cuando el usuario presiona "Guardar" sobre el draft de un
lote, CAP no dispara un evento por cada inspección o resultado
tocado — envía **un solo** `CREATE`/`UPDATE` profundo sobre `Lotes`
con todo el árbol anidado. Cualquier validación que dependa del
documento completo tiene que vivir aquí, no en handlers de entidades
hijas (esos solo se disparan durante la edición del draft, no en la
activación).

Desglosado en sus responsabilidades:

**1. Material → Unidad automáticamente.**
```js
if (lote.material_ID) {
    const material = await SELECT.one
        .from('lote.inspector.Materiales')
        .columns('unidad')
        .where({ ID: lote.material_ID })

    if (!material) return req.error(404, 'Material no encontrado')

    lote.unidad = material.unidad
}
```
Al elegir material, la unidad se copia server-side — nunca depende de
lo que el cliente mande en `unidad`.

**2. Inspecciones cerradas son inmutables — el guardián real.**
```js
if (req.event === 'UPDATE' && lote.inspecciones) {

    const cerradas = await SELECT
        .from(Inspecciones, (i) => {
            i.ID, i.status_code, i.fechaInspeccion, i.observaciones,
            i.resultados((r) => {
                r.ID, r.parametro_ID, r.valorObtenido, r.cumpleVisual, r.observacion
            })
        })
        .where({ lote_ID: lote.ID ?? req.params.at(-1)?.ID })
        .and('status_code !=', 'ABIERTA')

    for (const guardada of cerradas) {
        const entrante = inspecciones.find((i) => i.ID === guardada.ID)

        if (!entrante) {
            return req.error(409, `No se puede eliminar una inspección en status ${guardada.status_code}`)
        }

        if (inspeccionModificada(guardada, entrante)) {
            return req.error(409, `La inspección está ${guardada.status_code} y ya no puede modificarse. Descarta el borrador y vuelve a editar el lote.`)
        }
    }
}
```
El comentario del código explica por qué esto es más que una
comprobación de estado: *"This is the real guard: it also catches a
stale draft saved after the inspection was completed by
completarInspeccion."* Un inspector puede abrir un draft de edición
del lote, y **mientras lo tiene abierto**, la misma inspección puede
completarse (por él mismo en otra pestaña, o llegar ya completada si
el draft quedó abierto mucho tiempo). Al guardar ese draft viejo, este
bloque relee el estado actual real de cada inspección no-`ABIERTA` y
compara campo por campo contra lo que trae el payload: si algo
cambió, rechaza con 409 y pide descartar el borrador. Sin esto, guardar
un draft desactualizado podría revertir en silencio una inspección ya
completada.

**3. `cumpleVisual`: recalculado siempre para lo abierto.**
```js
for (const inspeccion of inspecciones) {
    if ((inspeccion.status_code ?? 'ABIERTA') !== 'ABIERTA') continue
    for (const resultado of inspeccion.resultados ?? []) {

        const { tipoVisual, cumple } = await evaluarCumplimiento(
            materialId, resultado.parametro_ID, resultado.valorObtenido
        )

        if (tipoVisual === false) resultado.cumpleVisual = cumple ?? null
    }
}
```
Nótese: solo toca `cumpleVisual` cuando `tipoVisual === false`
(numérico) — un parámetro visual nunca se sobrescribe aquí, coherente
con la regla general del proyecto.

**4. Transición de estado automática.**
```js
const statusActual = actual?.status_code ?? lote.status_code ?? 'PENDIENTE'
const tieneAbierta = inspecciones.some((i) => (i.status_code ?? 'ABIERTA') === 'ABIERTA')

if (statusActual === 'PENDIENTE' && tieneAbierta) {
    lote.status_code = 'EN_INSPECCION'
}
```
En cuanto existe una inspección abierta, el lote deja de estar
`PENDIENTE` — sin que el usuario tenga que cambiarlo a mano.

### `before('DELETE', Lotes, ...)` — bloquear el borrado en cascada

```js
this.before('DELETE', Lotes, async (req) => {

    const loteId = req.params.at(-1)?.ID

    const noAbiertas = await SELECT.one
        .from(Inspecciones)
        .columns('count(1) as total')
        .where({ lote_ID: loteId })
        .and('status_code !=', 'ABIERTA')

    if (noAbiertas?.total > 0) {
        return req.error(409, 'No se puede eliminar un lote con inspecciones completadas')
    }
})
```

Como `inspecciones` es una **composición**, borrar el lote borraría en
cascada todas sus inspecciones — incluidas las que ya no están
`ABIERTA`, que el propio `@restrict` de `Inspecciones` (capítulo 03)
protege de un DELETE directo. Sin este `before`, el borrado en cascada
del lote *evadiría* esa protección por la puerta de atrás. Este
handler nació de la lección "block cascade delete of completed
inspections" del capítulo 09.

### Feedback en vivo durante la edición del draft

```js
// Live unidad while editing the draft — paired with
// @Common.SideEffects #Material in the app annotations
this.before(['NEW', 'PATCH'], Lotes.drafts, async (req) => {
    if (!req.data.material_ID) return

    const material = await SELECT.one
        .from('lote.inspector.Materiales')
        .columns('unidad')
        .where({ ID: req.data.material_ID })

    if (material) req.data.unidad = material.unidad
})
```

Este es el complemento en vivo del punto 1 de arriba: mientras el
usuario **todavía está editando** (no guardó), cambiar el material
también actualiza la unidad mostrada de inmediato. El comentario dice
explícitamente que está *"paired with `@Common.SideEffects #Material`
in the app annotations"* — sin ese `SideEffects` en
`qm-inspector/annotations.cds` (capítulo 05), la UI no volvería a
pedir el campo `unidad` después del cambio y este handler no tendría
efecto visible.

```js
this.before('NEW', Inspecciones.drafts, async (req) => {

    const loteId = req.data.lote_ID ?? req.params.at(-1)?.ID

    const lote = await SELECT.one.from(Lotes.drafts).columns('status_code').where({ ID: loteId })

    if (lote && lote.status_code !== 'PENDIENTE') {
        return req.error(409, `El lote no puede inspeccionarse en status: ${lote.status_code}`)
    }

    const abiertas = await SELECT.one
        .from(Inspecciones.drafts)
        .columns('count(1) as total')
        .where({ lote_ID: loteId })

    if (abiertas?.total > 0) {
        return req.error(409, 'El lote ya tiene una inspección en proceso')
    }

    req.data.fechaInspeccion ??= new Date().toISOString()

    // Calculated columns are stored in the drafts table and
    // start as null for new rows
    req.data.esEditable = true
    req.data.controlCampo = 3
    req.data.controlObligatorio = 7
})
```

Dos reglas de negocio, aplicadas en el momento de crear la fila (no
solo al guardar, para que el usuario reciba el error de inmediato):
solo se puede inspeccionar un lote `PENDIENTE`, y solo una inspección
a la vez por lote. El comentario recuerda por qué hace falta
inicializar `esEditable`/`controlCampo`/`controlObligatorio` a mano:
son columnas reales en la tabla de drafts, no algo recalculado.

```js
// INSPECCIONES CERRADAS (draft)
// Immediate feedback; the activation check above is the authoritative one
this.before(['PATCH', 'DELETE'], Inspecciones.drafts, (req) =>
    assertInspeccionAbierta(req, req.data.ID ?? req.params.at(-1)?.ID)
)
```

Feedback inmediato en el draft — el comentario aclara que la
comprobación **autoritativa** es la del punto 2 de `before(['CREATE',
'UPDATE'], Lotes, ...)`; esta solo evita que el usuario pierda tiempo
editando algo que se va a rechazar al guardar.

```js
this.before('NEW', ResultadosInspeccion.drafts, async (req) => {

    const inspeccionId = req.data.inspeccion_ID ?? req.params.at(-1)?.ID

    const invalida = await assertInspeccionAbierta(req, inspeccionId)
    if (invalida) return

    const inspeccion = await SELECT.one.from(Inspecciones.drafts).columns('lote_ID').where({ ID: inspeccionId })
    const lote = inspeccion && await SELECT.one.from(Lotes.drafts).columns('material_ID').where({ ID: inspeccion.lote_ID })

    const resultado = await evaluarCumplimiento(lote?.material_ID, req.data.parametro_ID, req.data.valorObtenido)

    aplicarControlesDraft(req.data, resultado)
})

this.before(['PATCH', 'DELETE'], ResultadosInspeccion.drafts, async (req) => {
    const resultado = await SELECT.one.from(ResultadosInspeccion.drafts).columns('inspeccion_ID').where({ ID: req.data.ID ?? req.params.at(-1)?.ID })
    if (resultado) return assertInspeccionAbierta(req, resultado.inspeccion_ID)
})
```

Al crear un resultado nuevo dentro del draft, se evalúa de inmediato
contra el rango del material (para mostrar el icono correcto sin
esperar a guardar) y se aplican los controles de campo.

```js
// RESULTADO (draft)
// Live cumpleVisual while editing — paired with @Common.SideEffects in the app annotations
this.before('PATCH', ResultadosInspeccion.drafts, async (req) => {

    const camposRelevantes = ['valorObtenido', 'parametro_ID', 'cumpleVisual']
    if (!camposRelevantes.some((campo) => campo in req.data)) return

    const draft = await SELECT.one
        .from(ResultadosInspeccion.drafts)
        .columns('parametro_ID', 'valorObtenido', 'cumpleVisual', 'inspeccion_ID')
        .where({ ID: req.data.ID ?? req.params.at(-1)?.ID })

    if (!draft) return

    const inspeccion = await SELECT.one.from(Inspecciones.drafts).columns('lote_ID').where({ ID: draft.inspeccion_ID })
    const lote = inspeccion && await SELECT.one.from(Lotes.drafts).columns('material_ID').where({ ID: inspeccion.lote_ID })

    const parametroId = req.data.parametro_ID ?? draft.parametro_ID
    const valorObtenido = 'valorObtenido' in req.data ? req.data.valorObtenido : draft.valorObtenido
    const parametroCambio = 'parametro_ID' in req.data && req.data.parametro_ID !== draft.parametro_ID

    const resultado = await evaluarCumplimiento(lote?.material_ID, parametroId, valorObtenido)

    aplicarControlesDraft(req.data, resultado, draft.cumpleVisual, parametroCambio)
})
```

Este es el handler que da la sensación de "tiempo real" al capturar un
resultado: cada vez que el usuario teclea un valor o cambia el
parámetro, se releen los datos actuales del draft (`draft`), se
recalcula el cumplimiento, y `aplicarControlesDraft` actualiza
`cumpleVisual`/`esVisual`/controles/`criticidad` en el mismo `req.data`
que CAP va a persistir. El guardia `camposRelevantes.some(...)` evita
trabajo innecesario cuando el PATCH no toca ninguno de los tres campos
que importan (por ejemplo, si solo cambia la `observacion`).

### `on('completarInspeccion', ...)` — la acción bound

```js
this.on('completarInspeccion', Inspecciones, async (req) => {

    const { ID } = req.params.at(-1)

    const inspeccion = await SELECT.one.from(Inspecciones).where({ ID })
    if (!inspeccion) return req.error(404, 'Inspección no encontrada')

    if (inspeccion.status_code !== 'ABIERTA') {
        return req.error(409, 'La inspección ya fue completada o cancelada')
    }

    const resultados = await SELECT.from(ResultadosInspeccion).where({ inspeccion_ID: ID })

    if (resultados.length === 0) {
        return req.error(400, 'Debe registrar al menos un resultado antes de completar')
    }

    await UPDATE(Inspecciones).set({ status_code: 'COMPLETADA' }).where({ ID })

    return {
        mensaje: 'Inspección completada. Pendiente de revisión por Supervisor.',
        status: 'COMPLETADA'
    }
})
```

Tres validaciones antes de cambiar el estado: que exista, que siga
`ABIERTA`, y que tenga al menos un resultado capturado — no tiene
sentido completar una inspección vacía. `this.on` (no `this.before`)
porque una acción bound custom **no tiene** comportamiento por
defecto que interceptar: hay que implementarla entera.

---

## `srv/handlers/supervisor-service.js`

### Cálculo de cumplimiento, reutilizado en lectura

```js
const evaluarCumple = (resultado, rango) => {
    if (resultado.cumpleVisual !== null && resultado.cumpleVisual !== undefined) return resultado.cumpleVisual
    if (!rango || resultado.valorObtenido === null || resultado.valorObtenido === undefined) return
    const v = Number(resultado.valorObtenido)
    return v >= Number(rango.valorMinimo ?? -Infinity) && v <= Number(rango.valorMaximo ?? Infinity)
}
```

Es una versión de solo lectura de `evaluarCumplimiento` del handler
del inspector: si `cumpleVisual` ya tiene un valor guardado (numérico
o visual), lo respeta; si no, evalúa el valor contra el rango. Existe
por separado (no se reutiliza literalmente la del otro handler) porque
aquí no hace falta distinguir "tipo visual" — solo recalcular el
resultado final para mostrarlo.

```js
const cargarResultados = async (inspeccionIds) => {
    const resultados = await SELECT
        .from(ResultadosInspeccion)
        .columns('ID', 'inspeccion_ID', 'parametro_ID', 'valorObtenido', 'cumpleVisual')
        .where({ inspeccion_ID: { in: inspeccionIds } })
    if (resultados.length === 0) return []

    const inspecciones = await SELECT
        .from(Inspecciones)
        .columns('ID', 'lote.material_ID as material_ID')
        .where({ ID: { in: [...new Set(resultados.map((r) => r.inspeccion_ID))] } })
    const materialPorInspeccion = new Map(inspecciones.map((i) => [i.ID, i.material_ID]))

    const rangos = await SELECT
        .from(ParametrosMaterial)
        .columns('material_ID', 'parametro_ID', 'valorMinimo', 'valorMaximo')
        .where({ material_ID: { in: [...new Set(materialPorInspeccion.values())] } })
    const rangoDe = (materialId, parametroId) =>
        rangos.find((r) => r.material_ID === materialId && r.parametro_ID === parametroId)

    return resultados.map((r) => ({
        ...r,
        cumple: evaluarCumple(r, rangoDe(materialPorInspeccion.get(r.inspeccion_ID), r.parametro_ID))
    }))
}
```

Carga en **tres consultas** (no una por fila) todos los resultados de
un lote de inspecciones, el material de cada una, y los rangos
aplicables — un patrón clásico para evitar N+1 consultas cuando se
procesa una lista completa en un `after READ`.

### Campos calculados en lectura

```js
this.after('READ', Inspecciones, async (data) => {
    const rows = asArray(data).filter((i) => i.ID)
    if (rows.length === 0) return

    const resultados = await cargarResultados(rows.map((i) => i.ID))

    for (const inspeccion of rows) {
        const propios = resultados.filter((r) => r.inspeccion_ID === inspeccion.ID)
        const cumplen = propios.filter((r) => r.cumple === true).length

        inspeccion.totalParametros = propios.length
        inspeccion.parametrosCumplen = cumplen
        inspeccion.porcentajeCumplimiento = propios.length
            ? Math.round((cumplen / propios.length) * 10000) / 100
            : null
    }
})

this.after('READ', ResultadosInspeccion, async (data) => {
    const rows = asArray(data).filter((r) => r.ID)
    if (rows.length === 0) return

    const evaluados = await cargarResultados([...new Set(
        (await SELECT.from(ResultadosInspeccion).columns('inspeccion_ID')
            .where({ ID: { in: rows.map((r) => r.ID) } })).map((r) => r.inspeccion_ID)
    )])
    const porId = new Map(evaluados.map((r) => [r.ID, r.cumple]))

    for (const resultado of rows) {
        const cumple = porId.get(resultado.ID)
        resultado.cumple = cumple ?? null
        resultado.criticidad = cumple === true ? 3 : cumple === false ? 1 : 0
    }
})
```

Esto es lo que llena los `virtual totalParametros`, `parametrosCumplen`,
`porcentajeCumplimiento` de `Inspecciones` y el `virtual cumple` de
`ResultadosInspeccion` declarados en `db/schema.cds` (capítulo 02) —
solo en el servicio del supervisor, porque solo ahí hacen falta esos
totales agregados. `Math.round((cumplen / propios.length) * 10000) /
100` es el truco habitual para redondear a 2 decimales sin errores de
punto flotante.

### Validación común: cuándo se puede actuar sobre una inspección

```js
const inspeccionPendiente = async (req) => {
    const { ID } = req.params.at(-1)

    const inspeccion = await SELECT.one.from(Inspecciones).columns('ID', 'status_code', 'lote_ID').where({ ID })
    if (!inspeccion) return req.reject(404, 'Inspección no encontrada')

    if (inspeccion.status_code !== 'COMPLETADA') {
        return req.reject(409, 'Solo se puede actuar sobre inspecciones completadas')
    }

    const decisionExistente = await SELECT.one.from(DecisionLote).columns('ID').where({ inspeccion_ID: ID })
    if (decisionExistente) return req.reject(409, 'Esta inspección ya tiene una decisión registrada')

    return inspeccion
}
```

Nota el comentario que acompaña esta función en el código: usa
`req.reject` (que **lanza**) en vez de `req.error` (que solo
**acumula** el error y deja que el `async function` siga ejecutándose)
precisamente porque el valor de retorno de esta función se usa
después — si fuera `req.error`, el código llamante seguiría
ejecutándose con un `inspeccion` potencialmente `undefined`.

### Las dos acciones bound

```js
const STATUS_LOTE_POR_DECISION = {
    LIBERAR: 'APROBADO',
    RECHAZAR: 'RECHAZADO',
    LIBERAR_CON_DESVIACION: 'APROBADO_CON_DESVIACION'
}
const REQUIEREN_JUSTIFICACION = ['RECHAZAR', 'LIBERAR_CON_DESVIACION']

this.on('tomarDecision', Inspecciones, async (req) => {
    const { decision, justificacion } = req.data
    const nuevoStatusLote = STATUS_LOTE_POR_DECISION[decision]

    if (!nuevoStatusLote) {
        return req.error(400, `Decisión inválida. Valores permitidos: ${Object.keys(STATUS_LOTE_POR_DECISION).join(', ')}`)
    }

    if (REQUIEREN_JUSTIFICACION.includes(decision) && !justificacion?.trim()) {
        return req.error(400, 'La justificación es obligatoria para rechazar o liberar con desviación')
    }

    const inspeccion = await inspeccionPendiente(req)

    await INSERT.into(DecisionLote).entries({
        inspeccion_ID: inspeccion.ID,
        decision_code: decision,
        justificacion: justificacion?.trim() || ''
    })

    await UPDATE(Lotes).set({ status_code: nuevoStatusLote }).where({ ID: inspeccion.lote_ID })

    return {
        mensaje: `Lote ${decision === 'RECHAZAR' ? 'rechazado' : 'liberado'} correctamente`,
        statusLote: nuevoStatusLote
    }
})
```

El mapa `STATUS_LOTE_POR_DECISION` es la traducción explícita
decisión → estado del lote — una sola fuente de verdad para esa regla
de negocio, en vez de un `if/else` disperso. `REQUIEREN_JUSTIFICACION`
es exactamente la regla que el schema (capítulo 02) no podía expresar:
`justificacion` es obligatoria a nivel de columna, pero solo debe
**exigirse no vacía** para dos de las tres decisiones posibles.

```js
this.on('regresarInspeccion', Inspecciones, async (req) => {
    const { observaciones } = req.data

    if (!observaciones?.trim()) {
        return req.error(400, 'Debe indicar las observaciones para regresar la inspección')
    }

    const inspeccion = await inspeccionPendiente(req)

    // Regresa la inspección a ABIERTA con las observaciones del supervisor
    await UPDATE(Inspecciones).set({ status_code: 'ABIERTA', observaciones: observaciones.trim() }).where({ ID: inspeccion.ID })

    // El lote vuelve a EN_INSPECCION
    await UPDATE(Lotes).set({ status_code: 'EN_INSPECCION' }).where({ ID: inspeccion.lote_ID })

    return { mensaje: 'Inspección regresada al inspector con observaciones' }
})
```

Reabre la inspección con las observaciones del supervisor, y devuelve
el lote a `EN_INSPECCION` — el "camino de vuelta" del diagrama de
estados del README.

---

## `srv/handlers/config-service.js`

### Materiales: proteger los campos de maestro

```js
const CAMPOS_MAESTRO = ['codigo', 'descripcion', 'unidad', 'activo']
const ignorarCambiosDeMaestro = (data) => {
    for (const campo of CAMPOS_MAESTRO) delete data[campo]
}

// Live edit on the draft header: silently ignore any attempt to
// change master-data fields while the ranges are being edited.
this.before('PATCH', Materiales.drafts, (req) => {
    ignorarCambiosDeMaestro(req.data)
})
```

Como se explicó en el capítulo 03, `@readonly` a nivel de campo no
basta: cualquier PATCH sobre el draft de `Materiales` que traiga
`codigo`, `descripcion`, `unidad` o `activo` simplemente los borra del
payload en silencio antes de que lleguen a la base — el usuario no
puede cambiarlos ni por error ni manipulando la petición HTTP a mano.

```js
this.before(['CREATE', 'UPDATE'], Materiales, async (req) => {

    // Defense in depth: also strip master-data fields at activation
    // time, regardless of what made it into the draft.
    ignorarCambiosDeMaestro(req.data)

    const rangos = req.data.parametros ?? []
    if (rangos.length === 0) return
    // ... validación de rangos, ver abajo
})
```

*"Defense in depth"*: la misma limpieza se repite en la activación del
documento completo, no solo en el PATCH del draft — por si algún
camino distinto (una integración, un test, un bug futuro) lograra
colar esos campos en el draft sin pasar por el PATCH normal.

### Validación de rangos por parámetro

```js
const parametroIds = [...new Set(rangos.map((r) => r.parametro_ID).filter(Boolean))]

const tipos = await SELECT.from(Parametros).columns('ID', 'tipoParametro_code').where({ ID: parametroIds })
const tipoPorParametro = new Map(tipos.map((p) => [p.ID, p.tipoParametro_code]))

const vistos = new Set()

for (const [i, rango] of rangos.entries()) {

    if (!rango.parametro_ID) continue

    if (vistos.has(rango.parametro_ID)) {
        return req.error({
            code: 400,
            message: 'El parámetro no puede repetirse en el mismo material',
            target: `parametros[${i}]/parametro_ID`
        })
    }
    vistos.add(rango.parametro_ID)

    const esVisual = tipoPorParametro.get(rango.parametro_ID) === TIPO_VISUAL
    const tieneMinimo = tieneValor(rango.valorMinimo)
    const tieneMaximo = tieneValor(rango.valorMaximo)

    if (esVisual) {
        if (tieneMinimo || tieneMaximo) {
            return req.error({ code: 400, message: 'Un parámetro visual no puede tener valor mínimo ni máximo', target: `parametros[${i}]/valorMinimo` })
        }
        continue
    }

    if (!tieneMinimo && !tieneMaximo) {
        return req.error({ code: 400, message: 'Un parámetro numérico requiere al menos un valor mínimo o un valor máximo', target: `parametros[${i}]/valorMinimo` })
    }

    if (tieneMinimo && tieneMaximo && Number(rango.valorMinimo) > Number(rango.valorMaximo)) {
        return req.error({ code: 400, message: 'El valor mínimo no puede ser mayor que el valor máximo', target: `parametros[${i}]/valorMinimo` })
    }
}
```

Esta es la validación que **reemplaza** la confianza ciega en
`@assert.unique` (capítulo 02): el duplicado se detecta aquí, a mano,
con un `Set` de IDs ya vistos, precisamente para poder devolver un 400
con `target` apuntando a la fila exacta del error (`parametros[i]/...`)
— algo que el 500 crudo de `@assert.unique` en SQLite no puede dar.
Las otras tres reglas (visual sin rango, numérico con al menos un
límite, mínimo ≤ máximo) son puramente de negocio y no tienen
representación posible en el schema o en las anotaciones.

### Feedback en vivo al elegir un parámetro en el rango

```js
this.before('PATCH', ParametrosMaterial.drafts, async (req) => {

    if (!('parametro_ID' in req.data)) return

    const rowId = req.data.ID ?? req.params.at(-1)?.ID
    const draft = await SELECT.one.from(ParametrosMaterial.drafts).columns('material_ID', 'parametro_ID', 'valorMinimo', 'valorMaximo').where({ ID: rowId })
    if (!draft) return

    const nuevoParametroId = req.data.parametro_ID

    if (nuevoParametroId && draft.material_ID) {
        const duplicado = await SELECT.one.from(ParametrosMaterial.drafts).columns('ID')
            .where({ material_ID: draft.material_ID, parametro_ID: nuevoParametroId }).and('ID !=', rowId)

        if (duplicado) {
            req.warn({ message: 'El parámetro no puede repetirse en el mismo material', target: 'parametro_ID' })
        }
    }

    if (nuevoParametroId === draft.parametro_ID) return

    const parametro = await SELECT.one.from(Parametros).columns('tipoParametro_code').where({ ID: nuevoParametroId })

    if (parametro?.tipoParametro_code === TIPO_VISUAL) {
        req.data.valorMinimo = null
        req.data.valorMaximo = null
        req.info({ message: 'Se eliminaron los valores mínimo y máximo porque el parámetro es visual', target: 'valorMinimo' })
        return
    }

    const tieneMinimo = tieneValor('valorMinimo' in req.data ? req.data.valorMinimo : draft.valorMinimo)
    const tieneMaximo = tieneValor('valorMaximo' in req.data ? req.data.valorMaximo : draft.valorMaximo)

    if (!tieneMinimo && !tieneMaximo) {
        req.warn({ message: 'Define al menos un valor mínimo o un valor máximo para este parámetro', target: 'valorMinimo' })
    }
})
```

El contraste con el handler de activación anterior es deliberado: aquí
se usa `req.warn`/`req.info` (**no bloqueantes**, llegan como mensajes
al usuario vía `sap-messages`) en vez de `req.error`, porque el
usuario todavía está editando fila por fila y no tiene sentido
impedirle avanzar — la validación que sí bloquea corre recién al
activar el documento completo (la sección anterior). Cuando el nuevo
parámetro es visual, además **limpia** `valorMinimo`/`valorMaximo` de
inmediato y avisa por qué (`req.info`), coherente con
`controlRango` (capítulo 03) que los vuelve de solo lectura en ese
caso.

### Catálogo de parámetros: código único y bloqueo de cambio de tipo

```js
this.before(['CREATE', 'UPDATE'], Parametros, async (req) => {

    const id = req.data.ID ?? req.params.at(-1)?.ID

    if (req.data.tipoParametro_code === TIPO_VISUAL) {
        req.data.unidadMedida = null
    }

    if (req.data.codigo) {
        const existentes = await SELECT.from(Parametros).columns('ID').where({ codigo: req.data.codigo })
        if (existentes.some((p) => p.ID !== id)) {
            return req.error({ code: 400, message: `Ya existe un parámetro con el código ${req.data.codigo}`, target: 'codigo' })
        }
    }

    // Switching an in-use parametro between VISUAL and numeric is
    // rejected in both directions: numeric ranges would become invalid
    // on a VISUAL parametro, and range-less VISUAL rows would become
    // invalid numeric ranges. Switching between numeric types is fine.
    // Draft activation resends the full row, so only an actual change
    // of category counts: unchanged parametros stay editable.
    if (req.event === 'UPDATE' && 'tipoParametro_code' in req.data) {

        const actual = await SELECT.one.from(Parametros).columns('tipoParametro_code').where({ ID: id })

        const eraVisual = actual?.tipoParametro_code === TIPO_VISUAL
        const seraVisual = req.data.tipoParametro_code === TIPO_VISUAL

        if (!actual || eraVisual === seraVisual) return

        const enUso = await SELECT.one.from(ParametrosMaterial).columns('ID').where({ parametro_ID: id })

        if (enUso) {
            return req.error({ code: 400, message: 'No se puede cambiar entre tipo visual y numérico un parámetro que ya está asignado a algún material', target: 'tipoParametro_code' })
        }
    }
})
```

Esta validación pasó por **dos iteraciones** (ver lecciones "block
switching in-use parameters" y "only block actual parameter type
changes" del capítulo 09): la primera versión bloqueaba cualquier
`UPDATE` que trajera `tipoParametro_code`, incluso si el valor no
cambiaba — como la activación del draft siempre reenvía la fila
completa, esto bloqueaba erróneamente ediciones de parámetros que ni
siquiera tocaban el tipo. La versión final (el bloque de arriba)
compara `eraVisual === seraVisual` y solo actúa cuando el **cambio de
categoría es real**. `eraVisual === seraVisual` cubre también cambiar
entre dos tipos numéricos distintos (p. ej. `DIMENSIONAL` →
`ELECTRICO`), que sí está permitido.

```js
this.before('PATCH', Parametros.drafts, async (req) => {

    if (req.data.tipoParametro_code !== TIPO_VISUAL) return

    const id = req.data.ID ?? req.params.at(-1)?.ID
    const draft = await SELECT.one.from(Parametros.drafts).columns('tipoParametro_code').where({ ID: id })
    if (!draft || draft.tipoParametro_code === TIPO_VISUAL) return

    req.data.unidadMedida = null
    req.info({ message: 'Se eliminó la unidad de medida porque el parámetro es visual', target: 'unidadMedida' })
})
```

Mismo patrón de feedback en vivo: al cambiar el tipo a `VISUAL` en el
draft, la unidad de medida se limpia de inmediato y se avisa, en vez
de esperar a que el usuario descubra la inconsistencia al guardar.

---

## `srv/handlers/reports-service.js`

El más corto de los cuatro — un solo handler:

```js
this.on('lotesEnRango', async (req) => {
    const { fechaInicio, fechaFin } = req.data

    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
        return req.error(400, 'fechaInicio debe ser anterior a fechaFin')
    }

    const query = SELECT.from(Lotes)
        .columns('ID', 'numeroLote', 'material.descripcion as material', 'lineaProduccion.descripcion as linea', 'fechaProduccion', 'status.name as status')
        .orderBy({ fechaProduccion: 'desc' })

    if (fechaInicio) query.where({ fechaProduccion: { '>=': fechaInicio } })
    if (fechaFin) query.where({ fechaProduccion: { '<=': fechaFin } })

    return query
})
```

Implementa la `function lotesEnRango` del capítulo 03: valida el orden
de fechas, y arma el `WHERE` de forma incremental según qué parámetros
llegaron — ambos son opcionales, así que `lotesEnRango()` sin
argumentos devuelve todos los lotes ordenados por fecha descendente.

---

## Resumen / checklist

- [ ] Cuando una entidad tiene `@odata.draft.enabled` con hijos anidados, la activación reenvía **el documento completo** a la raíz — la validación profunda va en el `before(['CREATE','UPDATE'], Raíz, ...)`, no en handlers de las entidades hijas.
- [ ] Las columnas calculadas que en la entidad activa vienen de `case/when` (capítulo 03) hay que "simularlas a mano" en cada `NEW`/`PATCH` del draft, porque en la tabla `_drafts` son columnas reales.
- [ ] `req.error` acumula y continúa; `req.reject` lanza y corta — usa `req.reject` cuando el valor de retorno de la función importa para el código siguiente.
- [ ] `req.warn`/`req.info` para feedback no bloqueante mientras se edita; `req.error` solo en la validación autoritativa (activación).
- [ ] `@assert.unique` no es suficiente por sí solo en SQLite (da 500 crudo) — valida duplicados a mano cuando necesitas un 400 con mensaje y `target`.
- [ ] `@readonly` de campo es solo UI — la protección real de campos de solo lectura va en un `before` que los borra del payload, en la activación y en el draft.
- [ ] Antes de bloquear un cambio de valor por "viene en el payload", compara contra el valor actual — la activación del draft reenvía todos los campos, tocados o no.
