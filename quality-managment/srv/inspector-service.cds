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
        { grant: 'UPDATE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' },
        { grant: 'DELETE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' }
    ]
    entity Lotes as projection on db.Lotes {
        *,
        inspecciones : redirected to Inspecciones
    };

    // Inspecciones
    @restrict: [
        { grant: 'READ',   to: 'Inspector' },
        { grant: 'CREATE', to: 'Inspector' },
        { grant: 'UPDATE', to: 'Inspector', where: 'status_code = ''ABIERTA''' },
        { grant: 'DELETE', to: 'Inspector', where: 'status_code = ''ABIERTA''' },
        { grant: 'completarInspeccion', to: 'Inspector' }
    ]
    entity Inspecciones as projection on db.Inspecciones {
        *,
        // Drives UI field control: only ABIERTA inspections are editable
        case when status.code = 'ABIERTA' then true else false end as esEditable : Boolean,
        // Common.FieldControlType: 3 = Optional, 7 = Mandatory, 1 = ReadOnly
        case when status.code = 'ABIERTA' then 3 else 1 end as controlCampo : Integer,
        case when status.code = 'ABIERTA' then 7 else 1 end as controlObligatorio : Integer,
        lote       : redirected to Lotes,
        resultados : redirected to ResultadosInspeccion
    } actions {
        // Bound action: closes the inspection and sends it to supervisor review
        action completarInspeccion() returns {
            mensaje : String;
            status  : String;
        };
    };

    // Resultados
    @restrict: [
        { grant: 'READ',   to: 'Inspector' },
        { grant: 'CREATE', to: 'Inspector' },
        { grant: 'UPDATE', to: 'Inspector' },
        { grant: 'DELETE', to: 'Inspector' }
    ]
    entity ResultadosInspeccion as projection on db.ResultadosInspeccion;
}