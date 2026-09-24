using InspectorService as service from '../../srv/inspector-service';


// ═════════════════════════════════════════════════════════════
// DRAFT
// ═════════════════════════════════════════════════════════════

annotate service.Lotes with @odata.draft.enabled;

// Hide Edit/Delete on closed lotes instead of failing with 403
annotate service.Lotes with @(
  UI.UpdateHidden: edicionOculta,
  UI.DeleteHidden: edicionOculta
) {
  edicionOculta @UI.Hidden;
};


// ═════════════════════════════════════════════════════════════
// VALUE LISTS
// ═════════════════════════════════════════════════════════════

annotate service.Lotes with {

  material @Common.Text: material.descripcion @Common.TextArrangement: #TextOnly @Common.ValueList: {
    CollectionPath: 'Materiales',
    SearchSupported: true,
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: material_ID,
        ValueListProperty: 'ID'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'codigo'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'descripcion'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'unidad'
      }
    ]
  };

  lineaProduccion @Common.Text: lineaProduccion.descripcion @Common.TextArrangement: #TextOnly @Common.ValueList: {
    CollectionPath: 'LineasProduccion',
    SearchSupported: true,
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: lineaProduccion_ID,
        ValueListProperty: 'ID'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'codigo'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'descripcion'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'planta'
      }
    ]
  };

  turno @Common.Text: turno.name @Common.TextArrangement: #TextFirst @Common.ValueListWithFixedValues @Common.ValueList: {
    CollectionPath: 'Turnos',
    SearchSupported: true,
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: turno_code,
        ValueListProperty: 'code'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'name'
      }
    ]
  };
};


// ═════════════════════════════════════════════════════════════
// LOTES — LIST REPORT
// ═════════════════════════════════════════════════════════════

annotate service.Lotes with @(
  UI.SelectionFields: [
    status_code,
    material_ID,
    lineaProduccion_ID,
    turno_code,
    fechaProduccion
  ],

  UI.LineItem: [
    {
      Value: numeroLote,
      Label: 'No. Lote'
    },
    {
      Value: material_ID,
      Label: 'Material'
    },
    {
      Value: lineaProduccion_ID,
      Label: 'Línea'
    },
    {
      Value: turno_code,
      Label: 'Turno'
    },
    {
      Value: cantidad,
      Label: 'Cantidad'
    },
    {
      Value: unidad,
      Label: 'Unidad'
    },
    {
      Value: fechaProduccion,
      Label: 'Fecha Producción'
    },
    {
      Value: status_code,
      Label: 'Status'
    }
  ]
);


// ═════════════════════════════════════════════════════════════
// LOTES — OBJECT PAGE
// ═════════════════════════════════════════════════════════════

annotate service.Lotes with @(
  UI.HeaderInfo: {
    TypeName: 'Lote',
    TypeNamePlural: 'Lotes',

    Title: {
      Value: numeroLote
    },

    Description: {
      Value: material.descripcion
    }
  },

  UI.Facets: [
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Información General',
      Target: '@UI.FieldGroup#General'
    },

    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Inspecciones',
      Target: 'inspecciones/@UI.LineItem#Inspecciones'
    }
  ],

  UI.FieldGroup#General: {
    Data: [
      {
        Value: numeroLote,
        Label: 'No. Lote'
      },

      {
        Value: material_ID,
        Label: 'Material'
      },

      {
        Value: lineaProduccion_ID,
        Label: 'Línea'
      },

      {
        Value: turno_code,
        Label: 'Turno'
      },

      {
        Value: fechaProduccion,
        Label: 'Fecha Producción'
      },

      {
        Value: cantidad,
        Label: 'Cantidad'
      },

      {
        Value: unidad,
        Label: 'Unidad'
      },

      {
        Value: status_code,
        Label: 'Status'
      },

      {
        Value: observaciones,
        Label: 'Observaciones'
      }
    ]
  }
);


// ═════════════════════════════════════════════════════════════
// LOTES — PROPIEDADES
// ═════════════════════════════════════════════════════════════

