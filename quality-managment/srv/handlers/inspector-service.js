const cds = require('@sap/cds')
const { SELECT, UPDATE } = cds.ql

module.exports = class InspectorService extends cds.ApplicationService {

    async init() {

        const {
            Lotes,
            Inspecciones,
            ResultadosInspeccion,
            ParametrosMaterial,
            Parametros
        } = this.entities

        const TIPO_VISUAL = 'VISUAL'


        // Server-owned pass/fail for a resultado, aware of the parameter type:
        //  - { tipoVisual: true }                     → VISUAL: cumpleVisual is user-owned,
        //                                                 the server must never touch it
        //  - { tipoVisual: false, cumple: true|false } → numeric: value inside/outside range
        //  - { tipoVisual: false, cumple: null }       → numeric: no range or no value yet
        //  - {} when there is no parametro to evaluate yet
        const evaluarCumplimiento = async (materialId, parametroId, valorObtenido) => {

            if (!parametroId) return {}

            const parametro = await SELECT.one
                .from(Parametros)
                .columns('tipoParametro_code')
                .where({ ID: parametroId })

            if (parametro?.tipoParametro_code === TIPO_VISUAL) return { tipoVisual: true }

            if (!materialId || valorObtenido === null || valorObtenido === undefined) {
                return { tipoVisual: false, cumple: null }
            }

            const rango = await SELECT.one
                .from(ParametrosMaterial)
                .columns('valorMinimo', 'valorMaximo')
                .where({
                    material_ID: materialId,
                    parametro_ID: parametroId
                })

            if (!rango) return { tipoVisual: false, cumple: null }

            const v = Number(valorObtenido)
            const min = rango.valorMinimo ?? -Infinity
            const max = rango.valorMaximo ?? Infinity

            return { tipoVisual: false, cumple: v >= Number(min) && v <= Number(max) }
        }


        // Applies cumpleVisual + the UI field-control/criticality calculated
        // columns onto a ResultadosInspeccion.drafts payload. These are
        // literal columns on the drafts table — unlike the active entity,
        // where they are recomputed on every read (see inspector-service.cds)
        // — so they must be maintained by hand on every NEW/PATCH.
        const aplicarControlesDraft = (data, { tipoVisual, cumple } = {}, cumpleVisualPrevio, parametroCambio = false) => {

            if (tipoVisual === undefined) {
                data.esVisual = false
                data.controlValorObtenido = 3
                data.controlCumpleVisual = 1
                data.criticidad = 0
                return
            }

            data.esVisual = tipoVisual
            data.controlValorObtenido = tipoVisual ? 1 : 3
            data.controlCumpleVisual = tipoVisual ? 3 : 1

            if (!tipoVisual) {
                // Numeric: the server always owns cumpleVisual, a stale/forged
                // client value must never persist.
                data.cumpleVisual = cumple ?? null
            } else if (parametroCambio && !('cumpleVisual' in data)) {
                // VISUAL, and this PATCH just switched the parametro away
                // from a numeric one (R3-param-switch-stale-cumple): a
                // leftover server-computed cumpleVisual must not survive
                // the switch and be mistaken for a user choice. An
                // explicit cumpleVisual sent in the same PATCH wins.
                data.cumpleVisual = null
            }

            const cumpleFinal = 'cumpleVisual' in data ? data.cumpleVisual : cumpleVisualPrevio
            data.criticidad = cumpleFinal === true ? 3 : cumpleFinal === false ? 1 : 0
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

            // cumpleVisual: VISUAL is user-owned and never touched here;
            // numeric is always recomputed from ParametrosMaterial, so a
            // stale or forged client value can never persist.
            for (const inspeccion of inspecciones) {
                if ((inspeccion.status_code ?? 'ABIERTA') !== 'ABIERTA') continue
                for (const resultado of inspeccion.resultados ?? []) {

                    const { tipoVisual, cumple } = await evaluarCumplimiento(
                        materialId,
                        resultado.parametro_ID,
                        resultado.valorObtenido
                    )

                    if (tipoVisual === false) resultado.cumpleVisual = cumple ?? null
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


        // Rejects deleting a lote that has a non-ABIERTA (already worked)
        // inspección: the composition would otherwise cascade-delete it,
        // bypassing the Inspecciones DELETE grant (only ABIERTA
        // inspecciones may be deleted directly). R3-lote-delete-cascade.
        this.before('DELETE', Lotes, async (req) => {

            const loteId = req.params.at(-1)?.ID

            const noAbiertas = await SELECT.one
                .from(Inspecciones)
                .columns('count(1) as total')
                .where({ lote_ID: loteId })
                .and('status_code !=', 'ABIERTA')

            if (noAbiertas?.total > 0) {
                return req.error(
                    409,
                    'No se puede eliminar un lote con inspecciones completadas'
                )
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

        this.before('NEW', ResultadosInspeccion.drafts, async (req) => {

            const inspeccionId = req.data.inspeccion_ID ?? req.params.at(-1)?.ID

            const invalida = await assertInspeccionAbierta(req, inspeccionId)
            if (invalida) return

            const inspeccion = await SELECT.one
                .from(Inspecciones.drafts)
                .columns('lote_ID')
                .where({
                    ID: inspeccionId
                })

            const lote = inspeccion && await SELECT.one
                .from(Lotes.drafts)
                .columns('material_ID')
                .where({
                    ID: inspeccion.lote_ID
                })

            const resultado = await evaluarCumplimiento(
                lote?.material_ID,
                req.data.parametro_ID,
                req.data.valorObtenido
            )

            aplicarControlesDraft(req.data, resultado)
        })

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

            const camposRelevantes = ['valorObtenido', 'parametro_ID', 'cumpleVisual']
            if (!camposRelevantes.some((campo) => campo in req.data)) return

            const draft = await SELECT.one
                .from(ResultadosInspeccion.drafts)
                .columns('parametro_ID', 'valorObtenido', 'cumpleVisual', 'inspeccion_ID')
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

            const parametroId = req.data.parametro_ID ?? draft.parametro_ID
            const valorObtenido = 'valorObtenido' in req.data ? req.data.valorObtenido : draft.valorObtenido
            const parametroCambio = 'parametro_ID' in req.data && req.data.parametro_ID !== draft.parametro_ID

            const resultado = await evaluarCumplimiento(lote?.material_ID, parametroId, valorObtenido)

            aplicarControlesDraft(req.data, resultado, draft.cumpleVisual, parametroCambio)
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
