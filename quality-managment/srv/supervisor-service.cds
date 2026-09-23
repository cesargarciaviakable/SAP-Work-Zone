using { lote.inspector as db } from '../db/schema';

// ─────────────────────────────────────────
// SERVICIO SUPERVISOR
// Rol: revisa inspecciones y toma decisiones
// All state changes go through the bound actions; the
// supervisor never edits lotes, inspecciones or resultados.
// ─────────────────────────────────────────

@path: '/supervisor'
@requires: 'SupervisorCalidad'
service SupervisorService {

    // Catalogos
    @readonly entity Materiales as projection on db.Materiales;
    @readonly entity LineasProduccion as projection on db.LineasProduccion;
    @readonly entity Parametros as projection on db.Parametros;
    @readonly entity ParametrosMaterial as projection on db.ParametrosMaterial;
    @readonly entity Turnos as projection on db.Turnos;
    @readonly entity TiposDecision as projection on db.TiposDecision;
    @readonly entity StatusLote as projection on db.StatusLote;
    @readonly entity StatusInspeccion as projection on db.StatusInspeccion;

    // Lotes
    @readonly
    entity Lotes as projection on db.Lotes {
        *,
        inspecciones : redirected to Inspecciones
    };

    // Inspecciones
    @restrict: [
        { grant: 'READ',               to: 'SupervisorCalidad' },
        { grant: 'tomarDecision',      to: 'SupervisorCalidad' },
        { grant: 'regresarInspeccion', to: 'SupervisorCalidad' }
    ]
    entity Inspecciones as projection on db.Inspecciones {
        *,
        // Drives action availability: completed and not yet decided
        case when status.code = 'COMPLETADA' and decision.ID is null
             then true else false end as pendienteDecision : Boolean,
        lote       : redirected to Lotes,
        resultados : redirected to ResultadosInspeccion,
        decision   : redirected to DecisionLote
    } actions {
        // Final decision on the lote: LIBERAR / RECHAZAR / LIBERAR_CON_DESVIACION
        action tomarDecision(
            decision      : String(30),
            justificacion : String(500)
        ) returns {
            mensaje    : String;
            statusLote : String;
        };

        // Sends the inspection back to the inspector with observations
        action regresarInspeccion(
            observaciones : String(500)
        ) returns {
            mensaje : String;
        };
    };

    // Resultados
    @readonly
    entity ResultadosInspeccion as projection on db.ResultadosInspeccion {
        *,
        // UI criticality: 3 = positive, 1 = negative, 0 = neutral
        virtual null as criticidad : Integer
    };

    // Decisiones
    @readonly
    entity DecisionLote as projection on db.DecisionLote;
}