annotate service.Lotes with {

  numeroLote
    @title: 'No. Lote'
    @mandatory;

  cantidad
    @title: 'Cantidad'
    @mandatory;

  fechaProduccion
    @title: 'Fecha de Producción'
    @mandatory;

  unidad
    @title: 'Unidad'
    @readonly;

  observaciones
    @title: 'Observaciones'
    @UI.MultiLineText;

  status
    @title: 'Status'
    @readonly
    @Common.Text: status.name
    @Common.TextArrangement: #TextOnly
    @Common.ValueListWithFixedValues
    @Common.ValueList: {
      CollectionPath: 'StatusLote',
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

  material
    @title: 'Material'
    @mandatory;

  lineaProduccion
    @title: 'Línea de Producción'
    @mandatory;

  turno
    @title: 'Turno';
};


// ═════════════════════════════════════════════════════════════
// INSPECCIONES
// ═════════════════════════════════════════════════════════════

annotate service.Inspecciones with @(
  UI.LineItem#Inspecciones: [
    {
      Value: fechaInspeccion,
      Label: 'Fecha Inspección'
    },

    {
      Value: status_code,
      Label: 'Status'
    },

    {
      Value: observaciones,
      Label: 'Observaciones'
    },

    {
      $Type: 'UI.DataFieldForAction',
      Label: 'Completar Inspección',
      Action: 'InspectorService.completarInspeccion'
    }
  ],

  UI.Identification: [
    {
      $Type: 'UI.DataFieldForAction',
      Label: 'Completar Inspección',
      Action: 'InspectorService.completarInspeccion'
    }
  ],

  UI.HeaderInfo: {
    TypeName: 'Inspección',
    TypeNamePlural: 'Inspecciones',

    Title: {
      Value: fechaInspeccion
    },

    Description: {
      Value: status_code
    }
  },

  UI.Facets: [
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Detalle',
      Target: '@UI.FieldGroup#InspeccionDetalle'
    },

    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Resultados',
      Target: 'resultados/@UI.LineItem#Resultados'
    }
  ],

  UI.FieldGroup#InspeccionDetalle: {
    Data: [
      {
        Value: fechaInspeccion,
        Label: 'Fecha'
      },

      {
        Value: status_code,
        Label: 'Status'
      },

      {
        Value: observaciones,
        Label: 'Observaciones'
      }
    ]
  }
);


annotate service.Inspecciones with {

  fechaInspeccion
    @title: 'Fecha de Inspección'
    @mandatory;

  observaciones
    @title: 'Observaciones'
    @UI.MultiLineText;

  status
    @title: 'Status'
    @readonly
    @Common.Text: status.name
    @Common.TextArrangement: #TextOnly;

  lote
    @UI.Hidden;
};


// ═════════════════════════════════════════════════════════════
// RESULTADOS
// ═════════════════════════════════════════════════════════════

annotate service.ResultadosInspeccion with {

  parametro @Common.Text: parametro.descripcion @Common.TextArrangement: #TextFirst @Common.ValueList: {
    CollectionPath: 'Parametros',
    SearchSupported: true,

    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: parametro_ID,
        ValueListProperty: 'ID'
      },

      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'codigo'
      },

      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'descripcion'
      },

      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'tipoParametro_code'
      },

      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'unidadMedida'
      }
    ]
  };

  valorObtenido
    @title: 'Valor Obtenido';

  cumpleVisual
    @title: 'Cumple';

  observacion
    @title: 'Observación'
    @UI.MultiLineText;

  esVisual            @UI.Hidden;
  criticidad          @UI.Hidden;
  controlValorObtenido @UI.Hidden;
  controlCumpleVisual  @UI.Hidden;
};


// ═════════════════════════════════════════════════════════════
// RESULTADOS — LISTA
// ═════════════════════════════════════════════════════════════

