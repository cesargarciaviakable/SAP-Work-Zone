# 5. Anotaciones — qm-dashboard

**Qué vas a aprender**: cómo se construye un List Report con **varias
pestañas de visualización distinta** (tabla, donut, tabla+bullet
chart, bar chart) sobre las vistas analíticas de `ReportsService`, con
`Aggregation.ApplySupported`, `Analytics.AggregatedProperty` y
`UI.Chart` — vocabularios que no aparecen en ninguna de las otras
cuatro apps.

Servicio: `ReportsService` (`srv/reports-service.cds`, `@path:
'/reports'`, `@requires: ['Inspector', 'SupervisorCalidad',
'Administrador']` — accesible por los tres roles). Archivo:
`app/qm-dashboard/annotations.cds` (256 líneas).

El comentario al inicio del archivo resume el diseño:

```cds
// The dashboard is a List Report with one tab per view (see manifest
// "views.paths"). Each tab is driven by a SelectionPresentationVariant;
// chart tabs need the Aggregation/Analytics annotations below.
```

Es **una sola** página List Report (no cuatro apps separadas): las
cuatro pestañas son cuatro `EntitySet` distintos del mismo servicio,
seleccionados vía `manifest.json` → `views.paths` (ver más abajo), y
cada uno tiene su propio `UI.SelectionPresentationVariant`.

---

## Tab 1 — Lotes con decisión (tabla simple)

```cds
annotate service.LotesConDecision with @(
  UI.SelectionFields: [ decision, material, linea, turno, fechaProduccion ],

  UI.LineItem: [
    { Value: numeroLote, Label: 'No. Lote' },
    { Value: material,   Label: 'Material' },
    { Value: linea,      Label: 'Línea' },
    { Value: turno,      Label: 'Turno' },
    { Value: fechaProduccion, Label: 'Fecha Producción' },
    { Value: cantidad,   Label: 'Cantidad' },
    { Value: decision,   Label: 'Decisión' },
    { Value: aprobadorPor, Label: 'Decidido por' },
    { Value: fechaDecision, Label: 'Fecha Decisión' }
  ],

  UI.SelectionPresentationVariant #Decisiones: {
    Text: 'Lotes con decisión',
    SelectionVariant: { SelectOptions: [] },
    PresentationVariant: {
      SortOrder: [ { Property: fechaDecision, Descending: true } ],
      Visualizations: [ '@UI.LineItem' ]
    }
  },
  ...
);
```

`LotesConDecision` es la vista aplanada de `reports-service.cds`
(capítulo 3) que ya navega tres niveles de asociación
(`inspeccion.lote.material.descripcion`, etc.) — acá se usa como si
fuera una tabla plana normal, sin necesidad de repetir esas rutas.
`UI.SelectionPresentationVariant #Decisiones` combina un filtro
(`SelectionVariant`, vacío = todos por defecto) con una presentación
(`PresentationVariant`: orden + qué visualización usar —
`'@UI.LineItem'` para esta pestaña, tabla simple).

## Tab 2 — Lotes por status (donut chart)

```cds
annotate service.ResumenLotesPorStatus with @(
  Aggregation.ApplySupported: {
    Transformations: [ 'aggregate', 'groupby', 'filter', 'orderby', 'top', 'skip' ],
    GroupableProperties: [ status, nombre ],
    AggregatableProperties: [ { Property: total } ]
  },

  Analytics.AggregatedProperty #totalLotes: {
    Name: 'totalLotes',
    AggregationMethod: 'sum',
    AggregatableProperty: total,
    ![@Common.Label]: 'Lotes'
  },

  UI.Chart #Status: {
    Title: 'Lotes por status',
    ChartType: #Donut,
    Dimensions: [ nombre ],
    DimensionAttributes: [ { Dimension: nombre, Role: #Category } ],
    DynamicMeasures: [ '@Analytics.AggregatedProperty#totalLotes' ],
    MeasureAttributes: [
      { DynamicMeasure: '@Analytics.AggregatedProperty#totalLotes', Role: #Axis1 }
    ]
  },

  UI.SelectionPresentationVariant #Status: {
    Text: 'Lotes por status',
    SelectionVariant: { SelectOptions: [] },
    PresentationVariant: { Visualizations: [ '@UI.Chart#Status' ] }
  }
);
```

Primera pestaña con gráfico. Tres piezas que siempre van juntas para
un chart en Fiori Elements:

1. **`Aggregation.ApplySupported`**: le dice al framework qué
   transformaciones OData `$apply` soporta la entidad —
   `GroupableProperties` (por qué campos se puede agrupar, acá
   `status` y `nombre`) y `AggregatableProperties` (qué campos se
   pueden sumar/promediar, acá `total`).
