# Guía A: Estructura y sintaxis de anotaciones CDS

Las anotaciones son metadatos que le dicen a Fiori Elements cómo
renderizar tu servicio CAP. No afectan la lógica del backend —
solo la presentación y el comportamiento de la UI.

---

## Dónde van las anotaciones

Tienes tres opciones. La mejor práctica es la tercera.

### ❌ Opción 1 — En el schema.cds (evitar)

```cds
entity Orders : cuid, managed {
    @UI.LineItem: [...]   // ← mezcla datos con presentación
    title : String;
}
```

Mezcla la definición de datos con la UI. Si cambias de Fiori Elements
a otra UI, tienes que editar el schema.

### ⚠️ Opción 2 — En el service.cds

```cds
annotate OrderService.Orders with @(
    UI.LineItem: [...]
);
```

Funciona, pero el archivo de servicio crece y se vuelve difícil de mantener.

### ✅ Opción 3 — Archivo separado en app/ (best practice)

```
app/
└── orders/
    ├── annotations.cds   ← todas las anotaciones aquí
    ├── manifest.json
    └── xs-app.json
```

```cds
// app/orders/annotations.cds
using OrderService from '../../srv/order-service';

annotate OrderService.Orders with @(
    UI.LineItem: [...]
);
```

CAP incluye automáticamente todo lo que está en `app/` al compilar.
Separar anotaciones por app UI hace que cada archivo sea pequeño
y enfocado en una sola pantalla.

---

## Sintaxis básica

### Anotación simple (un solo valor)

```cds
annotate OrderService.Orders with {
    title @title: 'Order Title';
    //    └─────────────────────── anotación con valor string
};
```

### Anotación con objeto

```cds
annotate OrderService.Orders with @(
//                             └── @ seguido de ( para objeto
    UI.HeaderInfo: {
        TypeName: 'Order',
        Title   : { Value: title }
    }
);
```

### Anotación sobre un campo específico

```cds
annotate OrderService.Orders with {
    status @(
        Common.ValueListWithFixedValues: true,
        UI.Hidden: false
    );
};
```

### Múltiples anotaciones en un bloque

```cds
annotate OrderService.Orders with @(
    UI.LineItem   : [...],
    UI.HeaderInfo : {...},
    UI.Facets     : [...]
    // ↑ separadas por comas dentro del mismo @( )
);
```

---

## Los vocabularios principales

Los vocabularios son los "namespaces" de las anotaciones.
Cada uno cubre un área diferente.

### `@UI` — Presentación visual

El más usado. Controla todo lo que el usuario ve en Fiori Elements.

| Anotación | Dónde aplica | Para qué |
|-----------|-------------|----------|
| `@UI.LineItem` | Entity | Columnas del List Report |
| `@UI.HeaderInfo` | Entity | Encabezado del Object Page |
| `@UI.FieldGroup` | Entity | Grupo de campos en una sección |
| `@UI.Facets` | Entity | Pestañas/secciones del Object Page |
| `@UI.Identification` | Entity | Botones de acción en Object Page |
| `@UI.SelectionFields` | Entity | Filtros del List Report |
| `@UI.Hidden` | Campo | Ocultar campo en la UI |
| `@UI.HiddenFilter` | Campo | Ocultar campo solo en filtros |
| `@UI.Importance` | Campo en LineItem | Prioridad en mobile |
| `@UI.MultiLineText` | Campo | Mostrar como textarea |
| `@UI.DataPoint` | Entity | KPI/valor destacado en header |

### `@Common` — Comportamiento común

Controla etiquetas, ValueLists, y comportamiento de campos.

| Anotación | Para qué |
|-----------|----------|
| `@Common.Label` | Etiqueta del campo (igual que `@title`) |
| `@Common.Text` | Mostrar texto de otra entidad en lugar del ID |
| `@Common.ValueList` | Popup de búsqueda (F4 help) |
| `@Common.ValueListWithFixedValues` | Dropdown con valores fijos |
| `@Common.FieldControl` | Campo obligatorio, de solo lectura, o deshabilitado |
| `@Common.SideEffects` | Refrescar campos cuando otro cambia |

### `@Capabilities` — Restricciones CRUD

Controla qué operaciones permite la UI.

