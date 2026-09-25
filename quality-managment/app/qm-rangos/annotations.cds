using ConfigService as service from '../../srv/config-service';


// ═════════════════════════════════════════════════════════════
// MATERIALES — LIST REPORT
// ═════════════════════════════════════════════════════════════

// Materiales come from the master data: this app only maintains their
// acceptance ranges. Create and Delete are hidden here (and rejected
// server-side, see srv/config-service.cds / srv/handlers/config-service.js);
// Edit stays available to maintain ranges.
annotate service.Materiales with @(
  UI.CreateHidden: true,
  UI.DeleteHidden: true,
  Capabilities.InsertRestrictions.Insertable: false,
  Capabilities.DeleteRestrictions.Deletable: false
);

annotate service.Materiales with @(
  UI.SelectionFields: [
    codigo,
    activo
  ],

  UI.LineItem: [
    {
      Value: codigo,
      Label: 'Código'
    },
    {
      Value: descripcion,
      Label: 'Descripción'
    },
    {
      Value: unidad,
      Label: 'Unidad'
    },
    {
      Value: activo,
      Label: 'Activo'
    }
  ]
);


// ═════════════════════════════════════════════════════════════
// MATERIALES — OBJECT PAGE
// ═════════════════════════════════════════════════════════════

annotate service.Materiales with @(
  UI.HeaderInfo: {
    TypeName: 'Material',
    TypeNamePlural: 'Materiales',

    Title: {
      Value: descripcion
    },

    Description: {
      Value: codigo
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
      Label: 'Rangos de aceptación',
      Target: 'parametros/@UI.LineItem#Rangos'
    }
  ],

  UI.FieldGroup#General: {
    Data: [
      {
        Value: codigo,
        Label: 'Código'
      },
      {
        Value: descripcion,
        Label: 'Descripción'
      },
      {
        Value: unidad,
        Label: 'Unidad'
      },
      {
        Value: activo,
        Label: 'Activo'
      }
    ]
  }
);


// ═════════════════════════════════════════════════════════════
// MATERIALES — PROPIEDADES
// ═════════════════════════════════════════════════════════════

annotate service.Materiales with {

  codigo
    @title: 'Código'
    @mandatory;

  descripcion
    @title: 'Descripción'
    @mandatory;

  unidad
    @title: 'Unidad';

  activo
    @title: 'Activo';
};


// ═════════════════════════════════════════════════════════════
// RANGOS DE ACEPTACIÓN (ParametrosMaterial)
// ═════════════════════════════════════════════════════════════

annotate service.ParametrosMaterial with {

  parametro
    @title: 'Parámetro'
    @mandatory
    @Common.Text: parametro.descripcion
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'ParametrosVH',
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
        }
      ]
    };

  // Read-only: min/max are locked once the parametro is VISUAL
  // (srv/config-service.cds computes controlRango from parametro.tipoParametro)
  valorMinimo
    @title: 'Valor Mínimo'
    @Common.FieldControl: controlRango;

  valorMaximo
    @title: 'Valor Máximo'
    @Common.FieldControl: controlRango;

  esObligatorio
    @title: 'Obligatorio';

  esVisual      @UI.Hidden;
  controlRango  @UI.Hidden;
  material      @UI.Hidden;
};

annotate service.ParametrosMaterial with @(
  UI.LineItem #Rangos: [
    {
      Value: parametro_ID,
      Label: 'Parámetro'
    },
    {
      // Read-only: the parameter's own type, shown for reference next to
      // the range so the user knows why min/max may be locked
      Value: parametro.tipoParametro_code,
      Label: 'Tipo de Parámetro'
    },
    {
      Value: valorMinimo,
      Label: 'Valor Mínimo'
    },
    {
      Value: valorMaximo,
      Label: 'Valor Máximo'
    },
    {
      Value: esObligatorio,
      Label: 'Obligatorio'
    }
  ]
);


// Changing the parametro refreshes the derived field control (and the
// tipo de parámetro column) for the same row
annotate service.ParametrosMaterial with @(
  Common.SideEffects #Parametro: {
    SourceProperties: [ parametro_ID ],
    TargetProperties: [ 'esVisual', 'controlRango', 'parametro/tipoParametro_code' ]
  }
);
