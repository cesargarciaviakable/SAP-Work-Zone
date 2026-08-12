# Guía B: Service.js — Handlers y eventos CAP

El archivo `.js` del servicio contiene la lógica de negocio.
CAP usa un sistema de eventos — cada operación OData dispara
eventos en un orden específico que puedes interceptar.

---

## Estructura base

```js
const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE, DELETE } = require('@sap/cds/lib/ql/cds-ql')

module.exports = class OrderService extends cds.ApplicationService {
    async init() {
        const { Orders, Customers } = this.entities

        // Registra handlers aquí

        await super.init()  // ← siempre al final, nunca olvidar
    }
}
```

**Por qué `await super.init()`**: inicializa los handlers genéricos
de CAP (CRUD automático, draft, etc.). Sin él, nada funciona.
Siempre al final del `init()`.

---

## Los tres tipos de handler

### `this.before` — Antes de la operación (validar, enriquecer)

Se ejecuta antes de que CAP procese la operación. Ideal para
validaciones — si llamas `req.error()`, la operación no continúa.

```js
this.before('CREATE', Orders, async (req) => {
    // Validar antes de insertar
    if (!req.data.title) {
        return req.error(400, 'El título es obligatorio.')
    }
})
```

### `this.on` — Reemplaza la operación (lógica custom)

Se ejecuta en lugar del comportamiento por defecto de CAP.
Debes devolver el resultado tú mismo.

```js
this.on('confirmOrder', Orders, async (req) => {
    // CAP no hace nada por defecto para esta acción custom
    // Tú manejas toda la lógica y devuelves el resultado
    const { ID } = req.params[0]
    await UPDATE(Orders).set({ status: 'confirmed' }).where({ ID })
    return SELECT.one.from(Orders).where({ ID })
})
```

### `this.after` — Después de la operación (enriquecer resultado)

Se ejecuta después de que CAP completó la operación.
Puedes modificar el resultado o disparar efectos secundarios.

```js
this.after('READ', Orders, (results) => {
    // Enriquecer cada resultado
    results.forEach(order => {
        order.isOverdue = new Date(order.dueDate) < new Date()
    })
})
```

---

## Eventos disponibles por operación

| Evento | Cuándo se dispara |
|--------|-----------------|
| `CREATE` | POST a la entidad |
| `READ` | GET a la entidad o colección |
| `UPDATE` | PATCH o PUT |
| `DELETE` | DELETE |
| `SAVE` | Al activar un draft (guardar en Fiori Elements) |
| `NEW` | Al crear un nuevo draft |
| `CANCEL` | Al descartar un draft |
| `nombre-de-accion` | Cuando se llama una action custom |

### Cuándo usar `before('SAVE')` vs `before('CREATE')`

Con `@odata.draft.enabled`:
- `before('CREATE')` — se dispara cuando se crea el draft (formulario vacío)
- `before('SAVE')` — se dispara cuando el usuario presiona "Save" (datos completos)

**Siempre usa `before('SAVE')` para validaciones con draft** — en
`before('CREATE')` los campos aún están vacíos.

Sin draft:
- `before('CREATE')` funciona normalmente.

---

## Accediendo a los datos del request

```js
this.before('CREATE', Orders, async (req) => {
    // Datos que el usuario envió
    const { title, status, customer_ID } = req.data

    // Usuario autenticado
    const userId = req.user.id         // ID del usuario (email o UUID)
    const userName = req.user.name     // Nombre completo

    // Tenant (para multi-tenant)
    const tenant = req.tenant

    // Idioma del request
    const locale = req.locale          // 'en', 'es', 'de', etc.
})
```

---

## Accediendo a parámetros de acciones bound

```js
this.on('confirmOrder', Orders, async (req) => {
    // ID de la entidad sobre la que se ejecuta la acción
    const { ID } = req.params[0]
    // req.params[0] puede ser { ID: 'uuid' } o directamente el UUID

    // Parámetros que el usuario pasó en el diálogo
    const { reason, notifyEmail } = req.data
})
```

---

## Queries con CQL

CAP tiene su propio lenguaje de queries que se traduce a SQL.

### SELECT

```js
// Un registro
const order = await SELECT.one.from(Orders).where({ ID })

// Múltiples registros
const confirmed = await SELECT.from(Orders).where({ status: 'confirmed' })

// Con columnas específicas
const titles = await SELECT.from(Orders).columns('ID', 'title', 'status')

// Con ordenamiento y límite
const recent = await SELECT.from(Orders)
    .orderBy('createdAt desc')
    .limit(10)

// Con condición compleja
const overlap = await SELECT.one.from(Bookings).where({
    room_ID,
    status: 'confirmed',
    and: {
        startTime: { '<': endTime  },
        endTime  : { '>': startTime }
    }
})

// Con expand de asociación
const withCustomer = await SELECT.from(Orders)
    .columns('*', 'customer { name, email }')
```

### INSERT

```js
// Un registro
await INSERT.into(Orders).entries({
    title      : 'New Order',
    status     : 'draft',
    createdBy  : req.user.id
})

// Múltiples registros
await INSERT.into(Orders).entries([
    { title: 'Order 1', status: 'draft' },
    { title: 'Order 2', status: 'draft' }
])
```

### UPDATE

```js
// Actualizar campos específicos
await UPDATE(Orders)
    .set({ status: 'confirmed', confirmedAt: new Date().toISOString() })
    .where({ ID })

// Actualizar con expresión
await UPDATE(Orders)
    .set('amount = amount * 1.16')  // ← SQL directo
    .where({ status: 'draft' })
```

### DELETE

```js
await DELETE.from(Orders).where({ ID })
```

---

## Manejo de errores

