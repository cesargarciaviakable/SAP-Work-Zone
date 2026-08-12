# Guía B: Referencia práctica de anotaciones @UI para Fiori Elements

Esta guía cubre las anotaciones que realmente usas día a día
con Fiori Elements + CAP. Cada sección incluye el código completo
y el efecto visual que produce.

---

## UI.LineItem — Columnas del List Report

Define las columnas que aparecen en la tabla del List Report.

### Columna básica

```cds
UI.LineItem: [
    { Value: title,  Label: 'Título'  },
    { Value: status, Label: 'Estado'  },
    { Value: amount, Label: 'Monto'   }
]
```

### Columna con criticality (color según valor)

```cds
UI.LineItem: [
    {
        Value      : status,
        Label      : 'Estado',
        Criticality: criticality   // ← campo calculado: 1=rojo, 2=amarillo, 3=verde
    }
]
```

El campo `criticality` se define en la proyección del servicio:

```cds
entity Orders as projection on db.Orders {
    *,
    case status
        when 'confirmed' then 3   // verde
        when 'cancelled' then 1   // rojo
        else 2                    // amarillo
    end as criticality : Integer
};
```

**Nota**: no funciona con `@odata.draft.enabled` en HANA — en ese
caso calcula el criticality en las anotaciones con `CriticalityCalculation`
o muéstralo solo en el Object Page sin draft.

### Columna con campo de asociación

```cds
UI.LineItem: [
    { Value: customer.name, Label: 'Cliente'  },
    { Value: room.building.name, Label: 'Edificio' }  // ← dos niveles
]
```

### Columna con botón de acción inline

```cds
UI.LineItem: [
    { Value: title },
    {
        $Type : 'UI.DataFieldForAction',
        Action: 'OrderService.confirmOrder',
        Label : 'Confirmar'
    }
]
```

### Importancia en mobile

```cds
{
    Value     : title,
    Label     : 'Título',
    Importance: #High   // #High, #Medium, #Low
}
```

Los campos `#Low` se ocultan en pantallas pequeñas.

---

## UI.HeaderInfo — Encabezado del Object Page

Define el título y subtítulo que aparece en la cabecera del Object Page.

### Básico

```cds
UI.HeaderInfo: {
    TypeName      : 'Pedido',        // ← singular
    TypeNamePlural: 'Pedidos',       // ← plural (para el List Report)
    Title         : { Value: title },
    Description   : { Value: status }
}
```

### Con campo de asociación

```cds
UI.HeaderInfo: {
    TypeName      : 'Reservación',
    TypeNamePlural: 'Reservaciones',
    Title         : { Value: title         },
    Description   : { Value: employee.name }  // ← de una asociación
}
```

### Con imagen

```cds
UI.HeaderInfo: {
    TypeName : 'Producto',
    Title    : { Value: name  },
    ImageUrl : { Value: photo }   // ← campo con URL de imagen
}
```

---

## UI.FieldGroup — Grupos de campos en el Object Page

Agrupa campos en secciones dentro del Object Page.
Siempre se usa junto con `UI.Facets`.

### FieldGroup básico

```cds
UI.FieldGroup #General: {
    $Type: 'UI.FieldGroupType',
    Label: 'Información General',
    Data : [
        { $Type: 'UI.DataField', Value: title,       Label: 'Título'      },
        { $Type: 'UI.DataField', Value: description, Label: 'Descripción' },
        { $Type: 'UI.DataField', Value: status,      Label: 'Estado'      }
    ]
}
```

### Campo de solo lectura (ReadOnly)

```cds
{
    $Type    : 'UI.DataField',
    Value    : createdAt,
    Label    : 'Creado',
    // el campo es @readonly en el schema — Fiori lo muestra sin editar
}
```

### Campo con criticality en Object Page

```cds
{
    $Type      : 'UI.DataField',
    Value      : status,
    Criticality: criticality
}
```

### Campo de asociación (muestra texto en lugar de ID)