annotate service.ResultadosInspeccion with @(
  UI.LineItem#Resultados: [

    {
      Value: parametro_ID,
      Label: 'Parámetro'
    },

    {
      Value: parametro.unidadMedida,
      Label: 'Unidad'
    },

    {
      Value: valorObtenido,
      Label: 'Valor Obtenido'
    },

    {
      Value: cumpleVisual,
      Label: 'Cumple',
      Criticality: criticidad,
      CriticalityRepresentation: #WithIcon
    },

    {
      Value: observacion,
      Label: 'Observación'
    }
  ],

  UI.Facets: [
    {
      $Type: 'UI.ReferenceFacet',
      Label: 'Resultado',
      Target: '@UI.FieldGroup#ResultadoDetalle'
    }
  ],

  UI.FieldGroup#ResultadoDetalle: {

    Data: [

      {
        Value: parametro_ID,
        Label: 'Parámetro'
      },

      {
        Value: parametro.unidadMedida,
        Label: 'Unidad'
      },

      {
        Value: valorObtenido,
        Label: 'Valor Obtenido'
      },

      {
        Value: cumpleVisual,
        Label: 'Cumple',
        Criticality: criticidad,
        CriticalityRepresentation: #WithIcon
      },

      {
        Value: observacion,
        Label: 'Observación'
      }
    ]
  }
);


annotate service.ResultadosInspeccion with {

  parametro
    @title: 'Parámetro'
    @mandatory;

  inspeccion
    @UI.Hidden;
};

// ═════════════════════════════════════════════════════════════
// ACTIONS & SIDE EFFECTS
// ═════════════════════════════════════════════════════════════

annotate service.Inspecciones actions {
  completarInspeccion @(
    Core.OperationAvailable: {
      $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'ABIERTA' ] }
    },
    Common.SideEffects: {
      TargetProperties: [ 'in/status_code' ]
    }
  );
};

// cumpleVisual, and the derived field-control/criticality columns, are
// recalculated by the backend when any of these change
annotate service.ResultadosInspeccion with @(
  Common.SideEffects #Cumple: {
    SourceProperties: [ valorObtenido, parametro_ID, cumpleVisual ],
    TargetProperties: [ 'cumpleVisual', 'esVisual', 'controlValorObtenido', 'controlCumpleVisual', 'criticidad' ]
  }
);

// Material changes the unit shown in the draft once saved
annotate service.Lotes with @(
  Common.SideEffects #Material: {
    SourceProperties: [ material_ID ],
    TargetProperties: [ 'unidad' ]
  }
);


// ═════════════════════════════════════════════════════════════
// INSPECCIONES CERRADAS — READ ONLY
// Only ABIERTA inspections (and their resultados) are editable.
// The backend enforces the same rule on draft edit and on save.
// ═════════════════════════════════════════════════════════════

annotate service.Inspecciones with @(
  Capabilities.DeleteRestrictions: { Deletable: esEditable },
  Capabilities.NavigationRestrictions: {
    RestrictedProperties: [
      {
        NavigationProperty: resultados,
        InsertRestrictions: { Insertable: esEditable }
      }
    ]
  }
) {
  fechaInspeccion @Common.FieldControl: controlObligatorio;
  observaciones   @Common.FieldControl: controlCampo;
  esEditable      @UI.Hidden;
  controlCampo    @UI.Hidden;
  controlObligatorio @UI.Hidden;
};

annotate service.ResultadosInspeccion with @(
  Capabilities.DeleteRestrictions: { Deletable: inspeccion.esEditable }
) {
  parametro     @Common.FieldControl: inspeccion.controlObligatorio;
  // valorObtenido/cumpleVisual: locked while the inspección is not ABIERTA,
  // and additionally: read-only valorObtenido for VISUAL params, read-only
  // cumpleVisual (shown as a criticality icon instead) for numeric params
  valorObtenido @Common.FieldControl: controlValorObtenido;
  cumpleVisual  @Common.FieldControl: controlCumpleVisual;
  observacion   @Common.FieldControl: inspeccion.controlCampo;
};
