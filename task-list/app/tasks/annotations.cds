using TaskService as service from '../../srv/task-service';

annotate service.Tasks with @(
    Capabilities.InsertRestrictions: { Insertable: true  },
    Capabilities.UpdateRestrictions: { Updatable : true  },
    Capabilities.DeleteRestrictions: { Deletable : true  },

    UI.HeaderInfo: {
        TypeName      : 'Task',
        TypeNamePlural: 'Tasks',
        Title         : { Value: title  },
        Description   : { Value: status }
    },

    UI.FieldGroup #GeneratedGroup: {
        $Type: 'UI.FieldGroupType',
        Data : [
            { $Type: 'UI.DataField', Label: 'Title',            Value: title            },
            { $Type: 'UI.DataField', Label: 'Description',      Value: description      },
            { $Type: 'UI.DataField', Label: 'Status',           Value: status           },
            { $Type: 'UI.DataField', Label: 'Rejection Reason', Value: rejectionComment }
        ]
    },

    UI.Facets: [{
        $Type : 'UI.ReferenceFacet',
        ID    : 'GeneratedFacet1',
        Label : 'General Information',
        Target: '@UI.FieldGroup#GeneratedGroup'
    }],

    UI.LineItem: [
        { $Type: 'UI.DataField', Label: 'Title',       Value: title       },
        { $Type: 'UI.DataField', Label: 'Description', Value: description },
        { $Type: 'UI.DataField', Label: 'Status',      Value: status      }
    ],

    UI.SelectionFields: [status]
);

annotate service.Tasks with {
    status @(
        Common.ValueListWithFixedValues: true,
        Common.ValueList               : {
        CollectionPath: 'Statuses',
            Parameters    : [{
                $Type            : 'Common.ValueListParameterOut',
                LocalDataProperty: status,
                ValueListProperty: 'value'
            }]
        },
    )
};
