# 05b — Anotaciones de qm-supervisor

## Qué vas a aprender

Cómo `app/qm-supervisor/annotations.cds` construye una UI de solo lectura
con dos acciones de negocio (`tomarDecision`, `regresarInspeccion`), cómo
`Core.OperationAvailable` habilita/deshabilita esos botones según el
campo calculado `pendienteDecision`, y cómo `Common.SideEffects` refresca
la pantalla después de ejecutar una acción sin recargar. Este capítulo da
por leído el capítulo 03 (donde se explicó `SupervisorService`) y el
capítulo 04 (donde se explicaron sus handlers).

---

## La idea central: nada se edita, todo pasa por acciones

El comentario del propio `supervisor-service.cds` lo resume: *"All state
changes go through the bound actions; the supervisor never edits lotes,
inspecciones or resultados"*. Esa filosofía se nota en cada anotación de
este archivo — no hay `@odata.draft.enabled`, no hay ningún
`Capabilities.*Restrictions: { *: true }` habilitando escritura. Los
únicos "botones de escritura" de toda la app son los dos
`UI.DataFieldForAction`.

```cds
using SupervisorService as service from '../../srv/supervisor-service';
```

---

## List Report de Inspecciones

```cds
annotate service.Inspecciones with @(
  UI.SelectionFields: [
    status_code,
    lote_ID,
    fechaInspeccion
  ],

  UI.LineItem: [
    {
      $Type: 'UI.DataFieldForAction',
      Label: 'Tomar Decisión',
      Action: 'SupervisorService.tomarDecision'
    },
    {
      $Type: 'UI.DataFieldForAction',
      Label: 'Regresar Inspección',
      Action: 'SupervisorService.regresarInspeccion'
    },
    { Value: lote_ID, Label: 'Lote' },
    { Value: lote.material.descripcion, Label: 'Material' },
    { Value: lote.lineaProduccion.descripcion, Label: 'Línea' },
    { Value: fechaInspeccion, Label: 'Fecha Inspección' },
    { Value: status_code, Label: 'Status' },
    { Value: porcentajeCumplimiento, Label: '% Cumplimiento' },
    { Value: lote.status_code, Label: 'Status Lote' },
    {
      Value: decision.decision_code,
      Label: 'Decisión',
      Criticality: criticidadDecision,
      // High importance keeps the column visible on narrow screens
      ![@UI.Importance]: #High
    }
  ],

  UI.PresentationVariant: {
    SortOrder: [
      { Property: fechaInspeccion, Descending: true }
    ],
    Visualizations: [ '@UI.LineItem' ]
  }
);
```

| Elemento | Qué hace | Por qué |
|---|---|---|
| `UI.SelectionFields: [status_code, lote_ID, fechaInspeccion]` | Filtros de la barra del List Report | El supervisor filtra casi siempre por estado — de ahí que `status_code` vaya primero. |
| Los dos primeros `UI.DataFieldForAction` | Agregan botones de acción **por fila** en la tabla | El supervisor puede decidir sin entrar al Object Page — importante cuando revisa varias inspecciones seguidas. |
| `lote.material.descripcion`, `lote.lineaProduccion.descripcion` | Columnas que navegan por asociación | Fiori Elements genera el `$expand` automáticamente; el supervisor ve el contexto del lote sin abrir nada. |
| Columna `Decisión` (última, con `Criticality` e `Importance: #High`) | Verifica de forma exacta la lección de UX del proyecto (capítulo 09) | Es, literalmente, el último elemento de dato del array `UI.LineItem` (los dos anteriores son botones, no columnas). `Criticality: criticidadDecision` la colorea con la columna calculada del `.cds` (3 verde/LIBERAR, 2 amarillo/LIBERAR_CON_DESVIACION, 1 rojo/RECHAZAR, 0 neutro). `![@UI.Importance]: #High` evita que la tabla responsive la oculte en pantallas angostas — la decisión final es lo primero que no debe desaparecer. |
| `UI.PresentationVariant.SortOrder` | Ordena por `fechaInspeccion` descendente | Las inspecciones más recientes (probablemente las pendientes de revisar) aparecen primero. |

