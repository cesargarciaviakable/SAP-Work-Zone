const cds = require('@sap/cds')
const { SELECT } = cds.ql

module.exports = class ReportsService extends cds.ApplicationService {
    async init() {
        const { Lotes } = this.entities

        // Funcion: lotes filtrados por rango de fechas (ambas opcionales)
        this.on('lotesEnRango', async (req) => {
            const { fechaInicio, fechaFin } = req.data

            if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
                return req.error(400, 'fechaInicio debe ser anterior a fechaFin')
            }

            const query = SELECT.from(Lotes)
                .columns(
                    'ID',
                    'numeroLote',
                    'material.descripcion as material',
                    'lineaProduccion.descripcion as linea',
                    'fechaProduccion',
                    'status.name as status'
                )
                .orderBy({ fechaProduccion: 'desc' })

            if (fechaInicio) query.where({ fechaProduccion: { '>=': fechaInicio } })
            if (fechaFin) query.where({ fechaProduccion: { '<=': fechaFin } })

            return query
        })

        await super.init()
    }
}
