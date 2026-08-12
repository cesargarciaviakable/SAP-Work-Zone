# Guía C: Patrones avanzados en servicios CAP

Esta guía cubre los patrones que aparecen en proyectos reales
pero que no son obvios al principio: validaciones complejas,
flujos de estado, comunicación entre servicios, y cómo
estructurar código que escala.

---

## Patrón: Máquina de estados

Cuando una entidad tiene un campo `status` con transiciones
definidas, centraliza las reglas en un objeto para no repetirlas:

```js
// Transiciones permitidas: de qué estado puedes ir a cuál
const TRANSITIONS = {
    draft    : ['confirmed', 'cancelled'],
    confirmed: ['shipped',   'cancelled'],
    shipped  : ['delivered'],
    delivered: [],
    cancelled: []
}

function canTransition(from, to) {
    return TRANSITIONS[from]?.includes(to) ?? false
}

module.exports = class OrderService extends cds.ApplicationService {
    async init() {
        const { Orders } = this.entities

        this.on('changeStatus', Orders, async (req) => {
            const { ID } = req.params[0]
            const { newStatus } = req.data

            const order = await SELECT.one.from(Orders).where({ ID })
            if (!order) return req.error(404, 'Pedido no encontrado.')

            if (!canTransition(order.status, newStatus)) {
                return req.error(400,
                    `No puedes cambiar de '${order.status}' a '${newStatus}'.`
                )
            }

            await UPDATE(Orders)
                .set({ status: newStatus, updatedBy: req.user.id })
                .where({ ID })

            return SELECT.one.from(Orders).where({ ID })
        })

        await super.init()
    }
}
```

---

## Patrón: Validaciones reutilizables

Extrae validaciones a funciones separadas para no repetirlas
en `before('CREATE')` y `before('SAVE')`:

```js
async function validateBooking(req, Bookings, Rooms) {
    const { room_ID, startTime, endTime, attendees, ID } = req.data
    const errors = []

    if (new Date(endTime) <= new Date(startTime))
        errors.push('La hora de fin debe ser posterior a la de inicio.')

    if (new Date(startTime) < new Date())
        errors.push('No puedes reservar en una fecha pasada.')

    const room = await SELECT.one.from(Rooms).where({ ID: room_ID })
    if (!room) {
        errors.push('Sala no encontrada.')
    } else if (attendees > room.capacity) {
        errors.push(`La sala tiene capacidad para ${room.capacity} personas.`)
    }

    if (room) {
        const overlap = await SELECT.one.from(Bookings).where({
            room_ID,
            status: 'confirmed',
            ID    : { '!=': ID },
            and   : {
                startTime: { '<': endTime  },
                endTime  : { '>': startTime }
            }
        })
        if (overlap)
            errors.push(`La sala ya está reservada en ese horario.`)
    }

    // Registra todos los errores de una vez
    errors.forEach(msg => req.error(400, msg))
}

module.exports = class BookingService extends cds.ApplicationService {
    async init() {
        const { Bookings, Rooms } = this.entities

        // Misma validación para CREATE y SAVE
        this.before('SAVE',   Bookings, (req) => validateBooking(req, Bookings, Rooms))
        this.before('CREATE', Bookings, (req) => validateBooking(req, Bookings, Rooms))

        await super.init()
    }
}
```

---

## Patrón: Auto-rellenar campos al crear

```js
this.before('CREATE', Orders, async (req) => {
    // Rellenar campos automáticamente antes de insertar
    req.data.createdBy  = req.user.id
    req.data.status     = req.data.status || 'draft'
    req.data.orderCode  = `ORD-${Date.now()}`
})
```

Con `@odata.draft.enabled` usa `before('SAVE')` en lugar de `before('CREATE')`.

---

## Patrón: Efectos secundarios en after

Cuando una operación debe disparar algo más (notificación, log,
actualización de otra entidad):

```js
this.after('UPDATE', Orders, async (results, req) => {
    const order = Array.isArray(results) ? results[0] : results

    // Solo actuar si el status cambió a 'confirmed'
    if (order.status !== 'confirmed') return

    // Verificar que no existe ya una notificación
    const existing = await SELECT.one.from(Notifications)
        .where({ order_ID: order.ID, type: 'confirmation' })
    if (existing) return

    // Crear la notificación
    await INSERT.into(Notifications).entries({
        order_ID: order.ID,
        type    : 'confirmation',
        sentAt  : new Date().toISOString(),
        sentBy  : req.user.id
    })
})
```

---

## Patrón: Flujo entre dos servicios

Cuando una acción en un servicio necesita acceder a entidades
de otro servicio del mismo proyecto:

```js
// En approval-service.js
this.on('approve', ApprovalRequests, async (req) => {
    const { ID } = req.params[0]

    const request = await SELECT.one.from(ApprovalRequests).where({ ID })
    if (!request) return req.error(404, 'Solicitud no encontrada.')

    await UPDATE(ApprovalRequests).set({
        status    : 'Approved',
        approvedBy: req.user.id,
        decidedAt : new Date().toISOString()
    }).where({ ID })

    // Acceder a Tasks del TaskService
    const TaskSrv = await cds.connect.to('TaskService')
    await TaskSrv.run(
        UPDATE('task.list.Tasks')
            .set({ status: 'Done' })
            .where({ ID: request.task_ID })
    )

    return SELECT.one.from(ApprovalRequests).where({ ID })
})
```

**Alternativa más simple para el mismo proyecto**: acceder
directamente al schema, sin pasar por el otro servicio:

