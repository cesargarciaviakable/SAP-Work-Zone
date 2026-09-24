const cds = require('@sap/cds')
const { SELECT } = cds.ql

module.exports = class ConfigService extends cds.ApplicationService {

    async init() {

        const { Materiales, Parametros, ParametrosMaterial } = this.entities

        const TIPO_VISUAL = 'VISUAL'

        const tieneValor = (v) => v !== null && v !== undefined

        // Materiales come from the master data: codigo, descripcion, unidad
        // and activo are never editable through this service (only their
        // ranges are, via the parametros composition). See the @readonly
        // comment in srv/config-service.cds for why this is enforced here
        // instead of relying on the annotation alone.
        const CAMPOS_MAESTRO = ['codigo', 'descripcion', 'unidad', 'activo']
        const ignorarCambiosDeMaestro = (data) => {
            for (const campo of CAMPOS_MAESTRO) delete data[campo]
        }

        // ═════════════════════════════════════════════════════
        // MATERIALES — solo mantenimiento de rangos (T10)
        // Los materiales ya no se crean ni se eliminan desde esta
        // app: vienen del maestro de materiales.
        //
        // Enforced via @Capabilities.InsertRestrictions.Insertable: false
        // and @Capabilities.DeleteRestrictions.Deletable: false on
        // ConfigService.Materiales (see app/qm-rangos/annotations.cds,
        // which also carries UI.CreateHidden/DeleteHidden for the Fiori
        // app). These are CAP's own generic checks — libx runtime rejects
        // with 405 before any custom handler runs, both for a plain
        // CREATE/DELETE and for a draft NEW (POST /config/Materiales) —
        // so no extra `before` handler is needed here. Discarding an
        // in-progress draft edit (DELETE with IsActiveEntity=false) stays
        // allowed: CAP maps that to the separate 'CANCEL' event, which
        // DeleteRestrictions does not cover.

        // Live edit on the draft header: silently ignore any attempt to
        // change master-data fields while the ranges are being edited.
        this.before('PATCH', Materiales.drafts, (req) => {
            ignorarCambiosDeMaestro(req.data)
        })

        // ═════════════════════════════════════════════════════
        // MATERIALES — rangos de aceptación
        // Draft activation sends the whole document (material +
        // parametros) as a deep CREATE/UPDATE on the root, so
        // child handlers never run: all validations live here
        // (mirrors srv/handlers/inspector-service.js Lotes).
        // ═════════════════════════════════════════════════════

        this.before(['CREATE', 'UPDATE'], Materiales, async (req) => {

            // Defense in depth: also strip master-data fields at activation
            // time, regardless of what made it into the draft.
            ignorarCambiosDeMaestro(req.data)

            const rangos = req.data.parametros ?? []
            if (rangos.length === 0) return

            const parametroIds = [...new Set(rangos.map((r) => r.parametro_ID).filter(Boolean))]

            const tipos = await SELECT
                .from(Parametros)
                .columns('ID', 'tipoParametro_code')
                .where({ ID: parametroIds })

            const tipoPorParametro = new Map(tipos.map((p) => [p.ID, p.tipoParametro_code]))

            const vistos = new Set()

            for (const [i, rango] of rangos.entries()) {

                if (!rango.parametro_ID) continue

                if (vistos.has(rango.parametro_ID)) {
                    return req.error({
                        code: 400,
                        message: 'El parámetro no puede repetirse en el mismo material',
                        target: `parametros[${i}]/parametro_ID`
                    })
                }
                vistos.add(rango.parametro_ID)

                const esVisual = tipoPorParametro.get(rango.parametro_ID) === TIPO_VISUAL
                const tieneMinimo = tieneValor(rango.valorMinimo)
                const tieneMaximo = tieneValor(rango.valorMaximo)

                if (esVisual) {
                    if (tieneMinimo || tieneMaximo) {
                        return req.error({
                            code: 400,
                            message: 'Un parámetro visual no puede tener valor mínimo ni máximo',
                            target: `parametros[${i}]/valorMinimo`
                        })
                    }
                    continue
                }

                if (!tieneMinimo && !tieneMaximo) {
                    return req.error({
                        code: 400,
                        message: 'Un parámetro numérico requiere al menos un valor mínimo o un valor máximo',
                        target: `parametros[${i}]/valorMinimo`
                    })
                }

                if (tieneMinimo && tieneMaximo && Number(rango.valorMinimo) > Number(rango.valorMaximo)) {
                    return req.error({
                        code: 400,
                        message: 'El valor mínimo no puede ser mayor que el valor máximo',
                        target: `parametros[${i}]/valorMinimo`
                    })
                }
            }
        })


        // ═════════════════════════════════════════════════════
        // RANGOS (draft) — feedback en vivo al cambiar el parámetro
        // Non-blocking hints while the row is still being edited;
        // the authoritative rejections stay in the Materiales
        // handler above, run at activation.
        // ═════════════════════════════════════════════════════

        this.before('PATCH', ParametrosMaterial.drafts, async (req) => {

            if (!('parametro_ID' in req.data)) return

            const rowId = req.data.ID ?? req.params.at(-1)?.ID

            const draft = await SELECT.one
                .from(ParametrosMaterial.drafts)
                .columns('material_ID', 'parametro_ID', 'valorMinimo', 'valorMaximo')
                .where({ ID: rowId })

            if (!draft) return

            const nuevoParametroId = req.data.parametro_ID

            if (nuevoParametroId && draft.material_ID) {

                const duplicado = await SELECT.one
                    .from(ParametrosMaterial.drafts)
                    .columns('ID')
                    .where({ material_ID: draft.material_ID, parametro_ID: nuevoParametroId })
                    .and('ID !=', rowId)

                if (duplicado) {
                    req.warn({
                        message: 'El parámetro no puede repetirse en el mismo material',
                        target: 'parametro_ID'
                    })
                }
            }

            if (nuevoParametroId === draft.parametro_ID) return

            const parametro = await SELECT.one
                .from(Parametros)
                .columns('tipoParametro_code')
                .where({ ID: nuevoParametroId })

            if (parametro?.tipoParametro_code === TIPO_VISUAL) {

                req.data.valorMinimo = null
                req.data.valorMaximo = null

                req.info({
                    message: 'Se eliminaron los valores mínimo y máximo porque el parámetro es visual',
                    target: 'valorMinimo'
                })

                return
            }

            const tieneMinimo = tieneValor('valorMinimo' in req.data ? req.data.valorMinimo : draft.valorMinimo)
            const tieneMaximo = tieneValor('valorMaximo' in req.data ? req.data.valorMaximo : draft.valorMaximo)

            if (!tieneMinimo && !tieneMaximo) {
                req.warn({
                    message: 'Define al menos un valor mínimo o un valor máximo para este parámetro',
                    target: 'valorMinimo'
                })
            }
        })


        // ═════════════════════════════════════════════════════
        // PARAMETROS — catálogo
        // ═════════════════════════════════════════════════════

        this.before(['CREATE', 'UPDATE'], Parametros, async (req) => {

            const id = req.data.ID ?? req.params.at(-1)?.ID

            // A VISUAL parametro never has a unidad de medida: enforced here
            // (activation resends the full row) and live on the draft PATCH
            // below.
            if (req.data.tipoParametro_code === TIPO_VISUAL) {
                req.data.unidadMedida = null
            }

            if (req.data.codigo) {

                const existentes = await SELECT
                    .from(Parametros)
                    .columns('ID')
                    .where({ codigo: req.data.codigo })

                if (existentes.some((p) => p.ID !== id)) {
                    return req.error({
                        code: 400,
                        message: `Ya existe un parámetro con el código ${req.data.codigo}`,
                        target: 'codigo'
                    })
                }
            }

            // Switching an in-use parametro between VISUAL and numeric is
            // rejected in both directions: numeric ranges would become invalid
            // on a VISUAL parametro, and range-less VISUAL rows would become
            // invalid numeric ranges. Switching between numeric types is fine.
            // Draft activation resends the full row, so only an actual change
            // of category counts: unchanged parametros stay editable.
            if (req.event === 'UPDATE' && 'tipoParametro_code' in req.data) {

                const actual = await SELECT.one
                    .from(Parametros)
                    .columns('tipoParametro_code')
                    .where({ ID: id })

                const eraVisual = actual?.tipoParametro_code === TIPO_VISUAL
                const seraVisual = req.data.tipoParametro_code === TIPO_VISUAL

                if (!actual || eraVisual === seraVisual) return

                const enUso = await SELECT.one
                    .from(ParametrosMaterial)
                    .columns('ID')
                    .where({ parametro_ID: id })

                if (enUso) {
                    return req.error({
                        code: 400,
                        message: 'No se puede cambiar entre tipo visual y numérico un parámetro que ya está asignado a algún material',
                        target: 'tipoParametro_code'
                    })
                }
            }
        })


        // ═════════════════════════════════════════════════════
        // PARAMETROS (draft) — feedback en vivo al cambiar el tipo
        // ═════════════════════════════════════════════════════

        this.before('PATCH', Parametros.drafts, async (req) => {

            if (req.data.tipoParametro_code !== TIPO_VISUAL) return

            const id = req.data.ID ?? req.params.at(-1)?.ID

            const draft = await SELECT.one
                .from(Parametros.drafts)
                .columns('tipoParametro_code')
                .where({ ID: id })

            if (!draft || draft.tipoParametro_code === TIPO_VISUAL) return

            req.data.unidadMedida = null

            req.info({
                message: 'Se eliminó la unidad de medida porque el parámetro es visual',
                target: 'unidadMedida'
            })
        })

        await super.init()
    }
}
