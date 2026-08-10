sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"room/booking/bookings/test/integration/pages/BookingsList.gen",
	"room/booking/bookings/test/integration/pages/BookingsObjectPage.gen"
], function (JourneyRunner, BookingsListGenerated, BookingsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('room/booking/bookings') + '/test/flp.html#app-preview',
        pages: {
			onTheBookingsListGenerated: BookingsListGenerated,
			onTheBookingsObjectPageGenerated: BookingsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