```cds
{
    $Type: 'UI.DataField',
    Value: customer_ID,   // ← el campo ID
    Label: 'Cliente'
    // Con @Common.Text y @Common.ValueList mostrará el nombre del cliente
}
```

---

## UI.Facets — Pestañas y secciones del Object Page

Define la estructura de pestañas del Object Page.
Cada facet referencia un FieldGroup o una entidad relacionada.

### Una sola sección

```cds
UI.Facets: [{
    $Type : 'UI.ReferenceFacet',
    ID    : 'GeneralFacet',
    Label : 'Detalles',
    Target: '@UI.FieldGroup#General'
}]
```

### Múltiples secciones (pestañas)

```cds
UI.Facets: [
    {
        $Type : 'UI.ReferenceFacet',
        Label : 'General',
        Target: '@UI.FieldGroup#General'
    },
    {
        $Type : 'UI.ReferenceFacet',
        Label : 'Detalles de Envío',
        Target: '@UI.FieldGroup#Shipping'
    }
]
```

### Sección con tabla de entidad relacionada

```cds
UI.Facets: [
    {
        $Type : 'UI.ReferenceFacet',
        Label : 'General',
        Target: '@UI.FieldGroup#General'
    },
    {
        $Type : 'UI.ReferenceFacet',
        Label : 'Items del Pedido',
        Target: 'items/@UI.LineItem'   // ← tabla de la composición 'items'
    }
]
```

---

## UI.Identification — Botones de acción en Object Page

Define los botones que aparecen en la barra de acciones del Object Page.

### Botón para acción bound (ligada a la entidad)

La acción debe estar definida en el bloque `actions { }` de la entidad:

```cds
// En el service.cds:
entity Orders as projection on db.Orders actions {
    action confirmOrder() returns Orders;
    action cancelOrder()  returns Orders;
};

// En annotations.cds:
UI.Identification: [
    {
        $Type : 'UI.DataFieldForAction',
        Action: 'OrderService.confirmOrder',
        Label : 'Confirmar'
    },
    {
        $Type : 'UI.DataFieldForAction',
        Action: 'OrderService.cancelOrder',
        Label : 'Cancelar'
    }
]
```

### Botón que pide confirmación antes de ejecutar

```cds
{
    $Type                  : 'UI.DataFieldForAction',
    Action                 : 'OrderService.deleteOrder',
    Label                  : 'Eliminar',
    InvocationGrouping     : #ChangeSet,
    Determining            : true   // ← muestra diálogo de confirmación
}
```

### Botón que navega a otra app (IBN)

```cds
{
    $Type              : 'UI.DataFieldForIntentBasedNavigation',
    SemanticObject     : 'Customer',
    Action             : 'display',
    Label              : 'Ver Cliente',
    RequiresContext    : true
}
```

---

## UI.SelectionFields — Filtros del List Report

Define qué campos aparecen como filtros en el panel lateral del List Report.

```cds
UI.SelectionFields: [
    status,        // ← campo simple
    customer_ID,   // ← campo de asociación (muestra ValueList)
    startTime,
    endTime
]
```

Los campos en `SelectionFields` muestran automáticamente el tipo de
filtro apropiado según el tipo CDS del campo:
- `String` → campo de texto
- `DateTime` → date picker
- `Boolean` → checkbox
- Con `@Common.ValueListWithFixedValues` → dropdown

---

## @Common.ValueList — Popup de búsqueda (F4 help)

Muestra un popup de búsqueda cuando el usuario hace clic en un campo
de asociación. Se define sobre el campo ID de la asociación.

### ValueList básico

```cds
annotate OrderService.Orders with {
    customer @Common.ValueList: {
        $Type         : 'Common.ValueListType',
        CollectionPath: 'Customers',    // ← entidad expuesta en el servicio
        Parameters    : [
            {
                $Type            : 'Common.ValueListParameterInOut',
                LocalDataProperty: customer_ID,  // ← campo local
                ValueListProperty: 'ID'          // ← campo en Customers
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'name'        // ← se muestra en el popup
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'email'
            }
        ]
    };
};
```

### ValueList con auto-relleno de campos

