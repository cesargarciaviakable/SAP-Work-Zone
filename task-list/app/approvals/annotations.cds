using ApprovalService as service from '../../srv/approval-service';

annotate service.ApprovalRequests with @(
    UI.HeaderInfo: {
        TypeName      : 'Approval',
        TypeNamePlural: 'Approvals',
        Title         : { Value: task.title },
        Description   : { Value: status     }
    },

    UI.FieldGroup #General: {
        $Type: 'UI.FieldGroupType',
        Data : [
            { $Type: 'UI.DataField', Value: status,      Label: 'Status'        },
            { $Type: 'UI.DataField', Value: comment,     Label: 'Comment'       },
            { $Type: 'UI.DataField', Value: requestedBy, Label: 'Requested By'  },
            { $Type: 'UI.DataField', Value: approvedBy,  Label: 'Approved By'   },
            { $Type: 'UI.DataField', Value: createdAt,   Label: 'Created'       },
            { $Type: 'UI.DataField', Value: decidedAt,   Label: 'Decision Date' }
        ]
    },

    UI.Facets: [{
        $Type : 'UI.ReferenceFacet',
        ID    : 'GeneralFacet',
        Label : 'General Information',
        Target: '@UI.FieldGroup#General'
    }],

    UI.LineItem: [
        { $Type: 'UI.DataField', Value: task.title,  Label: 'Task'      },
        { $Type: 'UI.DataField', Value: status,      Label: 'Status'    },
        { $Type: 'UI.DataField', Value: requestedBy, Label: 'Requester' },
        { $Type: 'UI.DataField', Value: createdAt,   Label: 'Created'   }
    ],

    UI.SelectionFields: [status],

    UI.Identification: [
        { $Type: 'UI.DataFieldForAction', Action: 'ApprovalService.approve',       Label: 'Approve' },
        { $Type: 'UI.DataFieldForAction', Action: 'ApprovalService.rejectRequest', Label: 'Reject'  }
    ]
);

annotate service.ApprovalRequests with {
    status @(
        Common.ValueListWithFixedValues: true,
        Common.ValueList: {
            CollectionPath: 'ApprovalRequests',
            Parameters: [{
                $Type            : 'Common.ValueListParameterOut',
                LocalDataProperty: status,
                ValueListProperty: 'status'
            }]
        }
    )
};
