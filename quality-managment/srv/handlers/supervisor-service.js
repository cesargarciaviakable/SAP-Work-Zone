const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql

// Decision → status del lote
const STATUS_LOTE_POR_DECISION = {
    LIBERAR: 'APROBADO',
    RECHAZAR: 'RECHAZADO',
    LIBERAR_CON_DESVIACION: 'APROBADO_CON_DESVIACION'
}

const REQUIEREN_JUSTIFICACION = ['RECHAZAR', 'LIBERAR_CON_DESVIACION']

module.exports = class SupervisorService extends cds.ApplicationService {
    async init() {
        const { Lotes, Inspecciones, ResultadosInspeccion, DecisionLote, ParametrosMaterial } = this.entities

        // Returns cumpleVisual when captured; otherwise evaluates the value
        // against the material range. undefined = cannot be evaluated
        const evaluarCumple = (resultado, rango) => {
            if (resultado.cumpleVisual !== null && resultado.cumpleVisual !== undefined) return resultado.cumpleVisual
            if (!rango || resultado.valorObtenido === null || resultado.valorObtenido === undefined) return
            const v = Number(resultado.valorObtenido)
            return v >= Number(rango.valorMinimo ?? -Infinity) && v <= Number(rango.valorMaximo ?? Infinity)
        }

        // Loads resultados with their material range for the given inspecciones
        const cargarResultados = async (inspeccionIds) => {
            const resultados = await SELECT
                .from(ResultadosInspeccion)
                .columns('ID', 'inspeccion_ID', 'parametro_ID', 'valorObtenido', 'cumpleVisual')
                .where({ inspeccion_ID: { in: inspeccionIds } })
            if (resultados.length === 0) return []

            const inspecciones = await SELECT
                .from(Inspecciones)
                .columns('ID', 'lote.material_ID as material_ID')
                .where({ ID: { in: [...new Set(resultados.map((r) => r.inspeccion_ID))] } })
            const materialPorInspeccion = new Map(inspecciones.map((i) => [i.ID, i.material_ID]))

            const rangos = await SELECT
                .from(ParametrosMaterial)
                .columns('material_ID', 'parametro_ID', 'valorMinimo', 'valorMaximo')
                .where({ material_ID: { in: [...new Set(materialPorInspeccion.values())] } })
            const rangoDe = (materialId, parametroId) =>
                rangos.find((r) => r.material_ID === materialId && r.parametro_ID === parametroId)

            return resultados.map((r) => ({
                ...r,
                cumple: evaluarCumple(r, rangoDe(materialPorInspeccion.get(r.inspeccion_ID), r.parametro_ID))
            }))
        }

        const asArray = (data) => (Array.isArray(data) ? data : data ? [data] : [])


        // ═════════════════════════════════════════════════════
        // CAMPOS CALCULADOS
        // ═════════════════════════════════════════════════════

        this.after('READ', Inspecciones, async (data) => {
            const rows = asArray(data).filter((i) => i.ID)
            if (rows.length === 0) return

            const resultados = await cargarResultados(rows.map((i) => i.ID))

            for (const inspeccion of rows) {
                const propios = resultados.filter((r) => r.inspeccion_ID === inspeccion.ID)
                const cumplen = propios.filter((r) => r.cumple === true).length

                inspeccion.totalParametros = propios.length
                inspeccion.parametrosCumplen = cumplen
                inspeccion.porcentajeCumplimiento = propios.length
                    ? Math.round((cumplen / propios.length) * 10000) / 100
                    : null
            }
        })

        this.after('READ', ResultadosInspeccion, async (data) => {
            const rows = asArray(data).filter((r) => r.ID)
            if (rows.length === 0) return

            const evaluados = await cargarResultados([...new Set(
                (await SELECT.from(ResultadosInspeccion).columns('inspeccion_ID')
                    .where({ ID: { in: rows.map((r) => r.ID) } })).map((r) => r.inspeccion_ID)
            )])
            const porId = new Map(evaluados.map((r) => [r.ID, r.cumple]))

            for (const resultado of rows) {
                const cumple = porId.get(resultado.ID)
                resultado.cumple = cumple ?? null
                resultado.criticidad = cumple === true ? 3 : cumple === false ? 1 : 0
            }
        })


        // ═════════════════════════════════════════════════════
        // VALIDACIÓN COMÚN
        // ═════════════════════════════════════════════════════

        // Returns the inspection when it is COMPLETADA and has no decision yet.
        // Uses req.reject (throws): req.error only collects and returns a
        // truthy error object, so callers would keep going
        const inspeccionPendiente = async (req) => {
            const { ID } = req.params.at(-1)

            const inspeccion = await SELECT.one.from(Inspecciones).columns('ID', 'status_code', 'lote_ID').where({ ID })
            if (!inspeccion) return req.reject(404, 'Inspección no encontrada')

            if (inspeccion.status_code !== 'COMPLETADA') {
                return req.reject(409, 'Solo se puede actuar sobre inspecciones completadas')
            }

            const decisionExistente = await SELECT.one.from(DecisionLote).columns('ID').where({ inspeccion_ID: ID })
            if (decisionExistente) return req.reject(409, 'Esta inspección ya tiene una decisión registrada')

            return inspeccion
        }


        // ═════════════════════════════════════════════════════
        // TOMAR DECISIÓN
        // ═════════════════════════════════════════════════════

        this.on('tomarDecision', Inspecciones, async (req) => {
            const { decision, justificacion } = req.data
            const nuevoStatusLote = STATUS_LOTE_POR_DECISION[decision]

            if (!nuevoStatusLote) {
                return req.error(400, `Decisión inválida. Valores permitidos: ${Object.keys(STATUS_LOTE_POR_DECISION).join(', ')}`)
            }

            if (REQUIEREN_JUSTIFICACION.includes(decision) && !justificacion?.trim()) {
                return req.error(400, 'La justificación es obligatoria para rechazar o liberar con desviación')
            }

            const inspeccion = await inspeccionPendiente(req)

            await INSERT.into(DecisionLote).entries({
                inspeccion_ID: inspeccion.ID,
                decision_code: decision,
                justificacion: justificacion?.trim() || ''
            })

            await UPDATE(Lotes).set({ status_code: nuevoStatusLote }).where({ ID: inspeccion.lote_ID })

            return {
                mensaje: `Lote ${decision === 'RECHAZAR' ? 'rechazado' : 'liberado'} correctamente`,
                statusLote: nuevoStatusLote
            }
        })


        // ═════════════════════════════════════════════════════
        // REGRESAR INSPECCIÓN
        // ═════════════════════════════════════════════════════

        this.on('regresarInspeccion', Inspecciones, async (req) => {
            const { observaciones } = req.data

            if (!observaciones?.trim()) {
                return req.error(400, 'Debe indicar las observaciones para regresar la inspección')
            }

            const inspeccion = await inspeccionPendiente(req)

            // Regresa la inspección a ABIERTA con las observaciones del supervisor
            await UPDATE(Inspecciones)
                .set({ status_code: 'ABIERTA', observaciones: observaciones.trim() })
                .where({ ID: inspeccion.ID })

            // El lote vuelve a EN_INSPECCION
            await UPDATE(Lotes).set({ status_code: 'EN_INSPECCION' }).where({ ID: inspeccion.lote_ID })

            return {
                mensaje: 'Inspección regresada al inspector con observaciones'
            }
        })

        await super.init()
    }
}
