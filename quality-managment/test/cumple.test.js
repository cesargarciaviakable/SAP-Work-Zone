const cds = require('@sap/cds')
const { INSERT, SELECT } = cds.ql

// SAFETY: force an in-memory db — see test/inspector-delete.test.js for why
// the documented `cds.test(__dirname + '/..')` pattern alone is not enough
// in this project (a persistent sqlite db is configured for [development]).
const test = cds.test(__dirname + '/..', '--in-memory')
const { POST, PATCH, GET, expect, axios } = test

axios.defaults.auth = { username: 'bob', password: '' }

// Fixture IDs from db/data/lote.inspector-*.csv
const LINEA = '00000000-0000-0000-0000-000000000201'

const MATERIAL_CON_RANGO = '00000000-0000-0000-0000-000000000101' // MAT-001
const MATERIAL_PARA_RANGOS_PARCIALES = '00000000-0000-0000-0000-000000000102' // MAT-002

const PARAM_NUMERICO = '00000000-0000-0000-0000-000000000301' // DIM-001, rango 3.200-3.400 en MATERIAL_CON_RANGO
const PARAM_VISUAL = '00000000-0000-0000-0000-000000000307' // VIS-002

// Not mapped to MATERIAL_PARA_RANGOS_PARCIALES in the CSV fixtures — the
// ParametrosMaterial rows below (one bound each) are inserted by this suite.
const PARAM_SOLO_MINIMO = '00000000-0000-0000-0000-000000000303' // DIM-003
const PARAM_SOLO_MAXIMO = '00000000-0000-0000-0000-000000000305' // ELE-002

let contador = 0
const numeroLote = () => `TEST-CUMPLE-${Date.now()}-${contador++}`

// Creates a Lote draft with a single ABIERTA Inspeccion and returns both IDs
async function crearLoteConInspeccionAbierta(materialId) {
    const { data: lote } = await POST('/inspector/Lotes', {
        numeroLote: numeroLote(),
        material_ID: materialId,
        lineaProduccion_ID: LINEA,
        turno_code: 'M',
        cantidad: 100,
        fechaProduccion: '2026-09-24',
        inspecciones: [{ fechaInspeccion: new Date().toISOString() }]
    })

    const { data: leido } = await GET(
        `/inspector/Lotes(ID=${lote.ID},IsActiveEntity=false)?$expand=inspecciones`
    )

    return { loteId: lote.ID, inspeccionId: leido.inspecciones[0].ID }
}

async function crearResultadoDraft(inspeccionId, parametroId, extra = {}) {
    const { data } = await POST(
        `/inspector/Inspecciones(ID=${inspeccionId},IsActiveEntity=false)/resultados`,
        { parametro_ID: parametroId, ...extra }
    )
    return data.ID
}

const resultadoDraft = (id) => `/inspector/ResultadosInspeccion(ID=${id},IsActiveEntity=false)`
const resultadoActivo = (id) => `/inspector/ResultadosInspeccion(ID=${id},IsActiveEntity=true)`

async function activarLote(loteId) {
    return POST(`/inspector/Lotes(ID=${loteId},IsActiveEntity=false)/InspectorService.draftActivate`, {})
}

// Extra ranges not present in the CSV fixtures, needed to exercise a
// single-bound range (only valorMinimo / only valorMaximo)
before(async () => {
    // Wait for cds.test()'s own server-start hook to finish (deploying the
    // in-memory db from the CSV fixtures) before writing to it — otherwise
    // this insert races the server bootstrap and gets wiped by it.
    await test

    const db = await cds.connect.to('db')
    await db.run(
        INSERT.into('lote.inspector.ParametrosMaterial').entries([
            {
                ID: cds.utils.uuid(),
                material_ID: MATERIAL_PARA_RANGOS_PARCIALES,
                parametro_ID: PARAM_SOLO_MINIMO,
                valorMinimo: 95,
                valorMaximo: null
            }
        ])
    )
    await db.run(
        INSERT.into('lote.inspector.ParametrosMaterial').entries([
            {
                ID: cds.utils.uuid(),
                material_ID: MATERIAL_PARA_RANGOS_PARCIALES,
                parametro_ID: PARAM_SOLO_MAXIMO,
                valorMinimo: null,
                valorMaximo: 2.5
            }
        ])
    )
})