```js
// Error que detiene la operación (no continúa)
return req.error(400, 'Mensaje de error.')
// El 400 es el código HTTP. Usa:
// 400 — Bad Request (datos inválidos)
// 403 — Forbidden (sin permiso)
// 404 — Not Found (no existe)
// 409 — Conflict (ya existe, traslape)

// Error informativo (continúa, pero avisa)
req.warn(200, 'Este registro está próximo a vencer.')

// Mensaje informativo
req.info(200, 'Operación completada.')

// Múltiples errores (todos se muestran)
req.error(400, 'El título es obligatorio.')
req.error(400, 'La fecha de inicio es inválida.')
return  // ← detiene la ejecución después de registrar ambos errores
```

---

## Acceso a entidades de otros servicios

```js
async init() {
    const { Orders } = this.entities

    this.after('UPDATE', Orders, async (results, req) => {
        const order = Array.isArray(results) ? results[0] : results

        // Acceder a entidades de otro servicio
        const NotificationService = await cds.connect.to('NotificationService')
        await NotificationService.send('notify', {
            userId : order.customer_ID,
            message: `Tu pedido ${order.title} fue actualizado.`
        })
    })

    await super.init()
}
```

---

## Registrar múltiples eventos del mismo tipo

```js
// ✅ Correcto — handler separado por entidad
this.before('CREATE', Orders,   async (req) => { /* validar orders   */ })
this.before('CREATE', Invoices, async (req) => { /* validar invoices */ })

// ✅ Correcto — varios eventos en un handler
this.before(['CREATE', 'UPDATE'], Orders, async (req) => {
    // Se ejecuta tanto en CREATE como en UPDATE
})

// ✅ Correcto — handler para todos los CREATE del servicio
this.before('CREATE', async (req) => {
    // Se ejecuta en CREATE de cualquier entidad del servicio
    console.log('Creating:', req.entity)
})
```

---

## this.before vs this.on para acciones custom

```js
// ❌ Incorrecto — before no se dispara para acciones custom
this.before('confirmOrder', Orders, async (req) => { ... })

// ✅ Correcto — las acciones custom siempre usan this.on
this.on('confirmOrder', Orders, async (req) => { ... })
```

`this.before` y `this.after` son para eventos CRUD estándar.
Para acciones y funciones custom siempre usa `this.on`.

---

## Patrón: handler de acción bound completo

```js
this.on('confirmOrder', Orders, async (req) => {
    const { ID } = req.params[0]
    const { comment } = req.data

    // 1. Verificar que existe
    const order = await SELECT.one.from(Orders).where({ ID })
    if (!order) return req.error(404, `Pedido ${ID} no encontrado.`)

    // 2. Verificar estado actual
    if (order.status === 'confirmed')
        return SELECT.one.from(Orders).where({ ID })  // ya estaba confirmado, devuelve sin error
    if (order.status === 'cancelled')
        return req.error(400, 'No puedes confirmar un pedido cancelado.')
    if (order.status !== 'draft')
        return req.error(400, 'El pedido no está en estado borrador.')

    // 3. Ejecutar la operación
    await UPDATE(Orders).set({
        status     : 'confirmed',
        confirmedAt: new Date().toISOString(),
        confirmedBy: req.user.id,
        comment    : comment || null
    }).where({ ID })

    // 4. Devolver el registro actualizado
    return SELECT.one.from(Orders).where({ ID })
})
```

---

## Buenas prácticas del service.js

**1. Siempre verifica que el registro existe antes de operar**

```js
const record = await SELECT.one.from(Entity).where({ ID })
if (!record) return req.error(404, `Registro no encontrado.`)
```

**2. Verifica el estado antes de cambiar**

```js
if (record.status === 'cancelled')
    return req.error(400, 'No puedes modificar un registro cancelado.')
```

**3. Para acciones bound, devuelve el registro actualizado**

```js
// ✅ Devuelve el registro — Fiori Elements actualiza el Object Page
return SELECT.one.from(Orders).where({ ID })

// ❌ No devuelvas undefined — Fiori Elements no actualiza la UI
```

**4. No uses `cds.transaction(req)` — es innecesario en versiones modernas**

```js
// ❌ Estilo antiguo
const tx = cds.transaction(req)
await tx.run(SELECT.from(Orders))

// ✅ Estilo moderno — CAP maneja la transacción automáticamente
await SELECT.from(Orders)
```

**5. Desestructura las entidades en `init()`, no en cada handler**

```js
// ✅ Una vez en init()
async init() {
    const { Orders, Customers } = this.entities

    this.on('confirm', Orders, async (req) => {
        // Orders ya está disponible
    })
}

// ❌ Repetitivo
this.on('confirm', Orders, async (req) => {
    const { Orders } = this.entities  // innecesario, ya lo tienes arriba
})
```

**6. Nunca uses `return super.init()` — usa `await`**

```js
// ❌ Sin await — puede causar problemas de inicialización
return super.init()

// ✅ Con await
await super.init()
```

---

## Checklist del service.js

- [ ] La clase extiende `cds.ApplicationService`
- [ ] `const { Entidades } = this.entities` al inicio del `init()`
- [ ] Validaciones en `this.before('SAVE')` para entidades con draft
- [ ] Validaciones en `this.before('CREATE')` para entidades sin draft
- [ ] Acciones custom siempre en `this.on()`
- [ ] Cada acción verifica existencia del registro antes de operar
- [ ] Cada acción verifica el estado actual antes de cambiar
- [ ] Acciones bound devuelven `SELECT.one.from(Entity).where({ ID })`
- [ ] Sin `cds.transaction(req)` — innecesario en CAP moderno
- [ ] `await super.init()` al final del `init()`