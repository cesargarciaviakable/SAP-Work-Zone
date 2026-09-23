sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"lote/inspector/app/qmdashboard/test/integration/pages/LotesConDecisionList.gen",
	"lote/inspector/app/qmdashboard/test/integration/pages/LotesConDecisionObjectPage.gen"
], function (JourneyRunner, LotesConDecisionListGenerated, LotesConDecisionObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('lote/inspector/app/qmdashboard') + '/test/flp.html#app-preview',
        pages: {
			onTheLotesConDecisionListGenerated: LotesConDecisionListGenerated,
			onTheLotesConDecisionObjectPageGenerated: LotesConDecisionObjectPageGenerated
        },
        async: true
    });

    return runner;
});

