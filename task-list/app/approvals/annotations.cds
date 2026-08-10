using ApprovalService as service from '../../srv/approval-service';
annotate service.ApprovalRequests with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'status',
                Value : status,
            },
            {
                $Type : 'UI.DataField',
                Label : 'comment',
                Value : comment,
            },
            {
                $Type : 'UI.DataField',
                Label : 'requestedBy',
                Value : requestedBy,
            },
            {
                $Type : 'UI.DataField',
                Label : 'approvedBy',
                Value : approvedBy,
            },
            {
                $Type : 'UI.DataField',
                Label : 'decidedAt',
                Value : decidedAt,
            },
            {
                $Type : 'UI.DataField',
                Label : 'critically',
                Value : critically,
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
            Label : 'status',
            Value : status,
        },
        {
            $Type : 'UI.DataField',
            Label : 'comment',
            Value : comment,
        },
        {
            $Type : 'UI.DataField',
            Label : 'requestedBy',
            Value : requestedBy,
        },
        {
            $Type : 'UI.DataField',
            Label : 'approvedBy',
            Value : approvedBy,
        },
        {
            $Type : 'UI.DataField',
            Label : 'decidedAt',
            Value : decidedAt,
        },
    ],
);

annotate service.ApprovalRequests with {
    task @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'Tasks',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : task_ID,
                ValueListProperty : 'ID',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'title',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'description',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'status',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'rejectionComment',
            },
        ],
    }
};

