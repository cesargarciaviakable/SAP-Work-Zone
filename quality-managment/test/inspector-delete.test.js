const cds = require('@sap/cds')

// NOTE: this project's package.json already configures `cds.requires.db`
// (sqlite with a persistent `db.sqlite` file for the default/development
// profile). cds.test()'s conditional `--in-memory?` flag only kicks in
// when NO db is configured at all (see @sap/cds/bin/serve.js `_in_memory`),
// so the documented `cds.test(__dirname + '/..')` pattern would silently
// run these tests against the real dev database file. Passing the
// unconditional `--in-memory` flag forces a transient in-memory db instead.
const { POST, GET, DELETE, expect, axios } = cds.test(__dirname + '/..', '--in-memory')

axios.defaults.auth = { username: 'bob', password: '' }

// Fixture IDs from db/data/lote.inspector-*.csv
const LOTE_PENDIENTE_SIN_INSPECCIONES = '00000000-0000-0000-0000-000000000506' // LOTE-2026-006, status PENDIENTE
const LOTE_APROBADO = '00000000-0000-0000-0000-000000000501' // LOTE-2026-001, status APROBADO
const INSPECCION_ABIERTA = '00000000-0000-0000-0000-000000000605' // lote 505, status ABIERTA
const INSPECCION_COMPLETADA = '00000000-0000-0000-0000-000000000601' // lote 501, status COMPLETADA

const LINEA = '00000000-0000-0000-0000-000000000201'
const MATERIAL_CON_RANGO = '00000000-0000-0000-0000-000000000101' // MAT-001
const PARAM_NUMERICO = '00000000-0000-0000-0000-000000000301' // DIM-001, rango 3.200-3.400 en MATERIAL_CON_RANGO

let contador = 0
const numeroLote = () => `TEST-DELETE-${Date.now()}-${contador++}`

// Creates and activates a Lote with a single inspección (ABIERTA by
// default), leaving the Lote in status EN_INSPECCION
async function crearLoteEnInspeccion() {
    const { data: lote } = await POST('/inspector/Lotes', {
        numeroLote: numeroLote(),
        material_ID: MATERIAL_CON_RANGO,
        lineaProduccion_ID: LINEA,
        turno_code: 'M',
        cantidad: 100,
        fechaProduccion: '2026-09-24',
        inspecciones: [{ fechaInspeccion: new Date().toISOString() }]
    })

    const { data: leido } = await GET(
        `/inspector/Lotes(ID=${lote.ID},IsActiveEntity=false)?$expand=inspecciones`
    )
    const inspeccionId = leido.inspecciones[0].ID

    await POST(
        `/inspector/Inspecciones(ID=${inspeccionId},IsActiveEntity=false)/resultados`,
        { parametro_ID: PARAM_NUMERICO, valorObtenido: 3.3 }
    )

    await POST(
        `/inspector/Lotes(ID=${lote.ID},IsActiveEntity=false)/InspectorService.draftActivate`,
        {}
    )

    return { loteId: lote.ID, inspeccionId }
}

describe('InspectorService - DELETE grants', () => {

    describe('Lotes', () => {

        it('allows Inspector to delete a PENDIENTE lote', async () => {
            const { status } = await DELETE(`/inspector/Lotes(ID=${LOTE_PENDIENTE_SIN_INSPECCIONES},IsActiveEntity=true)`)
            expect(status).to.equal(204)
        })

        it('rejects Inspector deleting an APROBADO lote', async () => {
            try {
                await DELETE(`/inspector/Lotes(ID=${LOTE_APROBADO},IsActiveEntity=true)`)
                expect.fail('expected DELETE to be rejected')
            } catch (e) {
                // The instance-level @restrict where-clause rejects the
                // DELETE with 403 Forbidden.
                expect(e.response.status).to.equal(403)
            }
        })
    })

    describe('Inspecciones', () => {

        it('allows Inspector to delete an ABIERTA inspection', async () => {
            const { status } = await DELETE(`/inspector/Inspecciones(ID=${INSPECCION_ABIERTA},IsActiveEntity=true)`)
            expect(status).to.equal(204)
        })

        it('rejects Inspector deleting a COMPLETADA inspection', async () => {
            try {
                await DELETE(`/inspector/Inspecciones(ID=${INSPECCION_COMPLETADA},IsActiveEntity=true)`)
                expect.fail('expected DELETE to be rejected')
            } catch (e) {
                expect(e.response.status).to.equal(403)
            }
        })
    })

    describe('Lotes — cascade delete guard (R3-lote-delete-cascade)', () => {

        it('deletes an EN_INSPECCION lote whose inspecciones are all ABIERTA, cascading to children', async () => {
            const { loteId, inspeccionId } = await crearLoteEnInspeccion()

            const { status } = await DELETE(`/inspector/Lotes(ID=${loteId},IsActiveEntity=true)`)
            expect(status).to.equal(204)

            try {
                await GET(`/inspector/Inspecciones(ID=${inspeccionId},IsActiveEntity=true)`)
                expect.fail('expected the child inspección to be gone')
            } catch (e) {
                expect(e.response.status).to.equal(404)
            }
        })

        it('rejects deleting an EN_INSPECCION lote that has a COMPLETADA inspección', async () => {
            const { loteId, inspeccionId } = await crearLoteEnInspeccion()

            await POST(
                `/inspector/Inspecciones(ID=${inspeccionId},IsActiveEntity=true)/InspectorService.completarInspeccion`,
                {}
            )

            try {
                await DELETE(`/inspector/Lotes(ID=${loteId},IsActiveEntity=true)`)
                expect.fail('expected DELETE to be rejected')
            } catch (e) {
                expect(e.response.status).to.equal(409)
            }

            // Nothing was deleted: the lote and its completed inspección survive
            const { data: loteAun } = await GET(`/inspector/Lotes(ID=${loteId},IsActiveEntity=true)`)
            expect(loteAun.ID).to.equal(loteId)

            const { data: inspeccionAun } = await GET(`/inspector/Inspecciones(ID=${inspeccionId},IsActiveEntity=true)`)
            expect(inspeccionAun.status_code).to.equal('COMPLETADA')
        })
    })
})
