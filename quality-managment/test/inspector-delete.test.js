const cds = require('@sap/cds')

// NOTE: this project's package.json already configures `cds.requires.db`
// (sqlite with a persistent `db.sqlite` file for the default/development
// profile). cds.test()'s conditional `--in-memory?` flag only kicks in
// when NO db is configured at all (see @sap/cds/bin/serve.js `_in_memory`),
// so the documented `cds.test(__dirname + '/..')` pattern would silently
// run these tests against the real dev database file. Passing the
// unconditional `--in-memory` flag forces a transient in-memory db instead.
const { DELETE, expect, axios } = cds.test(__dirname + '/..', '--in-memory')

axios.defaults.auth = { username: 'bob', password: '' }

// Fixture IDs from db/data/lote.inspector-*.csv
const LOTE_PENDIENTE_SIN_INSPECCIONES = '00000000-0000-0000-0000-000000000506' // LOTE-2026-006, status PENDIENTE
const LOTE_APROBADO = '00000000-0000-0000-0000-000000000501' // LOTE-2026-001, status APROBADO
const INSPECCION_ABIERTA = '00000000-0000-0000-0000-000000000605' // lote 505, status ABIERTA
const INSPECCION_COMPLETADA = '00000000-0000-0000-0000-000000000601' // lote 501, status COMPLETADA

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
})
