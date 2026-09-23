using { lote.inspector as db } from '../db/schema';

// ─────────────────────────────────────────
// SERVICIO SUPERVISOR
// Rol: revisa inspecciones y toma decisiones
// ─────────────────────────────────────────

@path: '/supervisor'
@requires: 'SupervisorCalidad'
service SupervisorService {

    // Catalogos
    @readonly entity Materiales as projection on db.Materiales;
    @readonly entity LineasProduccion as projection on db.LineasProduccion;
    @readonly entity Parametros as projection on db.Parametros;
    @readonly entity ParametrosMaterial as projection on db.ParametrosMaterial;
    @readonly entity TiposDecision as projection on db.TiposDecision;
    @readonly entity StatusLote as projection on db.StatusLote;
    @readonly entity StatusInspeccion as projection on db.StatusInspeccion;

    // Lotes
    @restrict: [
        { grant: 'READ',   to: 'SupervisorCalidad' },
        { grant: 'UPDATE', to: 'SupervisorCalidad', where: 'status_code = ''EN_INSPECCION''' }
    ]
    entity Lotes as projection on db.Lotes {
        *,
        inspecciones : redirected to Inspecciones
    };

    // Inspecciones
    @restrict: [
        { grant: 'READ',   to: 'SupervisorCalidad' },
        { grant: 'UPDATE', to: 'SupervisorCalidad', where: 'status_code = ''COMPLETADA''' }
    ]
    entity Inspecciones as projection on db.Inspecciones {
        *,
        resultados : redirected to ResultadosInspeccion,
        decision   : redirected to DecisionLote
    };

    // Resultados
    @readonly
    entity ResultadosInspeccion as projection on db.ResultadosInspeccion;

    // Decisiones
    @restrict: [
        { grant: 'READ',   to: 'SupervisorCalidad' },
        { grant: 'UPDATE', to: 'SupervisorCalidad' }
    ]
    entity DecisionLote as projection on db.DecisionLote;

    // Accion principal: tomar decision sobre una inspeccion
    action tomarDecision(
        inspeccionId  : UUID,
        decision      : String,
        justificacion : String
    ) returns {
        mensaje    : String;
        statusLote : String;
    };

    // Accion: regresar inspeccion al inspector con observaciones
    action regresarInspeccion(
        inspeccionId  : UUID,
        observaciones : String
    ) returns {
        mensaje : String;
    };
}