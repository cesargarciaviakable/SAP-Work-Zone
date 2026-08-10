sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"task/list/tasks/test/integration/pages/TasksList.gen",
	"task/list/tasks/test/integration/pages/TasksObjectPage.gen"
], function (JourneyRunner, TasksListGenerated, TasksObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('task/list/tasks') + '/test/flp.html#app-preview',
        pages: {
			onTheTasksListGenerated: TasksListGenerated,
			onTheTasksObjectPageGenerated: TasksObjectPageGenerated
        },
        async: true
    });

    return runner;
});

