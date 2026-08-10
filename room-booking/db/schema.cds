namespace room.booking;

using { cuid, managed } from '@sap/cds/common';

// Edificioes
entity Buildings : cuid, managed {
    name    : String(100) @mandatory;
    address : String(200);
    floors  : Integer default 1;
    rooms   : Composition of many Rooms on rooms.building = $self;
}

// Salas
entity Rooms : cuid, managed {
    name     : String(100) @mandatory;
    capacity : Integer     @mandatory;
    floor    : Integer;
    hasTV    : Boolean default false;
    hasBoard : Boolean default false;
    building : Association to Buildings;
    bookings : Composition of many Bookings on bookings.room = $self;
}

// Empleados
entity Employees : cuid, managed {
    name       : String(100) @mandatory;
    email      : String(100) @mandatory;
    department : String(100);
    bookings   : Composition of many Bookings on bookings.employee = $self;
}

// Reservaciones
entity Bookings : cuid, managed {
    room      : Association to Rooms     @mandatory;
    employee  : Association to Employees @mandatory;
    title     : String(200)              @mandatory;
    startTime : DateTime                 @mandatory;
    endTime   : DateTime                 @mandatory;
    attendees : Integer default 1;
    status    : String(20) enum {
        confirmed = 'confirmed';
        cancelled = 'cancelled';
        pending = 'pending';
    } default 'confirmed';
    notes     : String(500);
}