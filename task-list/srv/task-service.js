const cds = require('@sap/cds')
const { SELECT, UPDATE, INSERT } = require('@sap/cds/lib/ql/cds-ql')

module.exports = class TaskService extends cds.ApplicationService {
    async init() {
        const { Tasks } = this.entities

        // Auto-submit para aprobación cuando una tarea se marca como Done
        this.after('UPDATE', Tasks, async (results, req) => {
            const task = Array.isArray(results) ? results[0] : results
            if (!task || task.status !== 'Done') return

            const { ApprovalRequests } = cds.services['ApprovalService'].entities

            const existing = await SELECT.one.from(ApprovalRequests)
                .where({ task_ID: task.ID, status: 'Pending' })
            if (existing) return

            await INSERT.into(ApprovalRequests).entries({
                task_ID     : task.ID,
                status      : 'Pending',
                requestedBy : req.user?.id || 'anonymous'
            })

            await UPDATE(Tasks)
                .set({ status: 'PendingApproval '})
                .where({ ID: task.ID })

            task.status = 'PendingApproval'
        })

        await super.init()
    }
}