Esta regla de negocio tiene su propio test dedicado
(`test/supervisor-list.test.js`, capítulo 08) que verifica, contra el
`$metadata` real, que la columna sea la última y lleve exactamente esos
dos atributos.

---

## Object Page de Inspecciones

```cds
  UI.HeaderInfo: {
    TypeName: 'Inspección',
    TypeNamePlural: 'Inspecciones',
    Title: { Value: lote.numeroLote },
    Description: { Value: lote.material.descripcion }
  },

  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Cumplimiento' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status' }
  ],
  UI.DataPoint #Cumplimiento: { Value: porcentajeCumplimiento, Title: '% Cumplimiento' },
  UI.DataPoint #Status: { Value: status_code, Title: 'Status' },
```

`Title: { Value: lote.numeroLote }` — el encabezado del Object Page
muestra el número de lote, no el UUID técnico de la inspección; eso
importa porque es lo que el supervisor reconoce a simple vista.
`UI.HeaderFacets` con dos `UI.DataPoint` (cumplimiento y estado) son las
"tarjetas" visuales del header — el supervisor ve el porcentaje de
cumplimiento sin hacer scroll, antes de decidir.

```cds
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Label: 'Tomar Decisión', Action: 'SupervisorService.tomarDecision' },
    { $Type: 'UI.DataFieldForAction', Label: 'Regresar Inspección', Action: 'SupervisorService.regresarInspeccion' }
  ],

  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Inspección', Target: '@UI.FieldGroup#Inspeccion' },
    { $Type: 'UI.ReferenceFacet', Label: 'Lote', Target: '@UI.FieldGroup#Lote' },
    { $Type: 'UI.ReferenceFacet', Label: 'Resultados', Target: 'resultados/@UI.LineItem#Resultados' },
    { $Type: 'UI.ReferenceFacet', Label: 'Decisión', Target: 'decision/@UI.FieldGroup#Decision' }
  ],
```

`UI.Identification` repite los mismos dos botones de acción, ahora en la
barra del Object Page. `UI.Facets` arma las cuatro secciones/pestañas:
dos `FieldGroup` normales (Inspección, Lote) y dos que navegan por
composición — `resultados/@UI.LineItem#Resultados` (tabla anidada de
resultados, con el calificador `#Resultados` que se define más abajo
sobre `ResultadosInspeccion`) y `decision/@UI.FieldGroup#Decision`
(campo group definido sobre `DecisionLote`). El patrón `entidadHija/
@Anotación#Calificador` es cómo Fiori Elements arma una sección a partir
de una composición sin tener que declarar una vista separada.

```cds
  UI.FieldGroup #Inspeccion: {
    Data: [
      { Value: fechaInspeccion, Label: 'Fecha' },
      { Value: status_code, Label: 'Status' },
      { Value: totalParametros, Label: 'Parámetros medidos' },
      { Value: parametrosCumplen, Label: 'Parámetros que cumplen' },
      { Value: porcentajeCumplimiento, Label: '% Cumplimiento' },
      { Value: observaciones, Label: 'Observaciones' }
    ]
  },
  UI.FieldGroup #Lote: {
    Data: [
      { Value: lote.numeroLote, Label: 'No. Lote' },
      { Value: lote.material.descripcion, Label: 'Material' },
      { Value: lote.lineaProduccion.descripcion, Label: 'Línea' },
      { Value: lote.turno.name, Label: 'Turno' },
      { Value: lote.cantidad, Label: 'Cantidad' },
      { Value: lote.unidad, Label: 'Unidad' },
      { Value: lote.fechaProduccion, Label: 'Fecha Producción' },
      { Value: lote.status_code, Label: 'Status Lote' }
    ]
  }
);
```

`totalParametros`, `parametrosCumplen`, `porcentajeCumplimiento` son
exactamente los tres campos `virtual` del schema (capítulo 02) que el
handler `this.after('READ', Inspecciones, ...)` de
`supervisor-service.js` (capítulo 04) rellena — sin ese `after`, estas
tres columnas del `FieldGroup #Inspeccion` estarían siempre vacías.

---

## Propiedades individuales de Inspecciones