```js
// En lugar de TaskSrv.run(), accede al entity name del schema
const { Tasks } = cds.db.entities('task.list')
await UPDATE(Tasks).set({ status: 'Done' }).where({ ID: request.task_ID })
```

---

## Patrón: Paginación manual en funciones

```js
this.on('searchOrders', async (req) => {
    const { term, skip = 0, top = 20 } = req.data
    const { Orders } = this.entities

    const results = await SELECT.from(Orders)
        .where(`title like '%${term}%' or description like '%${term}%'`)
        .orderBy('createdAt desc')
        .limit(top, skip)   // ← top = cuántos, skip = desde dónde

    const total = await SELECT.one.from(Orders)
        .columns('count(*) as count')
        .where(`title like '%${term}%'`)

    return {
        results,
        total  : total.count,
        hasMore: skip + top < total.count
    }
})
```

---

## Patrón: Manejo de fechas y zonas horarias

CAP almacena fechas en UTC. Para mostrar mensajes de error con
la hora local del usuario:

```js
function formatLocalTime(utcString, timezone = 'America/Monterrey') {
    return new Date(utcString).toLocaleString('es-MX', {
        timeZone : timezone,
        dateStyle: 'short',
        timeStyle: 'short'
    })
}

// En el handler:
if (overlap) {
    return req.error(409,
        `La sala ya tiene una reservación de ` +
        `${formatLocalTime(overlap.startTime)} a ` +
        `${formatLocalTime(overlap.endTime)}.`
    )
}
```

---

## Patrón: Guard clauses (evitar anidamiento profundo)

```js
// ❌ Anidamiento profundo — difícil de leer
this.on('confirm', Orders, async (req) => {
    const { ID } = req.params[0]
    const order = await SELECT.one.from(Orders).where({ ID })
    if (order) {
        if (order.status !== 'confirmed') {
            if (order.status !== 'cancelled') {
                await UPDATE(Orders).set({ status: 'confirmed' }).where({ ID })
                return SELECT.one.from(Orders).where({ ID })
            } else {
                return req.error(400, 'Ya fue cancelado.')
            }
        } else {
            return SELECT.one.from(Orders).where({ ID })
        }
    } else {
        return req.error(404, 'No encontrado.')
    }
})

// ✅ Guard clauses — sale temprano, código plano
this.on('confirm', Orders, async (req) => {
    const { ID } = req.params[0]

    const order = await SELECT.one.from(Orders).where({ ID })
    if (!order)                       return req.error(404, 'No encontrado.')
    if (order.status === 'confirmed') return SELECT.one.from(Orders).where({ ID })
    if (order.status === 'cancelled') return req.error(400, 'Ya fue cancelado.')

    await UPDATE(Orders).set({ status: 'confirmed' }).where({ ID })
    return SELECT.one.from(Orders).where({ ID })
})
```

---

## Patrón: Separar lógica de negocio en módulos

Para servicios complejos, extrae la lógica a archivos separados:

```
srv/
├── order-service.cds
├── order-service.js          ← solo handlers, delega a módulos
├── lib/
│   ├── order-validator.js    ← validaciones
│   ├── order-workflow.js     ← flujos de negocio
│   └── notification.js       ← notificaciones
```

```js
// srv/lib/order-validator.js
async function validateCreate(req, Orders, Customers) {
    const { customer_ID, amount } = req.data
    if (amount <= 0) req.error(400, 'El monto debe ser mayor a cero.')
    const customer = await SELECT.one.from(Customers).where({ ID: customer_ID })
    if (!customer) req.error(404, 'Cliente no encontrado.')
}
module.exports = { validateCreate }

// srv/order-service.js
const { validateCreate } = require('./lib/order-validator')

module.exports = class OrderService extends cds.ApplicationService {
    async init() {
        const { Orders, Customers } = this.entities
        this.before('SAVE', Orders, (req) => validateCreate(req, Orders, Customers))
        await super.init()
    }
}
```

---

## Qué NO hacer en un service.js

**No hagas lógica de presentación** — los labels, colores y formatos
van en `annotations.cds`, no en el JS.

**No hagas queries sin `where`** — `SELECT.from(Orders)` sin filtro
en producción puede devolver millones de registros.

**No modifiques `req.data` en `after`** — en `after` el dato ya fue
guardado. Usa `before` o `on` para modificar antes de guardar.

**No uses `console.log` en producción** — usa `cds.log`:

```js
const log = cds.log('my-service')
log.info('Confirmando pedido', { ID, user: req.user.id })
log.error('Error al confirmar', { ID, error: e.message })
```

**No ignores el `await`** — olvidar `await` en un INSERT o UPDATE
hace que la operación corra en background y el handler devuelve
antes de que se complete.

```js
// ❌ Sin await — la operación puede no completarse
UPDATE(Orders).set({ status: 'confirmed' }).where({ ID })
return SELECT.one.from(Orders).where({ ID })  // puede devolver el estado viejo

// ✅ Con await
await UPDATE(Orders).set({ status: 'confirmed' }).where({ ID })
return SELECT.one.from(Orders).where({ ID })
```

---

## Checklist de patrones avanzados

- [ ] Estados y transiciones centralizados en un objeto/función
- [ ] Validaciones extraídas a funciones reutilizables
- [ ] Guard clauses en lugar de anidamiento profundo
- [ ] `after` solo para efectos secundarios, no para modificar datos
- [ ] `await` en todas las operaciones de BD
- [ ] Sin `console.log` — usa `cds.log`
- [ ] Sin queries sin `where` sobre tablas grandes
- [ ] Lógica compleja separada en módulos en `srv/lib/`
- [ ] Fechas mostradas en zona horaria local en mensajes de error