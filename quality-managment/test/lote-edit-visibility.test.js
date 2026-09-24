const cds = require('@sap/cds')

// SAFETY: force an in-memory db — see test/inspector-delete.test.js
const { GET, expect, axios } = cds.test(__dirname + '/..', '--in-memory')

axios.defaults.auth = { username: 'bob', password: '' }

// Fixture IDs from db/data/lote.inspector-Lotes.csv
const LOTE_APROBADO = '00000000-0000-0000-0000-000000000501' // LOTE-2026-001
const LOTE_RECHAZADO = '00000000-0000-0000-0000-000000000502' // LOTE-2026-002
const LOTE_EN_INSPECCION = '00000000-0000-0000-0000-000000000505' // LOTE-2026-005
const LOTE_PENDIENTE = '00000000-0000-0000-0000-000000000506' // LOTE-2026-006

const edicionOculta = async (id) => {
    const { data } = await GET(`/inspector/Lotes(ID=${id},IsActiveEntity=true)?$select=edicionOculta`)
    return data.edicionOculta
}

describe('Lotes — Edit/Delete button visibility', () => {

    it('hides edit and delete for closed lotes', async () => {
        expect(await edicionOculta(LOTE_APROBADO)).to.equal(true)
        expect(await edicionOculta(LOTE_RECHAZADO)).to.equal(true)
    })

    it('shows edit and delete for PENDIENTE and EN_INSPECCION lotes', async () => {
        expect(await edicionOculta(LOTE_PENDIENTE)).to.equal(false)
        expect(await edicionOculta(LOTE_EN_INSPECCION)).to.equal(false)
    })

    it('exposes UpdateHidden and DeleteHidden bound to edicionOculta', async () => {
        const { data } = await GET('/inspector/$metadata')
        expect(data).to.match(/Target="InspectorService\.Lotes"[\s\S]*?UI\.UpdateHidden" Path="edicionOculta"/)
        expect(data).to.match(/Target="InspectorService\.Lotes"[\s\S]*?UI\.DeleteHidden" Path="edicionOculta"/)
    })
})
