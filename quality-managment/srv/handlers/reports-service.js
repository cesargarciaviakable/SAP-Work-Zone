const cds = require('@sap/cds')

module.exports = class ReportsService extends cds.ApplicationService {
    async init() {
        const { Lotes } = this.entities

        // Funcion: lotes filtrados por rango de fechas
        this.on('lotesEnRango', async (req) => {
            const { fechaInicio, fechaFin } = req.data

            if (!fechaInicio || !fechaFin) return await SELECT.from(Lotes).columns('ID', 'numeroLote', 'fechaProduccion')
            
            if (fechaInicio > fechaFin) return req.error(400, 'fechaInicio debe ser anterior a fechaFin')

            const lotes = await SELECT.from(Lotes)
                .where({ fechaProduccion: { between: fechaInicio, and: fechaFin } })
                .orderBy({ fechaProduccion: 'desc' })

            return lotes
        })

        await super.init()
    }
}