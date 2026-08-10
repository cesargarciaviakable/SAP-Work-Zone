namespace task.list;

using { cuid, managed } from '@sap/cds/common';

type TaskStatus : String(20) enum {
    Open            = 'Open';
    InProgress      = 'InProgress';
    Done            = 'Done';
    PendingApproval = 'PendingApproval';
    Rejected        = 'Rejected';
}

type ApprovalStatus : String(20) enum {
    Pending  = 'Pending';
    Approved = 'Approved';
    Rejected = 'Rejected';
}

entity Tasks : cuid, managed {
    title            : String(100) @mandatory;
    description      : String(500);
    status           : TaskStatus  default 'Open';
    rejectionComment : String(500) @readonly;
    approvalRequest  : Composition of many ApprovalRequests
                        on approvalRequest.task = $self;
}

entity ApprovalRequests : cuid, managed {
    task        : Association to Tasks @mandatory;
    status      : ApprovalStatus       default 'Pending';
    comment     : String(500);
    requestedBy : String(100);
    approvedBy  : String(100);
    decidedAt   : Timestamp;
}