```cds
annotate OrderService.Orders with @(
    Capabilities.InsertRestrictions: { Insertable: true  },
    Capabilities.UpdateRestrictions: { Updatable : true  },
    Capabilities.DeleteRestrictions: { Deletable : false }
    //                                              └── no permite borrar
);
```

### `@title` — Atajo para etiquetas

```cds
annotate OrderService.Orders with {
    title  @title: 'Título';
    status @title: 'Estado';
    // equivale a @Common.Label: 'Título'
};
```

---

## Tipos de valores en anotaciones

### String

```cds
@title: 'Order Title'
@description: 'Gestión de pedidos'
```

### Boolean

```cds
@readonly: true
@mandatory: true
@Common.ValueListWithFixedValues: true
```

### Referencia a campo

```cds
{ Value: title }        // campo de la misma entidad
{ Value: room.name }    // campo de una asociación
```

### Enum con #

```cds
@UI.Importance: #High   // #High, #Medium, #Low
@FieldControl : #ReadOnly
```

### Array [ ]

```cds
@UI.LineItem: [
    { Value: title  },
    { Value: status }
]
```

### Objeto { }

```cds
@UI.HeaderInfo: {
    TypeName: 'Order',
    Title   : { Value: title }
}
```

---

## Nombrar FieldGroups

Cuando defines múltiples FieldGroups en una entidad, les das un
nombre con `#` para distinguirlos:

```cds
annotate OrderService.Orders with @(
    UI.FieldGroup #General: {
        Label: 'General',
        Data : [...]
    },
    UI.FieldGroup #Shipping: {
        Label: 'Shipping',
        Data : [...]
    },
    UI.Facets: [
        { Target: '@UI.FieldGroup#General'  },
        { Target: '@UI.FieldGroup#Shipping' }
    ]
);
```

Sin el `#` solo puedes tener un `FieldGroup` por entidad.

---

## Best practices de anotaciones

**1. Un archivo de anotaciones por app UI**
No pongas las anotaciones de `orders` y `products` en el mismo archivo.
Cada app tiene su propio `annotations.cds` en su carpeta.

**2. Separa anotaciones de entidad de anotaciones de campo**
Primero el bloque `@( )` para la entidad, después el bloque `{ }`
para los campos:

```cds
// Anotaciones de entidad (UI, Capabilities)
annotate OrderService.Orders with @(
    UI.LineItem   : [...],
    UI.HeaderInfo : {...}
);

// Anotaciones de campos (title, ValueList, FieldControl)
annotate OrderService.Orders with {
    title  @title: 'Título';
    status @Common.ValueListWithFixedValues: true;
};
```

**3. Usa `@title` en lugar de `Label` dentro de LineItem cuando sea posible**
Si defines `@title` en el campo, no necesitas repetir el `Label`
en cada `DataField` del `LineItem`:

```cds
// En lugar de esto en cada DataField:
{ $Type: 'UI.DataField', Value: title, Label: 'Título' }

// Define @title una vez:
annotate OrderService.Orders with {
    title @title: 'Título';
};
// Y en LineItem omite el Label — lo toma del @title:
{ Value: title }
```

**4. Referencia servicios con alias**

```cds
// ✅ Con alias — más limpio
using OrderService as service from '../../srv/order-service';
annotate service.Orders with @(...);

// ❌ Sin alias — más verbose
using OrderService from '../../srv/order-service';
annotate OrderService.Orders with @(...);
```

**5. Nunca dupliques anotaciones**
Si defines `@UI.LineItem` dos veces para la misma entidad en archivos
distintos, CAP toma la última que encuentra. Mantén una sola definición
por anotación por entidad.

**6. Ordena las anotaciones por importancia visual**
Dentro del bloque `@( )` ordena: LineItem → HeaderInfo → Identification
→ Facets → FieldGroups → SelectionFields. Es más fácil de leer
cuando el orden refleja la jerarquía visual de la pantalla.

---

## Qué no puede hacer una anotación

- **No ejecuta lógica**: para validaciones, cálculos o flujos usa el
  handler `.js` del servicio.
- **No cambia datos**: solo afecta cómo se muestra o qué operaciones
  habilita la UI.
- **No reemplaza autorización**: `@Capabilities.DeleteRestrictions`
  oculta el botón en la UI pero no bloquea el DELETE en el backend.
  La seguridad real va en el `.cds` del servicio con `@restrict`.