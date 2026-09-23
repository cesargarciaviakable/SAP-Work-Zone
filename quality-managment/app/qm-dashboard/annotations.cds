using ReportsService as service from '../../srv/reports-service';

// The dashboard is a List Report with one tab per view (see manifest
// "views.paths"). Each tab is driven by a SelectionPresentationVariant;
// chart tabs need the Aggregation/Analytics annotations below.


// ═════════════════════════════════════════════════════════════
// TAB 1 — LOTES CON DECISIÓN (table)
// ═════════════════════════════════════════════════════════════

annotate service.LotesConDecision with @(
  UI.SelectionFields: [
    decision,
    material,
    linea,
    turno,
    fechaProduccion
  ],

  UI.LineItem: [
    { Value: numeroLote, Label: 'No. Lote' },
    { Value: material, Label: 'Material' },
    { Value: linea, Label: 'Línea' },
    { Value: turno, Label: 'Turno' },
    { Value: fechaProduccion, Label: 'Fecha Producción' },
    { Value: cantidad, Label: 'Cantidad' },
    { Value: decision, Label: 'Decisión' },
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

  UI.HeaderInfo: {
    TypeName: 'Lote',
    TypeNamePlural: 'Lotes',
    Title: { Value: numeroLote },
    Description: { Value: material }
  },

  UI.Facets: [
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Lote',
      Target: '@UI.FieldGroup#Lote'
    },
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Decisión',
      Target: '@UI.FieldGroup#Decision'
    }
  ],

  UI.FieldGroup #Lote: {
    Data: [
      { Value: numeroLote, Label: 'No. Lote' },
      { Value: material, Label: 'Material' },
      { Value: linea, Label: 'Línea' },
      { Value: turno, Label: 'Turno' },
      { Value: fechaProduccion, Label: 'Fecha Producción' },
      { Value: cantidad, Label: 'Cantidad' },
      { Value: statusLote, Label: 'Status Lote' }
    ]
  },

  UI.FieldGroup #Decision: {
    Data: [
      { Value: decision, Label: 'Decisión' },
      { Value: justificacion, Label: 'Justificación' },
      { Value: aprobadorPor, Label: 'Decidido por' },
      { Value: fechaDecision, Label: 'Fecha Decisión' }
    ]
  }
) {
  numeroLote      @title: 'No. Lote';
  material        @title: 'Material';
  linea           @title: 'Línea';
  turno           @title: 'Turno';
  fechaProduccion @title: 'Fecha Producción';
  cantidad        @title: 'Cantidad';
  statusLote      @title: 'Status Lote';
  decision        @title: 'Decisión';
  justificacion   @title: 'Justificación' @UI.MultiLineText;
  aprobadorPor    @title: 'Decidido por';
  fechaDecision   @title: 'Fecha Decisión';
};


// ═════════════════════════════════════════════════════════════
// TAB 2 — LOTES POR STATUS (donut chart)
// ═════════════════════════════════════════════════════════════

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
    PresentationVariant: {
      Visualizations: [ '@UI.Chart#Status' ]
    }
  }
) {
  status @title: 'Código status';
  nombre @title: 'Status';
  total  @title: 'Lotes';
};


// ═════════════════════════════════════════════════════════════
// TAB 3 — RENDIMIENTO POR LÍNEA (table + bullet microchart KPI, target 80%)
// ═════════════════════════════════════════════════════════════

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
      {
        Measure: porcentajeAprobacion,
        Role: #Axis1,
        DataPoint: '@UI.DataPoint#Aprobacion'
      }
    ]
  },

  UI.LineItem #Rendimiento: [
    { Value: linea, Label: 'Línea' },
    { Value: totalLotes, Label: 'Total Lotes' },
    { Value: aprobados, Label: 'Aprobados' },
    { Value: conDesviacion, Label: 'Con Desviación' },
    { Value: rechazados, Label: 'Rechazados' },
    {
      $Type: 'UI.DataFieldForAnnotation',
      Target: '@UI.Chart#Aprobacion',
      Label: '% Aprobación'
    }
  ],

  UI.SelectionPresentationVariant #Rendimiento: {
    Text: 'Rendimiento por línea',
    SelectionVariant: { SelectOptions: [] },
    PresentationVariant: {
      SortOrder: [ { Property: porcentajeAprobacion, Descending: true } ],
      Visualizations: [ '@UI.LineItem#Rendimiento' ]
    }
  }
) {
  codigoLinea          @title: 'Código Línea';
  linea                @title: 'Línea';
  totalLotes           @title: 'Total Lotes';
  aprobados            @title: 'Aprobados';
  rechazados           @title: 'Rechazados';
  conDesviacion        @title: 'Con Desviación';
  porcentajeAprobacion @title: '% Aprobación' @Measures.Unit: '%';
  criticidadAprobacion @UI.Hidden;
};


// ═════════════════════════════════════════════════════════════
// TAB 4 — PARÁMETROS CON FALLAS (bar chart)
// ═════════════════════════════════════════════════════════════

annotate service.ParametrosFallidos with @(
  Aggregation.ApplySupported: {
    Transformations: [ 'aggregate', 'groupby', 'filter', 'orderby', 'top', 'skip' ],
    GroupableProperties: [ codigoParametro, parametro, unidadMedida ],
    AggregatableProperties: [
      { Property: totalFallas },
      { Property: totalMediciones }
    ]
  },

  Analytics.AggregatedProperty #fallas: {
    Name: 'fallas',
    AggregationMethod: 'sum',
    AggregatableProperty: totalFallas,
    ![@Common.Label]: 'Fallas'
  },

  Analytics.AggregatedProperty #mediciones: {
    Name: 'mediciones',
    AggregationMethod: 'sum',
    AggregatableProperty: totalMediciones,
    ![@Common.Label]: 'Mediciones'
  },

  UI.Chart #Fallas: {
    Title: 'Parámetros con fallas',
    ChartType: #Bar,
    Dimensions: [ parametro ],
    DimensionAttributes: [ { Dimension: parametro, Role: #Category } ],
    DynamicMeasures: [
      '@Analytics.AggregatedProperty#fallas',
      '@Analytics.AggregatedProperty#mediciones'
    ],
    MeasureAttributes: [
      { DynamicMeasure: '@Analytics.AggregatedProperty#fallas', Role: #Axis1 },
      { DynamicMeasure: '@Analytics.AggregatedProperty#mediciones', Role: #Axis1 }
    ]
  },

  UI.SelectionPresentationVariant #Fallas: {
    Text: 'Parámetros con fallas',
    SelectionVariant: { SelectOptions: [] },
    PresentationVariant: {
      Visualizations: [ '@UI.Chart#Fallas' ]
    }
  }
) {
  codigoParametro @title: 'Código';
  parametro       @title: 'Parámetro';
  unidadMedida    @title: 'Unidad';
  totalMediciones @title: 'Mediciones';
  totalFallas     @title: 'Fallas';
};
