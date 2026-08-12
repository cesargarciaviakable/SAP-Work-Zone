using { task.list as db } from '../db/schema';

service ApprovalService {
    @readonly entity Tasks as projection on db.Tasks;

    entity ApprovalRequests as projection on db.ApprovalRequests {
        *,
        case status
            when 'Approved' then 3 // 3 = Positive
            when 'Rejected' then 1 // 1 = Negative
            else            2      // 2 = Warning (Pending)
        end as criticality : Integer
    } actions {
        action approve(comment: String) returns ApprovalRequests;
        action rejectRequest(comment: String) returns ApprovalRequests;
    };

    action submitForApproval(task: UUID) returns many ApprovalRequests;

    @readonly entity Statuses as select from db.Statuses;
    @readonly entity ApprovalStatuses as select from db.ApprovalStatuses;
}