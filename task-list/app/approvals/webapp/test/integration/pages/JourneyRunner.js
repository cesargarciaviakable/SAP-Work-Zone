sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"task/list/approvals/test/integration/pages/ApprovalRequestsList.gen",
	"task/list/approvals/test/integration/pages/ApprovalRequestsObjectPage.gen"
], function (JourneyRunner, ApprovalRequestsListGenerated, ApprovalRequestsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('task/list/approvals') + '/test/flp.html#app-preview',
        pages: {
			onTheApprovalRequestsListGenerated: ApprovalRequestsListGenerated,
			onTheApprovalRequestsObjectPageGenerated: ApprovalRequestsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

