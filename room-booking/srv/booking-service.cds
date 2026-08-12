using { room.booking as db } from '../db/schema';

service BookingService {
    // Entidades CRUD
    entity Buildings as projection on db.Buildings;

    @cds.redirection.target
    entity Rooms     as projection on db.Rooms;

    entity Employees as projection on db.Employees;

    @odata.draft.enabled
    entity Bookings  as projection on db.Bookings {
        *,
        room.capacity      as roomCapacity : Integer,
        room.floor         as roomFloor    : Integer,
        room.building.name as roomBuilding : String
    };

    // View de solo lectura - salas con disponibilidad
    @readonly
    entity RoomsView as select from db.Rooms {
        *,
        building.name as buildingName : String
    } excluding { bookings };

    // Functions
    function getAvailableRooms(
        startTime : DateTime,
        endTime   : DateTime,
        capacity  : Integer
    ) returns array of {
        id           : UUID;
        name         : String;
        capacity     : Integer;
        floor        : Integer;
        buildingName : String;
    }
}