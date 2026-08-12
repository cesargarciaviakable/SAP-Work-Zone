const cds = require('@sap/cds')
const { SELECT, UPDATE } = require('@sap/cds/lib/ql/cds-ql')

module.exports = class BookingService extends cds.ApplicationService {
    async init() {
        const { Bookings, Rooms } = this.entities

        // Validaciones antes de crear una reservación
        this.before('SAVE', Bookings, async (req) => {
            const { room_ID, startTime, endTime, attendees, ID } = req.data

            // 1. Validar que endTime > startTime
            if (new Date(endTime) <= new Date(startTime)) {
                return req.error(400, 'La hora de fin debe ser posterior a la hora de inicio.')
            }

            // 2. Validar que no sea en el pasado
            if (new Date(startTime) < new Date()) {
                return req.error(400, 'No puedes reservar en una fecha pasada.')
            }

            // 3. Validar capacidad de la sala
            const room = await SELECT.one.from(Rooms).where({ ID: room_ID })
            if (!room) return req.error(404, 'Sala no encontrada.')

            if (attendees > room.capacity) {
                return req.error(400,
                    `La sala tiene capacidad para ${room.capacity} personas.
                    Solicitaste ${attendees}`
                )
            }

            // 4. Validar traslape de horarios
            const overlap = await SELECT.one.from(Bookings).where({
                room_ID,
                status: 'confirmed',
                ID: { '!=': ID },
                and: {
                    startTime: { '<': endTime },
                    endTime  : { '>': startTime }
                }
            })

            if (overlap) {
                const toLocal = (utc) => new Date(utc).toLocaleString('es-MX', {
                    timeZone    : 'America/Monterrey',
                    dateStyle   : 'medium',
                    timeStyle   : 'short'
                })
                return req.error(409,
                    `La sala ya tiene una reservación de ${toLocal(overlap.startTime)} a ${toLocal(overlap.endTime)}.`
                )
            }
        })

        // Mismas validaciones al actualizar
        this.before('UPDATE', Bookings, async (req) => {
            if (!req.data.ID) return
            const booking = await SELECT.one.from(Bookings).where({ ID: req.data.ID })
            if (!booking) return req.error(400, 'Reservación no encontrada.')
            if (booking.status === 'cancelled') {
                return req.error(400, 'No puedes modificar una reservación cancelada')
            }
        })

        // Action: Cancelar reservación
        this.on('cancelBooking', Bookings, async (req) => {
            const { ID } = req.params[0]

            const booking = await SELECT.one.from(Bookings).where({ ID })
            if (!booking) return req.error(404, 'Reservación no encontrada.')
            if (booking.status === 'cancelled') return req.error(400, 'La reservación ya está cancelada.')

            await UPDATE(Bookings)
                .set({ status: 'cancelled'})
                .where({ ID })

            return SELECT.one.from(Bookings).where({ ID })
        })

        // Function: Salas disponibles
        this.on('getAvailableRooms', async (req) => {
            const { startTime, endTime, capacity = 1 } = req.data

            // IDs de salas ocupadas en ese horario
            const occupied = await SELECT
                .from(Bookings)
                .columns('room_ID')
                .where({
                    status    : 'confirmed',
                    startTime : { '<': endTime },
                    endTime   : { '>': startTime }
                })

            const occupiedIds = occupied.map(b => b.room_ID)

            // Sala que NO están ocupadas y tienen capacidad suficiente
            const available = await SELECT
                .from(Rooms)
                .columns('ID', 'name', 'capacity', 'floor', 'building_ID')
                .where({ capacity: {'>=': capacity } })

            // Filtrar las ocupadas en memoria
            return available
                .filter(r => !occupiedIds.includes(r.ID))
                .map(r => ({
                    id          : r.ID,
                    name        : r.name,
                    capacity    : r.capacity,
                    floor       : r.floor,
                    buildingName: r.building_ID
                }))
        })

        await super.init()
    }
}