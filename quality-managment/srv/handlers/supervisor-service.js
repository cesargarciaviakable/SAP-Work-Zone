const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = require('@sap/cds/lib/ql/cds-ql')

module.exports = class SupervisorService extends cds.ApplicationService {
    async init() {
        const { Lotes, Inspecciones, ResultadosInspeccion, DecisionLote } = this.entities

        // Validacion
        this.before('CREATE', DecisionLote, async (req) => {
            const { inspeccion_ID } = req.data

            if (!inspeccion_ID) return req.error(400, 'Se requiere el ID de la inspeccion')
            
            const inspeccion = await SELECT.one.from(Inspecciones).where({ ID: inspeccion_ID })

            if (!inspeccion) return req.error(404, 'Inspeccion no encontrada')
            
            if (inspeccion.status_code !== 'COMPLETADA') return req.error(409, 'Solo se puede decidir sobre inspecciones completadas')
            
            // Validar que no tenga ya una decision
            const decisionExistente = await SELECT.one.from(DecisionLote).where({ inspeccion_ID })

            if (decisionExistente) return req.error(409, 'Esta inspeccion ya tiene una decision registrada')
        })

        // Accion: tomar decision final sobre el lote
        this.on('tomarDecision', async (req) => {
            const { inspeccionId, decision,  justificacion } = req.data

            // Validaciones basicas
            const decisionesValidas = ['LIBERAR', 'RECHAZAR', 'LIBERAR_CON_DESVIACION']
            if (!decisionesValidas.includes(decision)) return req.error(400, `Decision invalida. Valores permitidos ${decisionesValidas.join(', ')}`)
            
            if (decision === 'LIBERAR_CON_DESVIACION' && !justificacion) return req.erorr(400, 'La justificacion es obligatoria para liberar con desviacion')

            if (decision === 'RECHAZAR' && !justificacion) req.error(400, 'La justificacion es obligatoria para rechazar un lote')

            const inspeccion = await SELECT.one.from(Inspecciones).where({ ID: inspeccionId })

            if (!inspeccion) return req.error(404, 'Inspeccion no encontrada')
            
            if (inspeccion.status_code !== 'COMPLETADA') return req.error(409, 'Solo se puede decidir sobre inspecciones completadas')

            // Mapear decision al status del lote
            const statusLoteMap = {
                'LIBERAR'                : 'APROBADO',
                'RECHAZAR'               : 'RECHAZADO',
                'LIBERAR_CON_DESVIACION' : 'APROBADO_CON_DESVIACION'
            }
            const nuevoStatusLote = statusLoteMap[decision]

            // Registrar decision
            await INSERT.into(DecisionLote).entries({
                ID           : cds.utils.uuid(),
                inspeccion_ID: inspeccionId,
                decision_code: decision,
                justificacion: justificacion || ''
            })

            // Actualizar status de la inspeccion
            await UPDATE(Inspecciones).set({ status_code: 'COMPLETADA' }).where({ ID: inspeccionId })

            // Actualizar status del lote
            await UPDATE(lotes).set({ status_code: nuevoStatusLote }).where({ ID: inspeccion.lote_ID })

            return {
                mensaje: `Lote ${decision === 'RECHAZAR' ? 'rechazado' : 'liberado'} correctamente`,
                statusLote: nuevoStatusLote
            }
        })

        // Accion: regresar inspeccion al inspector para correccion
        this.on('regresarInspeccion', async (req) => {
            const { inspeccionId, obeservaciones } = req.data

            if (!observaciones) return req.error(400, 'Debe indicar las observaciones para regresar la inspeccion')

            const inspeccion = await SELECT.one.from(Inspecciones).where({ ID: inspeccionId })

            if (!inspeccion) return req.error(404, 'Inspeccion no encontrada')
            
            if (inspeccion.status_code !== 'COMPLETADA') return req.error(409, 'Solo se pueden regresar inspecciones completadas')

            // Regresa la inspeccione a ABIERTA con las observaciones del supervisor
            await UPDATE(Inspecciones).set({ status_code: 'ABIERTA', observaciones })

            // El lote vuelve a EN_INSPECCION
            await UPDATE(Lotes).set({ status_code: 'EN_INSPECCION' }).where({ ID: inspeccion.lote_ID })

            return {
                mensaje: 'Inspeccion regresada al inspector con observaciones'
            }
        })

        await super.init()
    }
}