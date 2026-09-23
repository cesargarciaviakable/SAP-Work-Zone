using InspectorService as service from '../../srv/inspector-service';
annotate service.Lotes with @(
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
                Label : 'turno_code',
                Value : turno_code,
            },
            {
                $Type : 'UI.DataField',
                Label : 'cantidad',
                Value : cantidad,
            },
            {
                $Type : 'UI.DataField',
                Label : 'unidad',
                Value : unidad,
            },
            {
                $Type : 'UI.DataField',
                Label : 'fechaProduccion',
                Value : fechaProduccion,
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
                Label : 'cantidadInspecciones',
                Value : cantidadInspecciones,
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
            Label : 'turno_code',
            Value : turno_code,
        },
        {
            $Type : 'UI.DataField',
            Label : 'cantidad',
            Value : cantidad,
        },
        {
            $Type : 'UI.DataField',
            Label : 'unidad',
            Value : unidad,
        },
        {
            $Type : 'UI.DataField',
            Label : 'fechaProduccion',
            Value : fechaProduccion,
        },
    ],
);

annotate service.Lotes with {
    material @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'Materiales',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : material_ID,
                ValueListProperty : 'ID',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'codigo',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'descripcion',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'unidad',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'activo',
            },
        ],
    }
};

annotate service.Lotes with {
    lineaProduccion @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'LineasProduccion',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : lineaProduccion_ID,
                ValueListProperty : 'ID',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'codigo',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'descripcion',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'planta',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'activo',
            },
        ],
    }
};

annotate service.Lotes with {
    turno @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'Turnos',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : turno_code,
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

annotate service.Lotes with {
    status @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'StatusLote',
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

