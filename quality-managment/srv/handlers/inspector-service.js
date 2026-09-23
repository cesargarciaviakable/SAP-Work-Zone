const cds = require('@sap/cds')
const { SELECT, UPDATE } = cds.ql

module.exports = class InspectorService extends cds.ApplicationService {

    async init() {

        const {
            Lotes,
            Inspecciones,
            ResultadosInspeccion,
            ParametrosMaterial
        } = this.entities


        // Returns true/false when the value can be checked against the
        // material range, or undefined when there is nothing to compare
        const calcularCumple = async (materialId, parametroId, valor) => {

            if (!materialId || !parametroId || valor === null || valor === undefined) return

            const rango = await SELECT.one
                .from(ParametrosMaterial)
                .columns('valorMinimo', 'valorMaximo')
                .where({
                    material_ID: materialId,
                    parametro_ID: parametroId
                })

            if (!rango) return

            const v = Number(valor)
            const min = rango.valorMinimo ?? -Infinity
            const max = rango.valorMaximo ?? Infinity

            return v >= Number(min) && v <= Number(max)
        }


        // Rejects draft edits on inspections that are no longer ABIERTA
        const assertInspeccionAbierta = async (req, inspeccionId) => {

            const inspeccion = await SELECT.one
                .from(Inspecciones.drafts)
                .columns('status_code')
                .where({
                    ID: inspeccionId
                })

            if (inspeccion && inspeccion.status_code !== 'ABIERTA') {
                return req.error(
                    409,
                    `La inspección está ${inspeccion.status_code} y ya no puede modificarse`
                )
            }
        }

        const mismoValor = (a, b) => (a ?? null) === (b ?? null)
        const mismoNumero = (a, b) => (a ?? null) === null || (b ?? null) === null
            ? mismoValor(a, b)
            : Number(a) === Number(b)
        const mismaFecha = (a, b) => (a ?? null) === null || (b ?? null) === null
            ? mismoValor(a, b)
            : new Date(a).getTime() === new Date(b).getTime()

        // True when the incoming deep data changes a persisted inspection
        const inspeccionModificada = (guardada, entrante) => {

            if (
                !mismoValor(guardada.status_code, entrante.status_code) ||
                !mismoValor(guardada.observaciones, entrante.observaciones) ||
                !mismaFecha(guardada.fechaInspeccion, entrante.fechaInspeccion)
            ) return true

            // Resultados omitted from the payload are left untouched
            if (!entrante.resultados) return false

            if (guardada.resultados.length !== entrante.resultados.length) return true

            return guardada.resultados.some((r) => {
                const e = entrante.resultados.find((x) => x.ID === r.ID)
                return !e ||
                    !mismoValor(r.parametro_ID, e.parametro_ID) ||
                    !mismoNumero(r.valorObtenido, e.valorObtenido) ||
                    !mismoValor(r.cumpleVisual, e.cumpleVisual) ||
                    !mismoValor(r.observacion, e.observacion)
            })
        }


        // ═════════════════════════════════════════════════════
        // LOTES
        // Draft activation sends the whole document (lote +
        // inspecciones + resultados) as a deep CREATE/UPDATE on
        // the root, so child handlers never run: all derivations
        // live here.
        // ═════════════════════════════════════════════════════

        this.before(['CREATE', 'UPDATE'], Lotes, async (req) => {

            const lote = req.data

            const actual = req.event === 'UPDATE'
                ? await SELECT.one
                    .from(Lotes)
                    .columns('material_ID', 'status_code')
                    .where({ ID: lote.ID ?? req.params.at(-1)?.ID })
                : undefined

            const materialId = lote.material_ID ?? actual?.material_ID

            // Material → Unidad automáticamente
            if (lote.material_ID) {

                const material = await SELECT.one
                    .from('lote.inspector.Materiales')
                    .columns('unidad')
                    .where({
                        ID: lote.material_ID
                    })

                if (!material) {
                    return req.error(
                        404,
                        'Material no encontrado'
                    )
                }

                lote.unidad = material.unidad
            }

            const inspecciones = lote.inspecciones ?? []

            // Inspecciones no ABIERTAS son inmutables. This is the real
            // guard: it also catches a stale draft saved after the
            // inspection was completed by completarInspeccion.
            if (req.event === 'UPDATE' && lote.inspecciones) {

                const cerradas = await SELECT
                    .from(Inspecciones, (i) => {
                        i.ID, i.status_code, i.fechaInspeccion, i.observaciones,
                        i.resultados((r) => {
                            r.ID, r.parametro_ID, r.valorObtenido, r.cumpleVisual, r.observacion
                        })
                    })
                    .where({ lote_ID: lote.ID ?? req.params.at(-1)?.ID })
                    .and('status_code !=', 'ABIERTA')

                for (const guardada of cerradas) {

                    const entrante = inspecciones.find((i) => i.ID === guardada.ID)

                    if (!entrante) {
                        return req.error(
                            409,
                            `No se puede eliminar una inspección en status ${guardada.status_code}`
                        )
                    }

                    if (inspeccionModificada(guardada, entrante)) {
                        return req.error(
                            409,
                            `La inspección está ${guardada.status_code} y ya no puede modificarse. Descarta el borrador y vuelve a editar el lote.`
                        )
                    }
                }
            }

            // cumpleVisual se calcula comparando vs ParametrosMaterial
            for (const inspeccion of inspecciones) {
                if ((inspeccion.status_code ?? 'ABIERTA') !== 'ABIERTA') continue
                for (const resultado of inspeccion.resultados ?? []) {

                    const cumple = await calcularCumple(
                        materialId,
                        resultado.parametro_ID,
                        resultado.valorObtenido
                    )

                    if (cumple !== undefined) resultado.cumpleVisual = cumple
                }
            }

            // PENDIENTE → EN_INSPECCION cuando existe una inspección abierta
            const statusActual = actual?.status_code ?? lote.status_code ?? 'PENDIENTE'

            const tieneAbierta = inspecciones.some(
                (i) => (i.status_code ?? 'ABIERTA') === 'ABIERTA'
            )

            if (statusActual === 'PENDIENTE' && tieneAbierta) {
                lote.status_code = 'EN_INSPECCION'
            }
        })


        // Live unidad while editing the draft — paired with
        // @Common.SideEffects #Material in the app annotations
        this.before(['NEW', 'PATCH'], Lotes.drafts, async (req) => {

            if (!req.data.material_ID) return

            const material = await SELECT.one
                .from('lote.inspector.Materiales')
                .columns('unidad')
                .where({
                    ID: req.data.material_ID
                })

            if (material) req.data.unidad = material.unidad
        })


        // ═════════════════════════════════════════════════════
        // CREAR INSPECCIÓN (draft)
        // Immediate feedback when the inspector adds a row in the UI
        // ═════════════════════════════════════════════════════

        this.before('NEW', Inspecciones.drafts, async (req) => {

            const loteId = req.data.lote_ID ?? req.params.at(-1)?.ID

            const lote = await SELECT.one
                .from(Lotes.drafts)
                .columns('status_code')
                .where({
                    ID: loteId
                })

            if (lote && lote.status_code !== 'PENDIENTE') {
                return req.error(
                    409,
                    `El lote no puede inspeccionarse en status: ${lote.status_code}`
                )
            }

            const abiertas = await SELECT.one
                .from(Inspecciones.drafts)
                .columns('count(1) as total')
                .where({
                    lote_ID: loteId
                })

            if (abiertas?.total > 0) {
                return req.error(
                    409,
                    'El lote ya tiene una inspección en proceso'
                )
            }

            req.data.fechaInspeccion ??= new Date().toISOString()

            // Calculated columns are stored in the drafts table and
            // start as null for new rows
            req.data.esEditable = true
            req.data.controlCampo = 3
            req.data.controlObligatorio = 7
        })


        // ═════════════════════════════════════════════════════
        // INSPECCIONES CERRADAS (draft)
        // Immediate feedback; the activation check above is the
        // authoritative one
        // ═════════════════════════════════════════════════════

        this.before(['PATCH', 'DELETE'], Inspecciones.drafts, (req) =>
            assertInspeccionAbierta(req, req.data.ID ?? req.params.at(-1)?.ID)
        )

        this.before('NEW', ResultadosInspeccion.drafts, (req) =>
            assertInspeccionAbierta(req, req.data.inspeccion_ID ?? req.params.at(-1)?.ID)
        )

        this.before(['PATCH', 'DELETE'], ResultadosInspeccion.drafts, async (req) => {

            const resultado = await SELECT.one
                .from(ResultadosInspeccion.drafts)
                .columns('inspeccion_ID')
                .where({
                    ID: req.data.ID ?? req.params.at(-1)?.ID
                })

            if (resultado) return assertInspeccionAbierta(req, resultado.inspeccion_ID)
        })


        // ═════════════════════════════════════════════════════
        // RESULTADO (draft)
        // Live cumpleVisual while editing — paired with
        // @Common.SideEffects in the app annotations
        // ═════════════════════════════════════════════════════

        this.before('PATCH', ResultadosInspeccion.drafts, async (req) => {

            if (!('valorObtenido' in req.data) && !('parametro_ID' in req.data)) return

            const draft = await SELECT.one
                .from(ResultadosInspeccion.drafts)
                .columns('parametro_ID', 'valorObtenido', 'inspeccion_ID')
                .where({
                    ID: req.data.ID ?? req.params.at(-1)?.ID
                })

            if (!draft) return

            const inspeccion = await SELECT.one
                .from(Inspecciones.drafts)
                .columns('lote_ID')
                .where({
                    ID: draft.inspeccion_ID
                })

            const lote = inspeccion && await SELECT.one
                .from(Lotes.drafts)
                .columns('material_ID')
                .where({
                    ID: inspeccion.lote_ID
                })

            const cumple = await calcularCumple(
                lote?.material_ID,
                req.data.parametro_ID ?? draft.parametro_ID,
                'valorObtenido' in req.data ? req.data.valorObtenido : draft.valorObtenido
            )

            if (cumple !== undefined) req.data.cumpleVisual = cumple
        })


        // ═════════════════════════════════════════════════════
        // COMPLETAR INSPECCIÓN (bound action)
        // ═════════════════════════════════════════════════════

        this.on('completarInspeccion', Inspecciones, async (req) => {

            const { ID } = req.params.at(-1)

            const inspeccion = await SELECT.one
                .from(Inspecciones)
                .where({
                    ID
                })

            if (!inspeccion) {
                return req.error(
                    404,
                    'Inspección no encontrada'
                )
            }

            if (inspeccion.status_code !== 'ABIERTA') {
                return req.error(
                    409,
                    'La inspección ya fue completada o cancelada'
                )
            }

            const resultados = await SELECT
                .from(ResultadosInspeccion)
                .where({
                    inspeccion_ID: ID
                })

            if (resultados.length === 0) {
                return req.error(
                    400,
                    'Debe registrar al menos un resultado antes de completar'
                )
            }

            await UPDATE(Inspecciones)
                .set({
                    status_code: 'COMPLETADA'
                })
                .where({
                    ID
                })

            return {
                mensaje:
                    'Inspección completada. Pendiente de revisión por Supervisor.',
                status: 'COMPLETADA'
            }
        })


        await super.init()
    }
}
