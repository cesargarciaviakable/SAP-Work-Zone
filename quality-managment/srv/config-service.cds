using { lote.inspector as db } from '../db/schema';

// ─────────────────────────────────────────
// SERVICIO CONFIGURACIÓN
// Rol: mantenimiento de materiales, sus rangos de aceptación
// y el catálogo de parámetros.
// Backend only for now — the Fiori app annotations (draft UX,
// value helps, field control) land with the qm-rangos app.
// ─────────────────────────────────────────

@path: '/config'
@requires: 'Administrador'
service ConfigService {

    // Materiales + rangos de aceptación (composición editable en el draft)
    @odata.draft.enabled
    entity Materiales as projection on db.Materiales {
        *,
        parametros : redirected to ParametrosMaterial
    };

    entity ParametrosMaterial as projection on db.ParametrosMaterial;

    // Catálogo de parámetros
    @odata.draft.enabled
    entity Parametros as projection on db.Parametros;

    // Value help
    @readonly
    entity TiposParametro as projection on db.TiposParametro;
}
