using BookingService from '../../srv/booking-service';

// Bookings
annotate BookingService.Bookings with @(
    UI.LineItem: [
        { Value: title,              Label: 'Titulo'     },
        { Value: room.name,          Label: 'Sala'       },
        { Value: room.building.name, Label: 'Edificio'   },
        { Value: employee.name,      Label: 'Empleado'   },
        { Value: startTime,          Label: 'Inicio'     },
        { Value: endTime,            Label: 'Fin'        },
        { Value: attendees,          Label: 'Asistentes' },
        {
            Value: status,
            Label: 'Estado'
        }
    ],

    UI.HeaderInfo: {
        TypeName       : 'Reservación',
        TypeNamePlural : 'Reservaciones',
        Title          : { Value: title },
        Description    : { Value: employee.name }
    },

    // Botón cancelar en el Object Page
    UI.Identification: [
        {
            $Type : 'UI.DataFieldForAction',
            Action: 'BookingService.cancelBooking',
            Label : 'Cancelar Reservación',
            InvocationGrouping: #ChangeSet
        }
    ],

    UI.Facets: [
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'Información General',
            Target: '@UI.FieldGroup#General'
        },
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'Sala',
            Target: '@UI.FieldGroup#Room'
        }
    ],

    UI.FieldGroup #General: {
        Label: 'General',
        Data : [
            { Value: title },
            { Value: employee_ID, Label: 'Empleado' },
            { Value: startTime },
            { Value: endTime   },
            { Value: attendees },
            { Value: status    },
            { Value: notes     }
        ]
    },

    UI.FieldGroup #Room: {
        Label: 'Sala',
        Data : [
            { Value: room_ID,      Label: 'Sala'      },
            { Value: roomCapacity, Label: 'Capacidad' },
            { Value: roomFloor,    Label: 'Piso'      },
            { Value: roomBuilding, Label: 'Edificio'  }
        ]
    },

    UI.SelectionFields: [
        status,
        room_ID,
        employee_ID,
        startTime,
        endTime
    ],
);

// Labels de campos
annotate BookingService.Bookings with {
    title     @title: 'Título';
    startTime @title: 'Inicio';
    endTime   @title: 'Fin';
    attendees @title: 'Asistentes';
    status    @title: 'Estado';
    notes     @title: 'Notas';
    room      @title: 'Sala';
    employee  @title: 'Empleado';

    room @Common.ValueList : {
        $Type          : 'Common.ValueListType',
        CollectionPath : 'Rooms',
        Parameters     : [
            {
                $Type             : 'Common.ValueListParameterInOut',
                LocalDataProperty : room_ID,
                ValueListProperty : 'ID'
            },
            {
                $Type            : 'Common.ValueListParameterOut',
                LocalDataProperty: roomCapacity,
                ValueListProperty: 'capacity'
            },
            {
                $Type            : 'Common.ValueListParameterOut',
                LocalDataProperty: roomFloor,
                ValueListProperty: 'floor'
            },
            {
                $Type            : 'Common.ValueListParameterOut',
                LocalDataProperty: roomBuilding,
                ValueListProperty: 'building_ID'
            }
        ]
    };

    employee @Common.ValueList : {
        $Type          : 'Common.ValueListType',
        CollectionPath : 'Employees',
        Parameters     : [
            {
                $Type             : 'Common.ValueListParameterInOut',
                LocalDataProperty : employee_ID,
                ValueListProperty : 'ID'
            },
            {
                $Type             : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'name'
            },
            {
                $Type             : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'email'
            }
        ]
    }
}

// Rooms
annotate BookingService.Rooms with @(
    UI.LineItem: [
        { Value: name,          Label: 'Sala' },
        { Value: building.name, Label: 'Edificio' },
        { Value: capacity,      Label: 'Capacidad' },
        { Value: floor,         Label: 'Piso' },
        { Value: hasTV,         Label: 'TV' },
        { Value: hasBoard,      Label: 'Pizarrón' },
    ],

    UI.HeaderInfo: {
        TypeName      : 'Sala',
        TypeNamePlural: 'Salas',
        Title         : { Value: name },
        Description   : { Value: building.name }
    },

    UI.Facets: [{
        $Type : 'UI.ReferenceFacet',
        Label : 'Detalles',
        Target: '@UI.FieldGroup#Details'
    }],

    UI.FieldGroup #Details: {
        Data: [
            { Value: name },
            { Value: building_ID, Label: 'Edificio' },
            { Value: capacity },
            { Value: floor    },
            { Value: hasTV    },
            { Value: hasBoard }
        ]
    }
);

annotate BookingService.Rooms with {
    name     @title: 'Nombre';
    capacity @title: 'Capacidad';
    floor    @title: 'Piso';
    hasTV    @title: 'Tiene TV';
    hasBoard @title: 'Tiene Pizarrón';
    building @title: 'Edificio';
}

// Buildings
annotate BookingService.Buildings with @(
    UI.LineItem: [
        { Value: name,    Label: 'Edificio' },
        { Value: address, Label: 'Dirección' },
        { Value: floors,  Label: 'Pisos' }
    ],

    UI.HeaderInfo: {
        TypeName      : 'Edificio',
        TypeNamePlural: 'Edificios',
        Title         : { Value: name },
        Description   : { Value: address }
    },

    UI.Facets: [{
        $Type : 'UI.ReferenceFacet',
        Label : 'Detalles',
        Target: '@UI.FieldGroup#Details'
    }],

    UI.FieldGroup #Details: {
        Data: [
            { Value: name    },
            { Value: address },
            { Value: floors  }
        ]
    }
);

annotate BookingService.Buildings with {
    name    @title: 'Nombre';
    address @title: 'Dirección';
    floors  @title: 'Pisos';
}

// Employees
annotate BookingService.Employees with @(
    UI.LineItem: [
        { Value: name,      Label: 'Nombre' },
        { Value: email,     Label: 'Email' },
        { Value: department, Label: 'Área' }
    ],

    UI.HeaderInfo: {
        TypeName      : 'Empleado',
        TypeNamePlural: 'Empleados',
        Title         : { Value: name },
        Description   : { Value: department }
    },

    UI.Facets: [{
        $Type : 'UI.ReferenceFacet',
        Label : 'Detalles',
        Target: '@UI.FieldGroup#Details'
    }],

    UI.FieldGroup #Details: {
        Data: [
            { Value: name       },
            { Value: email      },
            { Value: department },
        ]
    }
);

annotate BookingService.Employees with {
    name       @title: 'Nombre';
    email      @title: 'Email';
    department @title: 'Área';
}

annotate BookingService.Bookings