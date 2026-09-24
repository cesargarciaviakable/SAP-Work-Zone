const cds = require('@sap/cds')

// SAFETY: force an in-memory db — see test/inspector-delete.test.js for why
// the documented `cds.test(__dirname + '/..')` pattern alone is not enough
// in this project (a persistent sqlite db is configured for [development]).
const { POST, PATCH, GET, expect, axios } = cds.test(__dirname + '/..', '--in-memory')

axios.defaults.auth = { username: 'alice', password: '' }

// Fixture IDs from db/data/lote.inspector-*.csv
const PARAM_NUMERICO_A = '00000000-0000-0000-0000-000000000301' // DIM-001, DIMENSIONAL
const PARAM_NUMERICO_B = '00000000-0000-0000-0000-000000000303' // DIM-003, DIMENSIONAL
const PARAM_NUMERICO_C = '00000000-0000-0000-0000-000000000305' // ELE-002, ELECTRICO
const PARAM_VISUAL = '00000000-0000-0000-0000-000000000307' // VIS-002, VISUAL

let contador = 0
const codigo = (prefijo) => `${prefijo}${Date.now().toString(36)}${contador++}`.slice(0, 20)

async function crearMaterialDraft(extra = {}) {
    const { data } = await POST('/config/Materiales', {
        codigo: codigo('MAT-TEST'),
        descripcion: 'Material de prueba',
        unidad: 'm',
        activo: true,
        ...extra
    })
    return data.ID
}

async function agregarRangoDraft(materialId, parametroId, extra = {}) {
    const { data } = await POST(
        `/config/Materiales(ID=${materialId},IsActiveEntity=false)/parametros`,
        { parametro_ID: parametroId, ...extra }
    )
    return data.ID
}

async function activarMaterial(materialId) {
    return POST(`/config/Materiales(ID=${materialId},IsActiveEntity=false)/ConfigService.draftActivate`, {})
}

async function crearParametroDraft(extra = {}) {
    const { data } = await POST('/config/Parametros', {
        codigo: codigo('TEST-PARAM'),
        descripcion: 'Parámetro de prueba',
        tipoParametro_code: 'DIMENSIONAL',
        unidadMedida: 'mm',
        activo: true,
        ...extra
    })
    return data.ID
}

