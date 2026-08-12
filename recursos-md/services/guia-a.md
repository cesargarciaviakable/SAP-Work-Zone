# Guía A: Service.cds — Definición de servicios CAP

El archivo `.cds` del servicio es el contrato entre tu backend y
la UI. Define qué datos expones, qué operaciones permites, y cómo
se llaman las cosas desde afuera.

---

## Estructura básica

```cds
// Importa el schema
using { my.app as db } from '../db/schema';

// Define el servicio
service OrderService {
    // Entidades expuestas
    entity Orders    as projection on db.Orders;
    entity Customers as projection on db.Customers;
}
```

CAP infiere automáticamente el path OData del nombre del servicio:
- `service OrderService` → `/odata/v4/order/`
- `service BookingService` → `/odata/v4/booking/`
- `service MyGreatService` → `/odata/v4/my-great/`

---

## Proyecciones — Qué expones y cómo

### Proyección completa (todos los campos)

```cds
entity Orders as projection on db.Orders;
```

Expone todos los campos del schema tal como están.

### Proyección parcial (solo algunos campos)

```cds
entity Orders as projection on db.Orders {
    ID,
    title,
    status,
    customer   // ← incluye la asociación
}
```

### Proyección con campo excluido

```cds
entity Orders as projection on db.Orders
    excluding { internalCode, costCenter };
```

### Proyección con campo calculado

```cds
entity Orders as projection on db.Orders {
    *,                                    // ← todos los campos base
    customer.name as customerName : String  // ← campo de asociación aplanado
}
```

### Proyección con case/when (campo calculado condicional)

```cds
entity Orders as projection on db.Orders {
    *,
    case status
        when 'confirmed' then 3
        when 'cancelled' then 1
        else 2
    end as criticality : Integer
}
```

**Importante**: los campos `case/when` no funcionan en entidades
con `@odata.draft.enabled` en HANA. Úsalos solo en entidades sin draft
o en vistas de solo lectura.

### Proyección con filtro fijo (view con WHERE)

```cds
// Solo pedidos confirmados
entity ConfirmedOrders as select from db.Orders
    where status = 'confirmed';
```

### Proyección con join implícito

```cds
entity OrdersWithCustomer as select from db.Orders {
    *,
    customer.name    as customerName    : String,
    customer.email   as customerEmail   : String,
    customer.country as customerCountry : String
};
```

---

## @readonly — Entidades de solo lectura

```cds
service OrderService {
    entity Orders    as projection on db.Orders;    // lectura y escritura

    @readonly
    entity Customers as projection on db.Customers; // solo lectura
    // ↑ CAP deshabilita POST, PUT, PATCH, DELETE automáticamente
}
```

Usa `@readonly` para entidades de referencia que la UI solo consulta
para ValueLists o información adicional.

---

## @odata.draft.enabled — Draft (formularios con guardar/descartar)

```cds
@odata.draft.enabled
entity Orders as projection on db.Orders;
```

Activa el flujo de borrador de Fiori Elements:
- El usuario abre un formulario → se crea un draft
- Puede guardar o descartar
- Al guardar → se activa el draft → los datos van a la tabla real

**Cuándo usarlo**: siempre que el usuario necesite crear o editar
registros con un formulario. Si la entidad es de solo lectura, no lo uses.

**Qué genera en HANA**: CAP crea automáticamente una tabla `_drafts`
adicional para almacenar los borradores temporales.

---

## @cds.redirection.target — Resolver ambigüedades de navegación

Cuando tienes la misma entidad del schema expuesta múltiples veces
en el servicio (por ejemplo `Rooms` y `RoomsView`), CAP no sabe
cuál usar para la navegación OData. Marca la principal:

```cds
@cds.redirection.target
entity Rooms as projection on db.Rooms;

@readonly
entity RoomsView as select from db.Rooms {
    *, building.name as buildingName : String
} excluding { bookings };
```

---

## Acciones (Actions) — Operaciones que modifican datos

Las acciones pueden ser **bound** (ligadas a una entidad específica)
o **unbound** (a nivel del servicio).

### Acción bound — ligada a una instancia de la entidad

```cds
entity Orders as projection on db.Orders actions {
    // Acción sin parámetros
    action confirmOrder() returns Orders;

    // Acción con parámetros
    action cancelOrder(reason : String) returns Orders;

    // Acción con múltiples parámetros
    action reassign(
        newCustomer : UUID,
        reason      : String,
        notifyEmail : Boolean
    ) returns Orders;
}
```

La llama Fiori Elements desde el Object Page de una instancia específica.
Recibe automáticamente el ID de la entidad en `req.params[0]`.

### Acción unbound — a nivel del servicio

