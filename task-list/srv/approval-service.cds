using task.list as tl from '../db/schema';

service ApprovalService {
    @readonly
    entity Tasks as projection on tl.Tasks;

    entity ApprovalRequests as projection on tl.ApprovalRequests {
        *,
        case status
            when 'Approved' then 3 // 3 = Positive
            when 'Rejected' then 1 // 1 = Negative
            else            2      // 2 = Warning (Pending)
        end as critically : Integer
    } actions {
        action approve(comment: String) returns ApprovalRequests;
        action rejectRequest(comment: String) returns ApprovalRequests;
    };

    action submitForApproval(task: UUID) returns many ApprovalRequests;
}