```cds
annotate service.Inspecciones with {
  lote
    @title: 'Lote'
    @Common.Text: lote.numeroLote
    @Common.TextArrangement: #TextOnly
    @Common.ValueList: {
      CollectionPath: 'Lotes',
      SearchSupported: true,
      Parameters: [
        { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: lote_ID, ValueListProperty: 'ID' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'numeroLote' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'fechaProduccion' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'status_code' }
      ]
    };

  status
    @title: 'Status'
    @Common.Text: status.name
    @Common.TextArrangement: #TextOnly
    @Common.ValueListWithFixedValues
    @Common.FilterDefaultValue: 'COMPLETADA'
    @Common.ValueList: { CollectionPath: 'StatusInspeccion', Parameters: [ /* ... */ ] };

  fechaInspeccion        @title: 'Fecha de Inspección';
  observaciones          @title: 'Observaciones' @UI.MultiLineText;
  totalParametros        @title: 'Parámetros medidos';
  parametrosCumplen      @title: 'Parámetros que cumplen';
  porcentajeCumplimiento @title: '% Cumplimiento' @Measures.Unit: '%';
  pendienteDecision      @UI.Hidden;
};
```

Lo más importante de este bloque es `@Common.FilterDefaultValue:
'COMPLETADA'` sobre `status`: el filtro de estado llega **preseleccionado**
en `COMPLETADA` cuando el supervisor abre la lista — entra directo a lo
que tiene pendiente de decidir, sin filtrar manualmente cada vez.
`@Common.ValueListWithFixedValues` convierte ese filtro en un dropdown en
vez de un popup de búsqueda, apropiado para una lista corta y fija de
estados. `pendienteDecision @UI.Hidden` — este campo calculado
(`status = 'COMPLETADA' and decision.ID is null`, capítulo 03) nunca se
muestra como columna: existe únicamente para gobernar la disponibilidad
de las acciones, como ves a continuación.

---

## Las acciones bound — disponibilidad condicional y refresco automático

```cds
annotate service.Inspecciones actions {

  tomarDecision @(
    Core.OperationAvailable: { $edmJson: { $Path: 'in/pendienteDecision' } },
    Common.SideEffects: {
      TargetProperties: [ 'in/pendienteDecision' ],
      TargetEntities: [ in.decision, in.lote ]
    }
  ) (
    decision
      @title: 'Decisión'
      @mandatory
      @Common.ValueListWithFixedValues
      @Common.ValueList: { CollectionPath: 'TiposDecision', Parameters: [ /* ... */ ] },
    justificacion
      @title: 'Justificación (obligatoria para rechazar o liberar con desviación)'
      @UI.MultiLineText
  );

  regresarInspeccion @(
    Core.OperationAvailable: { $edmJson: { $Path: 'in/pendienteDecision' } },
    Common.SideEffects: {
      TargetProperties: [ 'in/status_code', 'in/observaciones', 'in/pendienteDecision' ],
      TargetEntities: [ in.lote ]
    }
  ) (
    observaciones
      @title: 'Observaciones para el inspector'
      @mandatory
      @UI.MultiLineText
  );
};
```

| Elemento | Qué hace | Por qué |
|---|---|---|
| `Core.OperationAvailable: { $edmJson: { $Path: 'in/pendienteDecision' } }` en ambas acciones | El botón está **habilitado** (no oculto, sino gris/activo) solo cuando `pendienteDecision` es `true` | Es la contraparte visual del `@restrict` del backend (`grant: 'tomarDecision', to: 'SupervisorCalidad'`) y de la guardia `inspeccionPendiente()` del handler (capítulo 04) — pero la autorización real sigue viviendo en el backend, esto solo evita que el usuario haga clic en un botón que de todas formas fallaría. |
| `in.` | Sintaxis de OData CDS para "la entidad de entrada de la acción bound" | `in/pendienteDecision`, `in.decision`, `in.lote` se refieren a campos/asociaciones de la propia `Inspecciones` sobre la que se invoca la acción. |
| `Common.SideEffects` de `tomarDecision` | Tras ejecutar la acción, refresca `pendienteDecision` y las entidades `decision`/`lote` | El handler acaba de insertar en `DecisionLote` y actualizar el `status` del lote — sin este SideEffect, la UI seguiría mostrando el estado viejo hasta que el usuario recargue manualmente. |
| `Common.SideEffects` de `regresarInspeccion` | Refresca `status_code`, `observaciones`, `pendienteDecision` de la inspección y la entidad `lote` | El handler `regresarInspeccion` vuelve la inspección a `ABIERTA` y el lote a `EN_INSPECCION` — ambos cambios necesitan reflejarse en pantalla de inmediato. |
| Parámetro `decision` con `Common.ValueListWithFixedValues` sobre `TiposDecision` | Dropdown fijo con las tres decisiones posibles | Evita errores de tipeo; solo hay tres valores válidos (capítulo 02). |
| Parámetro `justificacion` con `@UI.MultiLineText` | Textarea | Puede ser un texto largo; el label recuerda al usuario cuándo es obligatoria — la validación real ocurre en el handler (`REQUIEREN_JUSTIFICACION.includes(decision) && !justificacion?.trim()`, capítulo 04). |