```cds
service OrderService {
    entity Orders as projection on db.Orders;

    // Sin referencia a una entidad específica
    action submitBatch(orderIds : array of UUID) returns Integer;
}
```

La llamas desde un botón en el List Report o desde código.
No recibe contexto de ninguna entidad.

### Cuándo usar bound vs unbound

| Situación | Tipo |
|-----------|------|
| Acción sobre un registro específico (aprobar, cancelar, confirmar) | Bound |
| Acción sobre múltiples registros o sin contexto (importar, exportar, enviar batch) | Unbound |
| Botón en el Object Page de Fiori Elements | Bound |
| Botón en el toolbar del List Report | Unbound |

---

## Funciones (Functions) — Operaciones de solo lectura

Las funciones no modifican datos. Son equivalentes a GET en REST.

```cds
service BookingService {
    // Función unbound — retorna una colección
    function getAvailableRooms(
        startTime : DateTime,
        endTime   : DateTime,
        capacity  : Integer
    ) returns array of {
        id           : UUID;
        name         : String;
        capacity     : Integer;
        buildingName : String;
    };

    // Función que retorna un valor simple
    function countPendingOrders() returns Integer;
}
```

**Diferencia con Action**: las funciones usan GET en HTTP, las acciones
usan POST. Las funciones no deben tener efectos secundarios.

---

## Tipos de retorno en acciones y funciones

```cds
// Retorna la misma entidad (lo más común en bound actions)
action confirm() returns Orders;

// Retorna la entidad del servicio (no del schema)
action confirm() returns Orders;   // Orders del servicio, con sus campos calculados

// Retorna un objeto anónimo
action getStatus() returns {
    code    : String;
    message : String;
    success : Boolean;
};

// Retorna array de la entidad
action getRelated() returns array of Orders;

// Retorna array de objeto anónimo
function search(term : String) returns array of {
    id    : UUID;
    title : String;
    score : Integer;
};

// Sin retorno (void)
action notify();
```

---

## @requires — Autenticación y roles

```cds
// Todo el servicio requiere autenticación
@requires: 'authenticated-user'
service OrderService { ... }

// Entidad específica requiere rol
entity AdminOrders as projection on db.Orders
    @requires: 'Admin';

// Restricciones granulares por operación
entity Orders as projection on db.Orders {
    @restrict: [
        { grant: 'READ',  to: 'Viewer' },
        { grant: 'WRITE', to: 'Editor' }
    ]
    ...
}
```

En Free Trial con un solo usuario, usa `@requires: 'authenticated-user'`
como mínimo para que la autenticación XSUAA funcione correctamente.

---

## Múltiples servicios en un proyecto

Puedes tener varios servicios en el mismo proyecto, cada uno con
su propio path OData y sus propias entidades:

```cds
// srv/task-service.cds
service TaskService {
    @odata.draft.enabled
    entity Tasks as projection on db.Tasks;
}

// srv/approval-service.cds
service ApprovalService {
    @readonly
    entity Tasks           as projection on db.Tasks;
    entity ApprovalRequests as projection on db.ApprovalRequests actions {
        action approve(comment : String) returns ApprovalRequests;
        action reject(comment  : String) returns ApprovalRequests;
    };
}
```

Cada servicio tiene su propio `.js` de handlers y su propio
`annotations.cds` en la app UI correspondiente.

**Best practice**: un servicio por caso de uso, no uno por entidad.
`TaskService` maneja el flujo de tareas. `ApprovalService` maneja
el flujo de aprobaciones. Comparten el schema pero exponen
perspectivas distintas.

---

## Convenciones de nombres

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Nombre del servicio | PascalCase + Service | `OrderService` |
| Nombre de entidad expuesta | Igual que en schema | `Orders` |
| Nombre de acción | camelCase, verbo primero | `confirmOrder`, `cancelBooking` |
| Nombre de función | camelCase, verbo primero | `getAvailableRooms`, `countPending` |
| Parámetros | camelCase | `startTime`, `customerId` |

---

## Checklist del service.cds

- [ ] Importa el schema con alias (`using { my.app as db }`)
- [ ] Entidades de referencia marcadas con `@readonly`
- [ ] Entidades editables con `@odata.draft.enabled` si tienen formulario
- [ ] Si hay entidad duplicada, marca la principal con `@cds.redirection.target`
- [ ] Acciones bound definidas dentro del bloque `actions { }` de la entidad
- [ ] Acciones unbound definidas a nivel del servicio
- [ ] Retorno de acciones bound siempre es la entidad (`returns Orders`)
- [ ] Funciones (no actions) para operaciones de solo lectura
- [ ] `@requires` definido al menos a nivel del servicio