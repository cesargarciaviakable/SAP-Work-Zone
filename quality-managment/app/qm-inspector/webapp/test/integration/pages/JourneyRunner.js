sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"lote/inspector/app/qminspector/test/integration/pages/LotesList.gen",
	"lote/inspector/app/qminspector/test/integration/pages/LotesObjectPage.gen",
	"lote/inspector/app/qminspector/test/integration/pages/InspeccionesObjectPage.gen"
], function (JourneyRunner, LotesListGenerated, LotesObjectPageGenerated, InspeccionesObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('lote/inspector/app/qminspector') + '/test/flp.html#app-preview',
        pages: {
			onTheLotesListGenerated: LotesListGenerated,
			onTheLotesObjectPageGenerated: LotesObjectPageGenerated,
			onTheInspeccionesObjectPageGenerated: InspeccionesObjectPageGenerated
        },
        async: true
    });

    return runner;
});