2. **`Analytics.AggregatedProperty`**: define una medida con nombre
   (`totalLotes`), qué función de agregación usa (`sum`), sobre qué
   propiedad (`total`) y su label (`![@Common.Label]`, con la sintaxis
   `![...]` porque el nombre empieza con `@`).
3. **`UI.Chart`**: el gráfico en sí — `ChartType: #Donut`,
   `Dimensions` (el eje categórico, acá `nombre` = el nombre del
   status), y `DynamicMeasures` apuntando a la medida agregada
   definida en el paso 2.

`ResumenLotesPorStatus` ya viene agrupada por status desde el propio
`.cds` (`group by status.code, status.name`, capítulo 3) — la
agregación de la anotación es sobre esa vista ya agrupada, para que el
framework pueda seguir aplicando `$apply` de forma consistente con el
resto de las capacidades de Fiori Elements (filtros, variantes).

## Tab 3 — Rendimiento por línea (tabla + microchart bullet, meta 80%)

```cds
annotate service.RendimientoPorLinea with @(
  UI.DataPoint #Aprobacion: {
    Value: porcentajeAprobacion,
    TargetValue: 80,
    MinimumValue: 0,
    MaximumValue: 100,
    Title: '% Aprobación',
    Criticality: criticidadAprobacion
  },

  UI.Chart #Aprobacion: {
    Title: '% Aprobación',
    ChartType: #Bullet,
    Measures: [ porcentajeAprobacion ],
    MeasureAttributes: [
      { Measure: porcentajeAprobacion, Role: #Axis1, DataPoint: '@UI.DataPoint#Aprobacion' }
    ]
  },

  UI.LineItem #Rendimiento: [
    { Value: linea,          Label: 'Línea' },
    { Value: totalLotes,     Label: 'Total Lotes' },
    { Value: aprobados,      Label: 'Aprobados' },
    { Value: conDesviacion,  Label: 'Con Desviación' },
    { Value: rechazados,     Label: 'Rechazados' },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.Chart#Aprobacion', Label: '% Aprobación' }
  ],

  UI.SelectionPresentationVariant #Rendimiento: {
    Text: 'Rendimiento por línea',
    SelectionVariant: { SelectOptions: [] },
    PresentationVariant: {
      SortOrder: [ { Property: porcentajeAprobacion, Descending: true } ],
      Visualizations: [ '@UI.LineItem#Rendimiento' ]
    }
  }
);
```

Esta pestaña combina tabla **y** microchart en la misma vista:
`UI.DataPoint #Aprobacion` define el KPI (valor, meta `TargetValue:
80`, rango `0`-`100`, y su criticidad — la misma columna
`criticidadAprobacion` calculada con los mismos umbrales 80%/50% en el
`.cds`, capítulo 3). `UI.Chart #Aprobacion` con `ChartType: #Bullet`
referencia ese mismo `DataPoint` para dibujar la barra tipo "bala" con
la meta marcada. Y dentro del `LineItem` de la tabla, la última
columna es un `UI.DataFieldForAnnotation` que **apunta al chart**
(`Target: '@UI.Chart#Aprobacion'`) en vez de a un campo — así cada
fila de la tabla muestra su propio mini-gráfico de barra bullet en la
celda, comparando el % de aprobación de esa línea contra la meta de
80%.

## Tab 4 — Parámetros con fallas (bar chart, dos medidas)

```cds
annotate service.ParametrosFallidos with @(
  Aggregation.ApplySupported: {
    Transformations: [ 'aggregate', 'groupby', 'filter', 'orderby', 'top', 'skip' ],
    GroupableProperties: [ codigoParametro, parametro, unidadMedida ],
    AggregatableProperties: [ { Property: totalFallas }, { Property: totalMediciones } ]
  },

  Analytics.AggregatedProperty #fallas:     { Name: 'fallas',     AggregationMethod: 'sum', AggregatableProperty: totalFallas,     ![@Common.Label]: 'Fallas' },
  Analytics.AggregatedProperty #mediciones: { Name: 'mediciones', AggregationMethod: 'sum', AggregatableProperty: totalMediciones, ![@Common.Label]: 'Mediciones' },

  UI.Chart #Fallas: {
    Title: 'Parámetros con fallas',
    ChartType: #Bar,
    Dimensions: [ parametro ],
    DimensionAttributes: [ { Dimension: parametro, Role: #Category } ],
    DynamicMeasures: [ '@Analytics.AggregatedProperty#fallas', '@Analytics.AggregatedProperty#mediciones' ],
    MeasureAttributes: [
      { DynamicMeasure: '@Analytics.AggregatedProperty#fallas',     Role: #Axis1 },
      { DynamicMeasure: '@Analytics.AggregatedProperty#mediciones', Role: #Axis1 }
    ]
  },

  UI.SelectionPresentationVariant #Fallas: {
    Text: 'Parámetros con fallas',
    SelectionVariant: { SelectOptions: [] },
    PresentationVariant: { Visualizations: [ '@UI.Chart#Fallas' ] }
  }
);
```

