sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"lote/inspector/app/qmsupervisor/test/integration/pages/InspeccionesList.gen",
	"lote/inspector/app/qmsupervisor/test/integration/pages/InspeccionesObjectPage.gen",
	"lote/inspector/app/qmsupervisor/test/integration/pages/ResultadosInspeccionObjectPage.gen"
], function (JourneyRunner, InspeccionesListGenerated, InspeccionesObjectPageGenerated, ResultadosInspeccionObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('lote/inspector/app/qmsupervisor') + '/test/flp.html#app-preview',
        pages: {
			onTheInspeccionesListGenerated: InspeccionesListGenerated,
			onTheInspeccionesObjectPageGenerated: InspeccionesObjectPageGenerated,
			onTheResultadosInspeccionObjectPageGenerated: ResultadosInspeccionObjectPageGenerated
        },
        async: true
    });

    return runner;
});

