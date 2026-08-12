using { task.list as db } from '../db/schema';

service TaskService {
    @odata.draft.enabled
    entity Tasks as projection on db.Tasks;

    @readonly entity Statuses as select from db.Statuses;
}