describe('InspectorService - cumpleVisual server-owned evaluation', () => {

    describe('VISUAL parameter: cumpleVisual is user-owned and never overwritten', () => {

        it('persists cumpleVisual=true even though the value looks out of a (bogus) range', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_CON_RANGO)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_VISUAL, {
                cumpleVisual: true
            })

            const { data: draft } = await GET(resultadoDraft(resultadoId))
            expect(draft.esVisual).to.equal(true)
            expect(draft.controlCumpleVisual).to.equal(3) // editable
            expect(draft.controlValorObtenido).to.equal(1) // read-only for VISUAL

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(true)
        })

        it('persists cumpleVisual=false when set by the client', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_CON_RANGO)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_VISUAL, {
                cumpleVisual: false
            })

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(false)
        })
    })

    describe('Numeric parameter: cumpleVisual is always computed server-side', () => {

        it('overrides a client cumpleVisual=false to true when the value is inside the range', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_CON_RANGO)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_NUMERICO, {
                valorObtenido: 3.3, // within 3.200-3.400
                cumpleVisual: false
            })

            const { data: draft } = await GET(resultadoDraft(resultadoId))
            expect(draft.esVisual).to.equal(false)
            expect(draft.cumpleVisual).to.equal(true)
            expect(draft.criticidad).to.equal(3)
            expect(draft.controlCumpleVisual).to.equal(1) // read-only
            expect(draft.controlValorObtenido).to.equal(3) // editable

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(true)
            expect(activo.criticidad).to.equal(3)
        })

        it('overrides a client cumpleVisual=true to false when the value is outside the range', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_CON_RANGO)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_NUMERICO, {
                valorObtenido: 5.0, // outside 3.200-3.400
                cumpleVisual: true
            })

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(false)
            expect(activo.criticidad).to.equal(1)
        })

        it('recomputes cumpleVisual on a PATCH of an existing draft result', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_CON_RANGO)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_NUMERICO)

            await PATCH(resultadoDraft(resultadoId), { valorObtenido: 3.3, cumpleVisual: false })

            const { data: draft } = await GET(resultadoDraft(resultadoId))
            expect(draft.cumpleVisual).to.equal(true)
            expect(draft.criticidad).to.equal(3)

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(true)
        })

        it('evaluates a range with only valorMinimo: value above it passes', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_PARA_RANGOS_PARCIALES)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_SOLO_MINIMO, { valorObtenido: 200 })

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(true) // 200 >= 95, no valorMaximo
        })

        it('evaluates a range with only valorMinimo: value below it fails', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_PARA_RANGOS_PARCIALES)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_SOLO_MINIMO, { valorObtenido: 50 })

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(false) // 50 < 95
        })

        it('evaluates a range with only valorMaximo: value below it passes', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_PARA_RANGOS_PARCIALES)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_SOLO_MAXIMO, { valorObtenido: 1 })

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(true) // 1 <= 2.5, no valorMinimo
        })

        it('evaluates a range with only valorMaximo: value above it fails', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_PARA_RANGOS_PARCIALES)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_SOLO_MAXIMO, { valorObtenido: 10 })

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(false) // 10 > 2.5
        })

        it('leaves cumpleVisual neutral (null) when there is no value to compare', async () => {
            const { loteId, inspeccionId } = await crearLoteConInspeccionAbierta(MATERIAL_CON_RANGO)
            const resultadoId = await crearResultadoDraft(inspeccionId, PARAM_NUMERICO)

            const { data: draft } = await GET(resultadoDraft(resultadoId))
            expect(draft.criticidad).to.equal(0)

            await activarLote(loteId)

            const { data: activo } = await GET(resultadoActivo(resultadoId))
            expect(activo.cumpleVisual).to.equal(null)
            expect(activo.criticidad).to.equal(0)
        })
    })
})
