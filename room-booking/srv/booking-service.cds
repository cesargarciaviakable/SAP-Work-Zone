using { room.booking as db } from '../db/schema';

service BookingService {
    // Entidades CRUD
    entity Buildings as projection on db.Buildings;

    @cds.redirection.target
    entity Rooms     as projection on db.Employees;

    entity Bookings  as projection on db.Bookings {
        *,
        case status
            when 'confirmed' then 3 // 3 = Positive
            when 'cancelled' then 1 // 1 = Negative
            else 2                  // 2 = Warning
        end as criticality : Integer
    };

    // View de solo lectura - salas con disponibilidad
    @readonly
    entity RoomsView as select from db.Rooms {
        *,
        building.name as buildingName : String
    } excluding {
        bookings
    };

    // Actions
    action cancelBooking(bookingId : UUID)
        returns { message : String; success : Boolean; };

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