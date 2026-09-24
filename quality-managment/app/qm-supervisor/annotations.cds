using SupervisorService as service from '../../srv/supervisor-service';


// ═════════════════════════════════════════════════════════════
// INSPECCIONES — LIST REPORT
// ═════════════════════════════════════════════════════════════

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
    {
      Value: lote_ID,
      Label: 'Lote'
    },
    {
      Value: lote.material.descripcion,
      Label: 'Material'
    },
    {
      Value: lote.lineaProduccion.descripcion,
      Label: 'Línea'
    },
    {
      Value: fechaInspeccion,
      Label: 'Fecha Inspección'
    },
    {
      Value: status_code,
      Label: 'Status'
    },
    {
      Value: porcentajeCumplimiento,
      Label: '% Cumplimiento'
    },
    {
      Value: lote.status_code,
      Label: 'Status Lote'
    },
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


// ═════════════════════════════════════════════════════════════
// INSPECCIONES — OBJECT PAGE
// ═════════════════════════════════════════════════════════════

annotate service.Inspecciones with @(
  UI.HeaderInfo: {
    TypeName: 'Inspección',
    TypeNamePlural: 'Inspecciones',
    Title: { Value: lote.numeroLote },
    Description: { Value: lote.material.descripcion }
  },

  UI.HeaderFacets: [
    {
      $Type: 'UI.ReferenceFacet',
      Target: '@UI.DataPoint#Cumplimiento'
    },
    {
      $Type: 'UI.ReferenceFacet',
      Target: '@UI.DataPoint#Status'
    }
  ],

  UI.DataPoint #Cumplimiento: {
    Value: porcentajeCumplimiento,
    Title: '% Cumplimiento'
  },

  UI.DataPoint #Status: {
    Value: status_code,
    Title: 'Status'
  },

  UI.Identification: [
    {
      $Type: 'UI.DataFieldForAction',
      Label: 'Tomar Decisión',
      Action: 'SupervisorService.tomarDecision'
    },
    {
      $Type: 'UI.DataFieldForAction',
      Label: 'Regresar Inspección',
      Action: 'SupervisorService.regresarInspeccion'
    }
  ],

  UI.Facets: [
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Inspección',
      Target: '@UI.FieldGroup#Inspeccion'
    },
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Lote',
      Target: '@UI.FieldGroup#Lote'
    },
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Resultados',
      Target: 'resultados/@UI.LineItem#Resultados'
    },
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Decisión',
      Target: 'decision/@UI.FieldGroup#Decision'
    }
  ],

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


// ═════════════════════════════════════════════════════════════
// INSPECCIONES — PROPIEDADES
// ═════════════════════════════════════════════════════════════

annotate service.Inspecciones with {

  lote
    @title: 'Lote'
    @Common.Text: lote.numeroLote
    @Common.TextArrangement: #TextOnly
    @Common.ValueList: {
      CollectionPath: 'Lotes',
      SearchSupported: true,
      Parameters: [
        {
          $Type: 'Common.ValueListParameterInOut',
          LocalDataProperty: lote_ID,
          ValueListProperty: 'ID'
        },
        {
          $Type: 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'numeroLote'
        },
        {
          $Type: 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'fechaProduccion'
        },
        {
          $Type: 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'status_code'
        }
      ]
    };

  status
    @title: 'Status'
    @Common.Text: status.name
    @Common.TextArrangement: #TextOnly
    @Common.ValueListWithFixedValues
    @Common.FilterDefaultValue: 'COMPLETADA'
    @Common.ValueList: {
      CollectionPath: 'StatusInspeccion',
      Parameters: [
        {
          $Type: 'Common.ValueListParameterInOut',
          LocalDataProperty: status_code,
          ValueListProperty: 'code'
        },
        {
          $Type: 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'name'
        }
      ]
    };

  fechaInspeccion        @title: 'Fecha de Inspección';
  observaciones          @title: 'Observaciones' @UI.MultiLineText;
  totalParametros        @title: 'Parámetros medidos';
  parametrosCumplen      @title: 'Parámetros que cumplen';
  porcentajeCumplimiento @title: '% Cumplimiento' @Measures.Unit: '%';
  pendienteDecision      @UI.Hidden;
};


// ═════════════════════════════════════════════════════════════
// ACCIONES
// Only available for COMPLETADA inspections without a decision
// ═════════════════════════════════════════════════════════════

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
      @Common.ValueList: {
        CollectionPath: 'TiposDecision',
        Parameters: [
          {
            $Type: 'Common.ValueListParameterInOut',
            LocalDataProperty: decision,
            ValueListProperty: 'code'
          },
          {
            $Type: 'Common.ValueListParameterDisplayOnly',
            ValueListProperty: 'name'
          }
        ]
      },
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


// ═════════════════════════════════════════════════════════════
// RESULTADOS (read only)
// ═════════════════════════════════════════════════════════════

annotate service.ResultadosInspeccion with @(
  UI.LineItem #Resultados: [
    { Value: parametro_ID, Label: 'Parámetro' },
    { Value: parametro.unidadMedida, Label: 'Unidad' },
    { Value: valorObtenido, Label: 'Valor Obtenido' },
    { Value: cumple, Label: 'Cumple', Criticality: criticidad },
    { Value: observacion, Label: 'Observación' }
  ],

  UI.HeaderInfo: {
    TypeName: 'Resultado',
    TypeNamePlural: 'Resultados',
    Title: { Value: parametro.descripcion }
  },

  UI.Facets: [
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Resultado',
      Target: '@UI.FieldGroup#Resultado'
    }
  ],

  UI.FieldGroup #Resultado: {
    Data: [
      { Value: parametro_ID, Label: 'Parámetro' },
      { Value: parametro.unidadMedida, Label: 'Unidad' },
      { Value: valorObtenido, Label: 'Valor Obtenido' },
      { Value: cumple, Label: 'Cumple', Criticality: criticidad },
      { Value: observacion, Label: 'Observación' }
    ]
  }
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


// ═════════════════════════════════════════════════════════════
// DECISIÓN / LOTE — TEXTOS
// ═════════════════════════════════════════════════════════════

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
