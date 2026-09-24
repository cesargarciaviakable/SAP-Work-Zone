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
        // Redirected to the non-draft ParametrosVH (see below): Parametros
        // is itself draft-enabled, and navigating a draft child's
        // association straight into another draft root breaks the FE's
        // Common.SideEffects-triggered read of the navigated parametro —
        // CAP's lean-draft SQL tries to read DraftAdministrativeData off
        // the *active* Parametros table, which has no such column
        // ("no such column: ...DraftAdministrativeData_DraftUUID").
        parametro : redirected to ParametrosVH,

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

    // Read-only, non-draft projection of Parametros: value-help collection
    // and navigation/redirect target for ParametrosMaterial.parametro (see
    // the comment above).
    @readonly
    entity ParametrosVH as projection on db.Parametros {
        ID,
        codigo,
        descripcion,
        tipoParametro,
        unidadMedida,
        activo
    };

    // Value help
    @readonly
    entity TiposParametro as projection on db.TiposParametro;
}

// Materiales header fields are master data (out of scope here): only their
// acceptance ranges (parametros composition) are maintained in this service.
// `@readonly` on an element only produces a UI hint (Common.FieldControl
// ReadOnly in the metadata) — it is NOT enforced by CAP for a raw PATCH
// (validate_input only cleanses on CREATE/UPDATE/NEW, not on the draft-level
// PATCH event) and is explicitly bypassed at draftActivate by CAP's
// preserve_computed feature. The actual enforcement therefore lives in
// srv/handlers/config-service.js (Materiales guards), this annotation only
// drives the UI.
annotate ConfigService.Materiales with {
    codigo      @readonly;
    descripcion @readonly;
    unidad      @readonly;
    activo      @readonly;
};
