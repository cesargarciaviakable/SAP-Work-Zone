using ReportsService as service from '../../srv/reports-service';
annotate service.LotesConDecision with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'numeroLote',
                Value : numeroLote,
            },
            {
                $Type : 'UI.DataField',
                Label : 'material',
                Value : material,
            },
            {
                $Type : 'UI.DataField',
                Label : 'linea',
                Value : linea,
            },
            {
                $Type : 'UI.DataField',
                Label : 'turno',
                Value : turno,
            },
            {
                $Type : 'UI.DataField',
                Label : 'fechaProduccion',
                Value : fechaProduccion,
            },
            {
                $Type : 'UI.DataField',
                Label : 'cantidad',
                Value : cantidad,
            },
            {
                $Type : 'UI.DataField',
                Label : 'statusLote',
                Value : statusLote,
            },
            {
                $Type : 'UI.DataField',
                Label : 'decision',
                Value : decision,
            },
            {
                $Type : 'UI.DataField',
                Label : 'justificacion',
                Value : justificacion,
            },
            {
                $Type : 'UI.DataField',
                Label : 'aprobadorPor',
                Value : aprobadorPor,
            },
            {
                $Type : 'UI.DataField',
                Label : 'fechaDecision',
                Value : fechaDecision,
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'numeroLote',
            Value : numeroLote,
        },
        {
            $Type : 'UI.DataField',
            Label : 'material',
            Value : material,
        },
        {
            $Type : 'UI.DataField',
            Label : 'linea',
            Value : linea,
        },
        {
            $Type : 'UI.DataField',
            Label : 'turno',
            Value : turno,
        },
        {
            $Type : 'UI.DataField',
            Label : 'fechaProduccion',
            Value : fechaProduccion,
        },
    ],
);

