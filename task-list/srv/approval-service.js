const cds = require('@sap/cds')
const { SELECT, UPDATE, INSERT } = require('@sap/cds/lib/ql/cds-ql')
const { createWorkflowEngine } = require('./workflow-engine')

module.exports = class ApprovalService extends cds.ApplicationService {
    async init() {
        const { ApprovalRequests, Tasks } = this.entities
        const engine = createWorkflowEngine()

        // Unbound action: enviar tarea a aprobación manualmente
        this.on('submitForApproval', async (req) => {
            const { task: taskId } = req.data
            if (!taskId) return req.error(400, 'Task UUID is required')

            const task = await SELECT.one.from(Tasks).where({ ID: taskId })
            if (!task) return req.error(404, `Task ${taskId} not found`)
            if (task.status !== 'Done')
                return req.error(400, 'Task must be Done to submit for approval')

            const existing = await SELECT.one.from(ApprovalRequests)
                .where({ task_ID: taskId, status: 'Pending' })
            if (existing)
                return req.error(409, 'Task already has a pending approval request')

            await INSERT.into(ApprovalRequests).entries({
                task_ID    : taskId,
                status     : 'Pending',
                requestedBy: req.user?.id || 'anonymous'
            })

            await UPDATE(Tasks)
                .set({ status: 'PendingApproval' })
                .where({ ID: taskId })

            await engine.submit(taskId, req.user?.id || 'anonymous')

            return SELECT.from(ApprovalRequests).where({ task_ID: taskId, status: 'Pending' })
        })

        // Bound action: aprobar una solicitud
        this.on('approve', ApprovalRequests, async (req) => {
            const { ID } = req.params[0]
            const { comment } = req.data

            const request = await SELECT.one.from(ApprovalRequests).where({ ID })
            if (!request) return req.error(404, `ApprovalRequest ${ID} not found`)

            if (request.status === 'Approved')
                return SELECT.one.from(ApprovalRequests).where({ ID })
            if (request.status === 'Rejected')
                return req.error(400, 'Request was already rejected')
            if (request.status !== 'Pending')
                return req.error(400, 'Request is not Pending')

            await UPDATE(ApprovalRequests).set({
                status    : 'Approved',
                approvedBy: req.user?.id || 'anonymous',
                comment   : comment || null,
                decidedAt : new Date().toISOString()
            }).where({ ID })

            await UPDATE(Tasks)
                .set({ status: 'Done' })
                .where({ ID: request.task_ID })

            await engine.onApproved(request)

            return SELECT.one.from(ApprovalRequests).where({ ID })
        })

        // Bound action: rechazar una solicitud
        this.on('rejectRequest', ApprovalRequests, async (req) => {
            const { ID } = req.params[0]
            const { comment } = req.data

            if (!comment?.trim()) return req.error(400, 'Comment is required for rejection')

            const request = await SELECT.one.from(ApprovalRequests).where({ ID })
            if (!request) return req.error(404, `ApprovalRequest ${ID} not found`)

            if (request.status === 'Rejected')
                return SELECT.one.from(ApprovalRequests).where({ ID })
            if (request.status === 'Approved')
                return req.error(400, 'Request was already approved')
            if (request.status !== 'Pending')
                return req.error(400, 'Request is not Pending')

            await UPDATE(ApprovalRequests).set({
                status    : 'Rejected',
                approvedBy: req.user?.id || 'anonymous',
                comment,
                decidedAt : new Date().toISOString()
            }).where({ ID })

            await UPDATE(Tasks)
                .set({ status: 'Rejected', rejectionComment: comment })
                .where({ ID: request.task_ID })

            await engine.onRejected(request, comment)
            return SELECT.one.from(ApprovalRequests).where({ ID })
        })

        await super.init()
    }
}