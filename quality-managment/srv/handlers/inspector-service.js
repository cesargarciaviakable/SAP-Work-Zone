const cds = require('@sap/cds')
const { SELECT, UPDATE } = require('@sap/cds/lib/ql/cds-ql')

module.exports = class InspectorService extends cds.ApplicationService {
    async init() {
        const { Lotes, Inspecciones, ResultadosInspeccion, ParametrosMaterial } = this.entities

        // ── Hook: al crear una inspección, cambia el lote a EN_INSPECCION
        this.before('CREATE', Inspecciones, async (req) => {
            const { lote_ID } = req.data

            if (!lote_ID) return req.error(400, 'Se requiere el ID del lote')

            const lote = await SELECT.one.from(Lotes).where({ ID: lote_ID })

            if (!lote) return req.error(404, 'Lote no encontrado')

            if (lote.status_code === 'EN_INSPECCION') return req.error(409, 'El lote ya tiene una inspeccion en proces')

            if (lote.status_code !== 'PENDIENTE') return req.error(409, `El lote no puede inspeccionarse en status: ${lote.status_code}`)
            
            // Actualiza status del lote
            await UPDATE(Lote).set({ status_code: 'EN_INSPECCION' }).where({ ID: lote_ID })
        })

        // ── Hook: al registrar resultado, calcula si cumple automáticamente
        this.before('CREATE', ResultadosInspeccion, async (req) => {
            const { parametro_ID, valorObtenido, inspeccion_ID } = req.data

            if (!parametro_ID || !inspeccion_ID) return req.error(400, 'Parametro e inspeccion son requeridos')
            
            // Obtener la inspeccion para saber el lote
            const inspeccion = await SELECT.one.from(Inspecciones).where({ ID: inspeccion_ID })
            if (!inspeccion) return req.error(404, 'Inspeccion no encontrada')

            // Buscar rangos del parametro para ese material
            const lote = await SELECT.one.from(Lotes).where({ ID: inspeccion.lote_ID })
            const rangoParam = await SELECT.one.from(ParametrosMaterial).where({ material_ID: lote.material_ID, parametro_ID })

            // Calcular cumple para parametros numericos
            if (rangoParam && valorObtenido !== null && valorObtenido !== undefined) {
                const cumple =
                    valorObtenido >= rangoParam.valorMinimo &&
                    valorObtenido <= rangoParam.valorMaximo
                req.data.cumpleVisual = cumple
            }
        })

        // ── Acción: completar inspección → cambia status y notifica al supervisor
        this.on('completarInspeccion', async (req) => {
            const { inspeccionId } = req.data

            const inspeccion = await SELECT.one.from(Inspecciones).where({ ID: inspeccionId })

            if (!inspeccion) return req.error(404, 'Inspeccion no encontrada')
            
            if (inspeccion.status_code !== 'ABIERTA') return req.error(409, 'La inspeccion ya fue completada o cancelada')
            
            // Verificar que tenga al menos un resultado
            const resultados = await SELECT.from(ResultadosInspeccion).where({ inspeccion_ID: inspeccionId })

            if (resultados.length === 0) return req.error(400, 'Debe registrar al menos un resultado antes de completar')

            // Cerrar inspeccion
            await UPDATE(Inspecciones).set({ status_code: 'COMPLETADA' }).where({ ID: inspeccionId })

            return {
                mensaje: 'Inspeccion completada. Pendiente de revision por Supervisor.',
                status: 'COMPLETADA'
            }
        })

        await super.init()
    }
}