Si al seleccionar un cliente quieres que se rellene automáticamente
el email en el formulario:

```cds
Parameters: [
    {
        $Type            : 'Common.ValueListParameterInOut',
        LocalDataProperty: customer_ID,
        ValueListProperty: 'ID'
    },
    {
        $Type            : 'Common.ValueListParameterOut',
        // ↑ Out en lugar de DisplayOnly — rellena el campo local
        LocalDataProperty: customerEmail,   // ← campo en la entidad actual
        ValueListProperty: 'email'          // ← campo en Customers
    }
]
```

Para que `customerEmail` se rellene debe existir como campo calculado
en la proyección del servicio:

```cds
entity Orders as projection on db.Orders {
    *,
    customer.email as customerEmail : String
};
```

### Dropdown con valores fijos (enum)

Para campos con un enum CDS fijo — sin popup, solo dropdown:

```cds
annotate OrderService.Orders with {
    status @Common.ValueListWithFixedValues: true;
};
```

---

## @Common.Text — Mostrar texto en lugar de ID

Cuando un campo es un UUID o código interno, puedes mostrar
un texto descriptivo en su lugar:

```cds
annotate OrderService.Orders with {
    customer_ID @(
        Common.Text           : customer.name,  // ← muestra el nombre
        Common.TextArrangement: #TextOnly        // ← solo texto, sin ID
    );
};
```

Opciones de `TextArrangement`:
- `#TextOnly` — solo el texto ("Juan García")
- `#TextFirst` — texto primero ("Juan García (UUID)")
- `#IDOnly` — solo el ID
- `#IDFirst` — ID primero ("UUID (Juan García)")

---

## @Common.FieldControl — Control de campos

Hace un campo obligatorio, de solo lectura, o deshabilitado.

```cds
annotate OrderService.Orders with {
    title  @Common.FieldControl: #Mandatory;   // ← obligatorio
    status @Common.FieldControl: #ReadOnly;    // ← solo lectura
    code   @Common.FieldControl: #Optional;    // ← opcional (default)
};
```

---

## Tipos de DataField — Resumen

Dentro de `LineItem`, `FieldGroup.Data`, e `Identification` puedes usar:

| Tipo | Para qué |
|------|----------|
| `UI.DataField` | Campo normal (el más común) |
| `UI.DataFieldForAction` | Botón que llama una action CAP |
| `UI.DataFieldForAnnotation` | Referencia a otra anotación (DataPoint, Chart) |
| `UI.DataFieldForIntentBasedNavigation` | Botón que navega a otra app |
| `UI.DataFieldWithUrl` | Campo que muestra un link clickeable |
| `UI.DataFieldWithNavigationPath` | Campo que navega al Object Page de la asociación |

### DataFieldWithUrl

```cds
{
    $Type: 'UI.DataFieldWithUrl',
    Value: documentName,
    Url  : documentUrl,
    Label: 'Documento'
}
```

### DataField con icono en lugar de texto

```cds
{
    $Type              : 'UI.DataField',
    Value              : hasTV,
    Label              : 'TV',
    IconUrl            : 'sap-icon://tv'
}
```

---

## Checklist de anotaciones

- [ ] Archivo `annotations.cds` separado por app en `app/<nombre>/`
- [ ] `using` importa el servicio correcto con alias
- [ ] `UI.LineItem` define las columnas del List Report
- [ ] `UI.HeaderInfo` define título y descripción del Object Page
- [ ] `UI.FieldGroup` agrupa campos con nombre `#NombreGrupo`
- [ ] `UI.Facets` referencia cada FieldGroup y entidades relacionadas
- [ ] `UI.Identification` define botones solo para acciones bound
- [ ] `UI.SelectionFields` lista los campos de filtro del List Report
- [ ] `@title` definido en campos para evitar repetir `Label` en cada DataField
- [ ] `@Common.ValueList` definido para cada campo de asociación
- [ ] `@Common.ValueListWithFixedValues` para campos con enum fijo
- [ ] No hay duplicación de anotaciones entre archivos