async function activarParametro(parametroId) {
    return POST(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)/ConfigService.draftActivate`, {})
}

async function editarParametro(parametroId) {
    return POST(`/config/Parametros(ID=${parametroId},IsActiveEntity=true)/ConfigService.draftEdit`, {
        PreserveChanges: true
    })
}

// Parses the sap-messages response header CAP sets for req.info/req.warn
function mensajesDe(respuesta) {
    const header = respuesta.headers['sap-messages']
    return header ? JSON.parse(header) : []
}

// Asserts a 400 raised by the intended rule, not just any 400
async function esperarRechazo(promesa, mensaje) {
    let respuesta
    try {
        await promesa
    } catch (e) {
        respuesta = e.response
    }
    expect(respuesta, 'expected the request to be rejected with 400').to.exist
    expect(respuesta.status).to.equal(400)
    expect(respuesta.data.error.message).to.include(mensaje)
    return respuesta.data
}

describe('ConfigService', () => {

    describe('Materiales — rangos de aceptación', () => {

        it('creates ranges with only min, only max, and both min and max', async () => {
            const materialId = await crearMaterialDraft()

            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 1, valorMaximo: 5 })
            await agregarRangoDraft(materialId, PARAM_NUMERICO_B, { valorMinimo: 2 })
            await agregarRangoDraft(materialId, PARAM_NUMERICO_C, { valorMaximo: 9 })

            const { status } = await activarMaterial(materialId)
            expect(status).to.equal(201)

            const { data } = await GET(
                `/config/Materiales(ID=${materialId},IsActiveEntity=true)?$expand=parametros`
            )

            const porParametro = Object.fromEntries(data.parametros.map((p) => [p.parametro_ID, p]))
            expect(porParametro[PARAM_NUMERICO_A].valorMinimo).to.equal('1.000')
            expect(porParametro[PARAM_NUMERICO_A].valorMaximo).to.equal('5.000')
            expect(porParametro[PARAM_NUMERICO_B].valorMinimo).to.equal('2.000')
            expect(porParametro[PARAM_NUMERICO_B].valorMaximo).to.equal(null)
            expect(porParametro[PARAM_NUMERICO_C].valorMinimo).to.equal(null)
            expect(porParametro[PARAM_NUMERICO_C].valorMaximo).to.equal('9.000')
        })

        it('rejects a numeric parametro with neither valorMinimo nor valorMaximo', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A)

            await esperarRechazo(activarMaterial(materialId), 'requiere al menos un valor mínimo o un valor máximo')
        })

        it('rejects valorMinimo greater than valorMaximo', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 10, valorMaximo: 5 })

            await esperarRechazo(activarMaterial(materialId), 'no puede ser mayor que el valor máximo')
        })

        it('rejects valorMinimo or valorMaximo set on a VISUAL parametro', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_VISUAL, { valorMinimo: 1 })

            await esperarRechazo(activarMaterial(materialId), 'no puede tener valor mínimo ni máximo')
        })

        it('rejects a duplicate parametro within the same material', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 1, valorMaximo: 5 })
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 2, valorMaximo: 6 })

            await esperarRechazo(activarMaterial(materialId), 'no puede repetirse en el mismo material')
        })
    })

    describe('ParametrosMaterial — control de campo (draft)', () => {

        it('marks a new numeric parametro range as editable (esVisual false, controlRango 3)', async () => {
            const materialId = await crearMaterialDraft()

            const { data } = await POST(
                `/config/Materiales(ID=${materialId},IsActiveEntity=false)/parametros`,
                { parametro_ID: PARAM_NUMERICO_A }
            )

            expect(data.esVisual).to.equal(false)
            expect(data.controlRango).to.equal(3)
        })

        it('marks a new VISUAL parametro range as read-only (esVisual true, controlRango 1)', async () => {
            const materialId = await crearMaterialDraft()

            const { data } = await POST(
                `/config/Materiales(ID=${materialId},IsActiveEntity=false)/parametros`,
                { parametro_ID: PARAM_VISUAL }
            )

            expect(data.esVisual).to.equal(true)
            expect(data.controlRango).to.equal(1)
        })

        it('recomputes the field control live when the parametro changes on an existing draft row', async () => {
            const materialId = await crearMaterialDraft()
            const rangoId = await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 1, valorMaximo: 5 })

            const { data } = await PATCH(
                `/config/ParametrosMaterial(ID=${rangoId},IsActiveEntity=false)`,
                { parametro_ID: PARAM_VISUAL, valorMinimo: null, valorMaximo: null }
            )

            expect(data.esVisual).to.equal(true)
            expect(data.controlRango).to.equal(1)
        })

        it('reads the navigated parametro after changing a range\'s parametro, without crashing on DraftAdministrativeData', async () => {
            const materialId = await crearMaterialDraft()
            const rangoId = await agregarRangoDraft(materialId, PARAM_VISUAL)

            await PATCH(
                `/config/Materiales(ID=${materialId},IsActiveEntity=false)/parametros(ID=${rangoId},IsActiveEntity=false)`,
                { parametro_ID: PARAM_NUMERICO_A }
            )

            // Before the fix, the qm-rangos Object Page (LineItem #Rangos +
            // Common.SideEffects #Parametro) made the Fiori elements client
            // issue a nested-expand request shaped like this one — material
            // draft -> ranges -> navigated parametro, itself expanded with
            // DraftAdministrativeData because Parametros is draft-enabled —
            // and it crashed with "no such column:
            // ...DraftAdministrativeData_DraftUUID" (CAP's lean-draft SQL
            // tried to read DraftAdministrativeData off the *active*
            // Parametros table). Now that `parametro` is redirected to the
            // non-draft ParametrosVH, DraftAdministrativeData is no longer a
            // valid navigation on it at all — the client no longer asks for
            // it — so this asserts the ordinary read succeeds with the new
            // type instead.
            const { data } = await GET(
                `/config/Materiales(ID=${materialId},IsActiveEntity=false)` +
                `?$expand=parametros($expand=parametro($select=tipoParametro_code))`
            )

            const rango = data.parametros.find((p) => p.ID === rangoId)
            expect(rango.parametro.tipoParametro_code).to.equal('DIMENSIONAL')
        })
    })

    describe('ParametrosMaterial — mensajes al cambiar el parámetro (draft)', () => {

        it('clears valorMinimo/valorMaximo and informs when the parametro changes to VISUAL', async () => {
            const materialId = await crearMaterialDraft()
            const rangoId = await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 1, valorMaximo: 5 })

            const respuesta = await PATCH(
                `/config/ParametrosMaterial(ID=${rangoId},IsActiveEntity=false)`,
                { parametro_ID: PARAM_VISUAL }
            )

            expect(respuesta.data.valorMinimo).to.equal(null)
            expect(respuesta.data.valorMaximo).to.equal(null)

            const mensajes = mensajesDe(respuesta)
            expect(mensajes.some((m) => m.message.includes('valores mínimo y máximo'))).to.equal(true)
        })

        it('warns when the parametro changes to a numeric type and neither bound is set', async () => {
            const materialId = await crearMaterialDraft()
            const rangoId = await agregarRangoDraft(materialId, PARAM_VISUAL)

            const respuesta = await PATCH(
                `/config/ParametrosMaterial(ID=${rangoId},IsActiveEntity=false)`,
                { parametro_ID: PARAM_NUMERICO_A }
            )

            const mensajes = mensajesDe(respuesta)
            expect(mensajes.some((m) => m.message.includes('al menos un valor mínimo o un valor máximo'))).to.equal(true)
        })

        it('does not warn when the parametro changes to a numeric type and a bound is already set in the same request', async () => {
            const materialId = await crearMaterialDraft()
            const rangoId = await agregarRangoDraft(materialId, PARAM_VISUAL)

            const respuesta = await PATCH(
                `/config/ParametrosMaterial(ID=${rangoId},IsActiveEntity=false)`,
                { parametro_ID: PARAM_NUMERICO_A, valorMinimo: 1 }
            )

            const mensajes = mensajesDe(respuesta)
            expect(mensajes.some((m) => m.message.includes('al menos un valor mínimo'))).to.equal(false)
        })

        it('warns early on a duplicate parametro within the same material draft', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 1 })
            const rangoId = await agregarRangoDraft(materialId, PARAM_NUMERICO_B, { valorMinimo: 1 })

            const respuesta = await PATCH(
                `/config/ParametrosMaterial(ID=${rangoId},IsActiveEntity=false)`,
                { parametro_ID: PARAM_NUMERICO_A }
            )

            const mensajes = mensajesDe(respuesta)
            expect(mensajes.some((m) => m.message.includes('no puede repetirse en el mismo material'))).to.equal(true)
        })
    })

    describe('Parametros — catálogo', () => {

        it('creates and edits a parametro', async () => {
            const parametroId = await crearParametroDraft({ descripcion: 'Descripción original' })
            await activarParametro(parametroId)

            await editarParametro(parametroId)
            await PATCH(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)`, {
                descripcion: 'Descripción editada'
            })
            await POST(
                `/config/Parametros(ID=${parametroId},IsActiveEntity=false)/ConfigService.draftActivate`,
                {}
            )

            const { data } = await GET(`/config/Parametros(ID=${parametroId},IsActiveEntity=true)`)
            expect(data.descripcion).to.equal('Descripción editada')
        })

        it('rejects a duplicate codigo', async () => {
            const codigoDuplicado = codigo('TEST-DUP')
            const primeroId = await crearParametroDraft({ codigo: codigoDuplicado })
            await activarParametro(primeroId)

            const segundoId = await crearParametroDraft({ codigo: codigoDuplicado })
            await esperarRechazo(activarParametro(segundoId), 'Ya existe un parámetro con el código')
        })

        it('rejects switching tipoParametro to VISUAL when the parametro already has ranges', async () => {
            const parametroId = await crearParametroDraft({ tipoParametro_code: 'DIMENSIONAL' })
            await activarParametro(parametroId)

            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, parametroId, { valorMinimo: 1, valorMaximo: 5 })
            await activarMaterial(materialId)

            await editarParametro(parametroId)
            await PATCH(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)`, {
                tipoParametro_code: 'VISUAL'
            })

            await esperarRechazo(
                POST(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)/ConfigService.draftActivate`, {}),
                'No se puede cambiar entre tipo visual y numérico'
            )
        })

        it('rejects switching an in-use VISUAL parametro to a numeric type', async () => {
            const parametroId = await crearParametroDraft({ tipoParametro_code: 'VISUAL', unidadMedida: null })
            await activarParametro(parametroId)

            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, parametroId)
            await activarMaterial(materialId)

            await editarParametro(parametroId)
            await PATCH(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)`, {
                tipoParametro_code: 'DIMENSIONAL'
            })

            await esperarRechazo(activarParametro(parametroId), 'No se puede cambiar entre tipo visual y numérico')
        })

        it('allows switching between numeric types while in use', async () => {
            const parametroId = await crearParametroDraft({ tipoParametro_code: 'DIMENSIONAL' })
            await activarParametro(parametroId)

            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, parametroId, { valorMinimo: 1 })
            await activarMaterial(materialId)

            await editarParametro(parametroId)
            await PATCH(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)`, {
                tipoParametro_code: 'ELECTRICO'
            })
            await activarParametro(parametroId)

            const { data } = await GET(`/config/Parametros(ID=${parametroId},IsActiveEntity=true)`)
            expect(data.tipoParametro_code).to.equal('ELECTRICO')
        })

        it('allows editing a VISUAL parametro that is already used by a material', async () => {
            const parametroId = await crearParametroDraft({ tipoParametro_code: 'VISUAL', unidadMedida: null })
            await activarParametro(parametroId)

            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, parametroId)
            await activarMaterial(materialId)

            await editarParametro(parametroId)
            await PATCH(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)`, {
                descripcion: 'Descripción visual editada'
            })
            await activarParametro(parametroId)

            const { data } = await GET(`/config/Parametros(ID=${parametroId},IsActiveEntity=true)`)
            expect(data.descripcion).to.equal('Descripción visual editada')
        })

        it('clears unidadMedida and informs when the tipoParametro switches to VISUAL', async () => {
            const parametroId = await crearParametroDraft({ tipoParametro_code: 'DIMENSIONAL', unidadMedida: 'mm' })
            await activarParametro(parametroId)
            await editarParametro(parametroId)

            const respuesta = await PATCH(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)`, {
                tipoParametro_code: 'VISUAL'
            })

            expect(respuesta.data.unidadMedida).to.equal(null)

            const mensajes = mensajesDe(respuesta)
            expect(mensajes.some((m) => m.message.includes('unidad de medida'))).to.equal(true)

            // Also enforced at activation, even if the client bypassed the
            // live PATCH hint above.
            await POST(
                `/config/Parametros(ID=${parametroId},IsActiveEntity=false)/ConfigService.draftActivate`,
                {}
            )

            const { data } = await GET(`/config/Parametros(ID=${parametroId},IsActiveEntity=true)`)
            expect(data.unidadMedida).to.equal(null)
        })

        it('saves a newly created VISUAL parametro with unidadMedida as null', async () => {
            const parametroId = await crearParametroDraft({ tipoParametro_code: 'VISUAL', unidadMedida: 'mm' })
            await activarParametro(parametroId)

            const { data } = await GET(`/config/Parametros(ID=${parametroId},IsActiveEntity=true)`)
            expect(data.unidadMedida).to.equal(null)
        })
    })

    describe('Access control', () => {

        it('rejects an Inspector (bob) with 403', async () => {
            try {
                await GET('/config/Materiales', { auth: { username: 'bob', password: '' } })
                expect.fail('expected 403')
            } catch (e) {
                expect(e.response.status).to.equal(403)
            }
        })
    })

    describe('UI annotations — qm-rangos/qm-parametros metadata', () => {

        it('exposes the field control and side-effects terms the apps rely on', async () => {
            const { data } = await GET('/config/$metadata')

            // valorMinimo/valorMaximo become read-only when controlRango says so
            expect(data).to.match(/Target="ConfigService\.ParametrosMaterial\/valorMinimo"[\s\S]*?FieldControl" Path="controlRango"/)
            expect(data).to.match(/Target="ConfigService\.ParametrosMaterial\/valorMaximo"[\s\S]*?FieldControl" Path="controlRango"/)

            // changing the parametro refreshes the derived field control
            expect(data).to.include('Term="Common.SideEffects" Qualifier="Parametro"')
            expect(data).to.include('<String>esVisual</String>')
            expect(data).to.include('<String>controlRango</String>')

            // value help for parametro on the range row
            expect(data).to.include('Property="CollectionPath" String="ParametrosVH"')
        })
    })
})
