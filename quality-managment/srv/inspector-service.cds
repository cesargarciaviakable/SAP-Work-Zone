using { lote.inspector as db } from '../db/schema';

// ─────────────────────────────────────────
// SERVICIO INSPECTOR
// Rol: captura resultados de inspección
// ─────────────────────────────────────────

@path: '/inspector'
@requires: 'Inspector'
service InspectorService {

    // Lectura de catálogos
    @readonly
    entity Materiales as projection on db.Materiales where activo = true;

    @readonly
    entity LineasProduccion as projection on db.LineasProduccion where activo = true;

    @readonly
    entity Parametros as projection on db.Parametros where activo = true;

    @readonly
    entity ParametrosMaterial as projection on db.ParametrosMaterial;

    // Turnos y tipos
    @readonly entity Turnos as projection on db.Turnos;
    @readonly entity TiposParametro as projection on db.TiposParametro;
    @readonly entity StatusLote as projection on db.StatusLote;
    @readonly entity StatusInspeccion as projection on db.StatusInspeccion;

    // Lotes
    @restrict: [
        { grant: 'READ',   to: 'Inspector' },
        { grant: 'CREATE', to: 'Inspector' },
        { grant: 'UPDATE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' }
    ]
    entity Lotes as projection on db.Lotes {
        *,
        inspecciones : redirected to Inspecciones
    };

    // Inspecciones
    @restrict: [
        { grant: 'READ',   to: 'Inspector' },
        { grant: 'CREATE', to: 'Inspector' },
        { grant: 'UPDATE', to: 'Inspector', where: 'status_code ''ABIERTA''' }
    ]
    entity Inspecciones as projection on db.Inspecciones {
        *,
        resultados : redirected to ResultadosInspeccion
    };

    // Resultados
    @restrict: [
        { grant: 'READ',   to: 'Inspector' },
        { grant: 'CREATE', to: 'Inspector' },
        { grant: 'UPDATE', to: 'Inspector' },
        { grant: 'DELETE', to: 'Inspector' }
    ]
    entity ResultadosInspeccion as projection on db.ResultadosInspeccion;

    // Accion para cerrar la inspeccion y enviarla a revision
    action completarInspeccion(inspeccionId : UUID) returns {
        mensaje : String;
        status  : String;
    };
}