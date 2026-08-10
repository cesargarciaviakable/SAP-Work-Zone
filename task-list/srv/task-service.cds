using { task.list as db } from '../db/schema';

service TaskService {
    @odata.draft.enabled
    entity Tasks as projection on db.Tasks {
        *,
        case status
            when 'Open'            then 2 // 2 = Warning
            when 'InProgress'      then 3 // 3 = Positive
            when 'Done'            then 3 // 3 = Positive
            when 'PendingApproval' then 2 // 2 = Warning
            when 'Rejected'        then 1 // 1 = Negative
        end as criticality : Integer
    };
}
