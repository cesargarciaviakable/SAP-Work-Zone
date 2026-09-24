const cds = require('@sap/cds')

// SAFETY: force an in-memory db — see test/inspector-delete.test.js
const { GET, expect, axios } = cds.test(__dirname + '/..', '--in-memory')

axios.defaults.auth = { username: 'carol', password: '' }

// Extracts the <Annotations Target="..."> block for one target
const bloque = (metadata, target) => {
    const inicio = metadata.indexOf(`<Annotations Target="${target}">`)
    expect(inicio, `annotations for ${target}`).to.be.greaterThan(-1)
    return metadata.slice(inicio, metadata.indexOf('</Annotations>', inicio))
}

describe('Supervisor list report — decision column', () => {

    it('shows the decision as the last, high-importance column', async () => {
        const { data } = await GET('/supervisor/$metadata')
        const lineItem = bloque(data, 'SupervisorService.Inspecciones')
            .match(/<Annotation Term="UI\.LineItem">([\s\S]*?)<\/Annotation>\s*<Annotation Term="UI\.PresentationVariant"|<Annotation Term="UI\.LineItem">([\s\S]*?)<\/Collection>/)

        const records = (lineItem[1] ?? lineItem[2]).split('<Record')
        const ultima = records[records.length - 1]

        expect(ultima).to.include('Path="decision/decision_code"')
        expect(ultima).to.include('UI.ImportanceType/High')
    })

    it('displays the decision text instead of its code', async () => {
        const { data } = await GET('/supervisor/$metadata')
        const decision = bloque(data, 'SupervisorService.DecisionLote/decision_code')

        expect(decision).to.include('Common.Text" Path="decision/name"')
        expect(decision).to.include('UI.TextArrangementType/TextOnly')
    })

    it('returns the decision text for decided inspections', async () => {
        const { data } = await GET(
            '/supervisor/Inspecciones?$select=ID&$expand=decision($select=decision_code;$expand=decision($select=name))'
        )
        const nombres = data.value.map((i) => i.decision?.decision?.name).filter(Boolean)

        expect(nombres).to.include.members(['Liberar', 'Rechazar', 'Liberar con Desviación'])
    })
})
