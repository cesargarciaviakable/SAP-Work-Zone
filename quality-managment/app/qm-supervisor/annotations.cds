using SupervisorService as service from '../../srv/supervisor-service';
annotate service.Inspecciones with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'fechaInspeccion',
                Value : fechaInspeccion,
            },
            {
                $Type : 'UI.DataField',
                Label : 'status_code',
                Value : status_code,
            },
            {
                $Type : 'UI.DataField',
                Label : 'observaciones',
                Value : observaciones,
            },
            {
                $Type : 'UI.DataField',
                Label : 'totalParametros',
                Value : totalParametros,
            },
            {
                $Type : 'UI.DataField',
                Label : 'parametrosCumplen',
                Value : parametrosCumplen,
            },
            {
                $Type : 'UI.DataField',
                Label : 'porcentajeCumplimiento',
                Value : porcentajeCumplimiento,
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
            Label : 'fechaInspeccion',
            Value : fechaInspeccion,
        },
        {
            $Type : 'UI.DataField',
            Label : 'status_code',
            Value : status_code,
        },
        {
            $Type : 'UI.DataField',
            Label : 'observaciones',
            Value : observaciones,
        },
        {
            $Type : 'UI.DataField',
            Label : 'totalParametros',
            Value : totalParametros,
        },
        {
            $Type : 'UI.DataField',
            Label : 'parametrosCumplen',
            Value : parametrosCumplen,
        },
    ],
);

annotate service.Inspecciones with {
    lote @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'Lotes',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : lote_ID,
                ValueListProperty : 'ID',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'numeroLote',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'turno_code',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'cantidad',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'unidad',
            },
        ],
    }
};

annotate service.Inspecciones with {
    status @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'StatusInspeccion',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : status_code,
                ValueListProperty : 'code',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'name',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'descr',
            },
        ],
    }
};