---

## Resultados — tabla anidada de solo lectura

```cds
annotate service.ResultadosInspeccion with @(
  UI.LineItem #Resultados: [
    { Value: parametro_ID, Label: 'Parámetro' },
    { Value: parametro.unidadMedida, Label: 'Unidad' },
    { Value: valorObtenido, Label: 'Valor Obtenido' },
    { Value: cumple, Label: 'Cumple', Criticality: criticidad },
    { Value: observacion, Label: 'Observación' }
  ],

  UI.HeaderInfo: { TypeName: 'Resultado', TypeNamePlural: 'Resultados', Title: { Value: parametro.descripcion } },
  UI.Facets: [{ $Type: 'UI.ReferenceFacet', Label: 'Resultado', Target: '@UI.FieldGroup#Resultado' }],
  UI.FieldGroup #Resultado: { Data: [ /* mismos 5 campos */ ] }
);

annotate service.ResultadosInspeccion with {
  parametro
    @title: 'Parámetro'
    @Common.Text: parametro.descripcion
    @Common.TextArrangement: #TextFirst;
  valorObtenido @title: 'Valor Obtenido';
  cumple        @title: 'Cumple';
  observacion   @title: 'Observación';
  criticidad    @UI.Hidden;
  inspeccion    @UI.Hidden;
};
```

El calificador `#Resultados` en `UI.LineItem #Resultados` es lo que
conecta esta tabla con el `Target: 'resultados/@UI.LineItem#Resultados'`
del `UI.Facets` de `Inspecciones` visto arriba — sin el calificador, no
habría forma de distinguir esta anotación de un eventual `UI.LineItem`
por defecto. `cumple` con `Criticality: criticidad` colorea la celda
según el campo calculado por
`this.after('READ', ResultadosInspeccion, ...)` (capítulo 04) — ese
`cumple` recalcula contra el rango del material, **no** confía
ciegamente en el `cumpleVisual` capturado por el inspector, así que el
supervisor ve una evaluación independiente. `#TextFirst` (en vez del
`#TextOnly` usado en otros campos) muestra la descripción del parámetro
seguida de su código entre paréntesis.

---

## Decisión y textos de Lotes

```cds
annotate service.DecisionLote with @(
  UI.FieldGroup #Decision: {
    Data: [
      { Value: decision_code, Label: 'Decisión' },
      { Value: justificacion, Label: 'Justificación' },
      { Value: createdBy, Label: 'Decidido por' },
      { Value: createdAt, Label: 'Fecha de decisión' }
    ]
  }
) {
  decision
    @title: 'Decisión'
    @Common.Text: decision.name
    @Common.TextArrangement: #TextOnly;
  inspeccion @UI.Hidden;
};
```

`createdBy`/`createdAt` — vienen del aspecto `managed` del schema
(capítulo 02): quién y cuándo se tomó la decisión, sin ningún código
adicional, porque CAP los llena automáticamente al hacer el `INSERT` en
el handler.

```cds
annotate service.Lotes with {
  status
    @title: 'Status Lote'
    @Common.Text: status.name
    @Common.TextArrangement: #TextOnly;
  material        @Common.Text: material.descripcion @Common.TextArrangement: #TextOnly;
  lineaProduccion @Common.Text: lineaProduccion.descripcion @Common.TextArrangement: #TextOnly;
  turno           @Common.Text: turno.name @Common.TextArrangement: #TextOnly;
};

annotate service.Inspecciones with {
  criticidadDecision @UI.Hidden;
};
```