Mismo patrón que el Tab 2, pero con **dos** `Analytics.AggregatedProperty`
(`fallas` y `mediciones`) mostradas juntas en el mismo `ChartType:
#Bar` — dos series (fallas totales vs. mediciones totales) por cada
parámetro en el eje de categorías, para comparar de un vistazo qué
proporción de las mediciones de un parámetro terminan fallando.

---

## `manifest.json` — `views.paths`, la pieza que une todo

Este es el archivo donde vale la pena mirar `sap.ui5.routing.targets`
completo, porque es distinto de las otras cuatro apps:

```json
"views": {
  "paths": [
    { "key": "decisiones", "annotationPath": "com.sap.vocabularies.UI.v1.SelectionPresentationVariant#Decisiones" },
    { "key": "status",       "entitySet": "ResumenLotesPorStatus",  "annotationPath": "com.sap.vocabularies.UI.v1.SelectionPresentationVariant#Status" },
    { "key": "rendimiento",  "entitySet": "RendimientoPorLinea",    "annotationPath": "com.sap.vocabularies.UI.v1.SelectionPresentationVariant#Rendimiento" },
    { "key": "fallas",       "entitySet": "ParametrosFallidos",     "annotationPath": "com.sap.vocabularies.UI.v1.SelectionPresentationVariant#Fallas" }
  ],
  "showCounts": false
}
```

Cada entrada de `views.paths` es una pestaña del List Report. La
primera (`decisiones`) no especifica `entitySet` porque usa el
`contextPath` por defecto de la página (`/LotesConDecision`); las
otras tres sí especifican su propio `entitySet`, porque cada pestaña
consulta una entidad OData **distinta** (`ResumenLotesPorStatus`,
`RendimientoPorLinea`, `ParametrosFallidos`) — todas dentro del mismo
servicio `ReportsService`, pero cada una es su propia vista SQL del
`.cds` (capítulo 3). `annotationPath` conecta cada pestaña con el
`UI.SelectionPresentationVariant` nombrado correspondiente que
acabamos de ver arriba. `showCounts: false` oculta el contador de
registros en cada pestaña (no tiene mucho sentido para un donut o un
bar chart).

Otros puntos no genéricos:

- `sap.app.dataSources.mainService.uri: "/reports/"`.
- `crossNavigation.inbounds["LoteReporte-display"]`:
  `semanticObject: "LoteReporte"`, `action: "display"` (tercer par
  distinto, siguiendo la regla de la Lección 2).
- `sap.ui5.dependencies.libs` agrega dos librerías que las otras apps
  no necesitan:
  ```json
  "sap.viz": {},
  "sap.suite.ui.microchart": { "lazy": true }
  ```
  `sap.viz` es la librería de gráficos que usa `UI.Chart`;
  `sap.suite.ui.microchart` (cargada `lazy: true`, solo cuando se
  necesita) es la que dibuja el bullet chart embebido en cada fila del
  Tab 3.
- Solo hay dos rutas de navegación (`LotesConDecisionList` →
  `LotesConDecisionObjectPage`) — las otras tres pestañas son vistas
  analíticas de solo lectura sin Object Page propio; no tiene sentido
  navegar al "detalle" de una fila de un donut chart.

## `xs-app.json`

Mismo patrón, apuntando a `/reports/`:

```json
{
  "source": "^/reports/(.*)$",
  "target": "/reports/$1",
  "destination": "quality-managment-srv-api",
  "authenticationType": "xsuaa",
  "csrfProtection": true
}
```

---

## Resumen / checklist

- [ ] Un List Report con varias pestañas de fuentes distintas se arma en `manifest.json` con `views.paths`, cada entrada apuntando a su propio `entitySet` + `UI.SelectionPresentationVariant`.
- [ ] Todo gráfico necesita el trío `Aggregation.ApplySupported` + `Analytics.AggregatedProperty` + `UI.Chart` trabajando juntos.
- [ ] `UI.DataPoint` con `TargetValue`/`MinimumValue`/`MaximumValue`/`Criticality` alimenta tanto un microchart bullet como, potencialmente, un `DataFieldForAnnotation` embebido en una tabla.
- [ ] Un `UI.Chart` con dos `DynamicMeasures` dibuja dos series comparables en el mismo gráfico.
- [ ] Librerías de gráficos (`sap.viz`, `sap.suite.ui.microchart`) se agregan explícitamente en `sap.ui5.dependencies.libs` — no vienen por defecto.
