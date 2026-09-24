using { lote.inspector as db } from '../db/schema';

// ─────────────────────────────────────────
// SERVICIO CONFIGURACIÓN
// Rol: mantenimiento de materiales, sus rangos de aceptación
// y el catálogo de parámetros.
// Fiori app annotations (draft UX, value helps, field control)
// land with the qm-rangos / qm-parametros apps (see app/qm-rangos,
// app/qm-parametros).
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

    entity ParametrosMaterial as projection on db.ParametrosMaterial {
        *,
        // true when the linked parametro is VISUAL — drives the UI field
        // control below (visual params have no min/max, see
        // srv/handlers/config-service.js validations)
        case when parametro.tipoParametro.code = 'VISUAL' then true else false end as esVisual : Boolean,

        // Common.FieldControlType (1 = ReadOnly, 3 = Optional) for
        // valorMinimo/valorMaximo: read-only once the parametro is VISUAL
        case when parametro.tipoParametro.code = 'VISUAL' then 1 else 3 end as controlRango : Integer
    };

    // Catálogo de parámetros
    @odata.draft.enabled
    entity Parametros as projection on db.Parametros;

    // Value help
    @readonly
    entity TiposParametro as projection on db.TiposParametro;
}