Textos legibles (`@Common.Text` + `#TextOnly`) para todas las
asociaciones de `Lotes` reutilizadas en el `FieldGroup #Lote` visto
arriba. `criticidadDecision @UI.Hidden` — solo alimenta el `Criticality`
de la columna Decisión del List Report; nunca se muestra como campo
propio.

---

## manifest.json — lo no genérico

| Clave | Valor | Por qué |
|---|---|---|
| `sap.app.id` | `lote.inspector.app.qmsupervisor` | Namespace técnico único, usado también en `Component.js` y como base del nombre del módulo `html5` en `mta.yaml` (`loteinspectorappqmsupervisor`, capítulo 07). |
| `sap.app.dataSources.mainService.uri` | `/supervisor/` | Coincide con `@path: '/supervisor'` de `supervisor-service.cds`; OData v4. |
| `sap.app.crossNavigation.inbounds` | `LoteDecision-approve` (Semantic Object `LoteDecision`, acción `approve`) | El intent de navegación con el que el tile del launchpad/Work Zone abre esta app. |
| `sap.cloud.service` | `lote.inspector` | Idéntico en las cinco apps y en el `mta.yaml` — agrupa todos los módulos del mismo proyecto bajo un solo "cloud service", evitando la colisión entre proyectos distintos del mismo subaccount (capítulo 09, lección 2). |
| `sap.ui5.routing` | 3 rutas/targets: `InspeccionesList`, `InspeccionesObjectPage`, `ResultadosInspeccionObjectPage` (anidado, `contextPath: /Inspecciones/resultados`) | `editableHeaderContent: false` en ambos Object Page — coherente con una app que solo lee y actúa vía botones, nunca edita campos sueltos. |
| `sap.fe.app.enableLazyLoading` | `true` | El Fiori Generator lo deja en `false` por defecto; se ajusta a mano (ver `recursos-md/README.md`, paso 12, para la guía genérica). |
| `sap.fiori.archeType` | `transactional` | Clasificación estándar del arquetipo de la app. |

---

## xs-app.json

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/supervisor/(.*)$",
      "target": "/supervisor/$1",
      "destination": "quality-managment-srv-api",
      "authenticationType": "xsuaa",
      "csrfProtection": true
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    }
  ]
}
```

Nota el `source: "^/supervisor/(.*)$"` — a diferencia del patrón genérico
`/odata/(.*)$` de una app CAP típica, cada app de este proyecto enruta
directamente el prefijo propio de su servicio (`/supervisor`, `/inspector`,
`/config`, `/reports`), porque cada servicio CDS ya declara su propio
`@path` explícito (capítulo 03). El `destination` (`quality-managment-
srv-api`) es idéntico en las cinco apps y coincide con el `Name` definido
en `mta.yaml` (capítulo 07). La segunda ruta (catch-all) sirve los
recursos estáticos propios de la app desde el HTML5 Application
Repository ya desplegado.

---

## Resumen / checklist

- [ ] Un servicio "solo lectura + acciones" no necesita
      `Capabilities.*Restrictions` — basta con que el `.cds` no otorgue
      `CREATE`/`UPDATE`/`DELETE` en su `@restrict`.
- [ ] `Core.OperationAvailable` sobre un campo calculado como
      `pendienteDecision` habilita/deshabilita el botón de una acción
      bound en la UI, reflejando (no reemplazando) la regla real del
      backend.
- [ ] `Common.SideEffects` en una acción bound refresca campos y
      entidades relacionadas tras ejecutarla — imprescindible cuando la
      acción cambia estado en varias entidades a la vez (`decision` y
      `lote`, en este caso).
- [ ] `@Common.FilterDefaultValue` preselecciona un filtro al abrir la
      lista — útil cuando el usuario casi siempre busca el mismo
      subconjunto de datos.
- [ ] El calificador `#Nombre` en `UI.LineItem`/`UI.FieldGroup` es lo que
      conecta una anotación con el `Target` de un `UI.Facets` que navega
      por composición.
