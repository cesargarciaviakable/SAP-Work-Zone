using ConfigService as service from '../../srv/config-service';


// ═════════════════════════════════════════════════════════════
// PARAMETROS — LIST REPORT
// ═════════════════════════════════════════════════════════════

annotate service.Parametros with @(
  UI.SelectionFields: [
    tipoParametro_code,
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
      Value: tipoParametro_code,
      Label: 'Tipo de Parámetro'
    },
    {
      Value: unidadMedida,
      Label: 'Unidad de Medida'
    },
    {
      Value: activo,
      Label: 'Activo'
    }
  ]
);


// ═════════════════════════════════════════════════════════════
// PARAMETROS — OBJECT PAGE
// ═════════════════════════════════════════════════════════════

annotate service.Parametros with @(
  UI.HeaderInfo: {
    TypeName: 'Parámetro',
    TypeNamePlural: 'Parámetros',

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
        Value: tipoParametro_code,
        Label: 'Tipo de Parámetro'
      },
      {
        Value: unidadMedida,
        Label: 'Unidad de Medida'
      },
      {
        Value: activo,
        Label: 'Activo'
      }
    ]
  }
);


// ═════════════════════════════════════════════════════════════
// PARAMETROS — PROPIEDADES
// ═════════════════════════════════════════════════════════════

annotate service.Parametros with {

  codigo
    @title: 'Código'
    @mandatory;

  descripcion
    @title: 'Descripción'
    @mandatory;

  unidadMedida
    @title: 'Unidad de Medida';

  activo
    @title: 'Activo';

  tipoParametro
    @title: 'Tipo de Parámetro'
    @mandatory
    @Common.Text: tipoParametro.name
    @Common.TextArrangement: #TextFirst
    @Common.ValueListWithFixedValues
    @Common.ValueList: {
      CollectionPath: 'TiposParametro',

      Parameters: [
        {
          $Type: 'Common.ValueListParameterInOut',
          LocalDataProperty: tipoParametro_code,
          ValueListProperty: 'code'
        },
        {
          $Type: 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'name'
        }
      ]
    };
};
