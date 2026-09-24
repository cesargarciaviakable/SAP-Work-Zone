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

async function esperarRechazo(promesa) {
    try {
        await promesa
        expect.fail('expected the request to be rejected with 400')
    } catch (e) {
        expect(e.response.status).to.equal(400)
        return e.response.data
    }
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

            await esperarRechazo(activarMaterial(materialId))
        })

        it('rejects valorMinimo greater than valorMaximo', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 10, valorMaximo: 5 })

            await esperarRechazo(activarMaterial(materialId))
        })

        it('rejects valorMinimo or valorMaximo set on a VISUAL parametro', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_VISUAL, { valorMinimo: 1 })

            await esperarRechazo(activarMaterial(materialId))
        })

        it('rejects a duplicate parametro within the same material', async () => {
            const materialId = await crearMaterialDraft()
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 1, valorMaximo: 5 })
            await agregarRangoDraft(materialId, PARAM_NUMERICO_A, { valorMinimo: 2, valorMaximo: 6 })

            await esperarRechazo(activarMaterial(materialId))
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
            await esperarRechazo(activarParametro(segundoId))
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
                POST(`/config/Parametros(ID=${parametroId},IsActiveEntity=false)/ConfigService.draftActivate`, {})
            )
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
            expect(data).to.include('Property="CollectionPath" String="Parametros"')
        })
    })
})
