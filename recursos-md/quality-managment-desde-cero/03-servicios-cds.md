# 03 — Los servicios CDS (`srv/*.cds`)

**Qué vas a aprender**: qué expone cada uno de los cuatro servicios
(`InspectorService`, `SupervisorService`, `ConfigService`,
`ReportsService`), cómo restringen el acceso con `@restrict`, y por
qué hay campos calculados con `case/when` directamente en la
proyección.

Cada servicio corresponde a **un rol de negocio**, no a una entidad:
el inspector, el supervisor, el administrador de catálogos y los
reportes de solo lectura. Esto es deliberado — separar por caso de uso
permite que cada servicio exponga justo lo que ese rol necesita, con
sus propias reglas de acceso.

---

## `InspectorService` (`/inspector`)

```cds
using { lote.inspector as db } from '../db/schema';

@path: '/inspector'
@requires: 'Inspector'
service InspectorService {
```

`@requires: 'Inspector'` a nivel de servicio significa que **todo**
el servicio exige el scope `Inspector` como mínimo — es la primera
línea de defensa, antes de que `@restrict` entre en juego por entidad.

### Catálogos de solo lectura

```cds
@readonly
entity Materiales as projection on db.Materiales where activo = true;

@readonly
entity LineasProduccion as projection on db.LineasProduccion where activo = true;

@readonly
entity Parametros as projection on db.Parametros where activo = true;

@readonly
entity ParametrosMaterial as projection on db.ParametrosMaterial;

@readonly entity Turnos as projection on db.Turnos;
@readonly entity TiposParametro as projection on db.TiposParametro;
@readonly entity StatusLote as projection on db.StatusLote;
@readonly entity StatusInspeccion as projection on db.StatusInspeccion;
```

Todos los catálogos son `@readonly` (el inspector los consulta, no los
edita) y los tres que tienen bandera `activo` se filtran con
`where activo = true` **directamente en la proyección** — así un
material o parámetro desactivado ni siquiera aparece como opción al
capturar un lote nuevo, sin necesidad de un `before READ` a mano.

### `Lotes` — restricciones por estado

```cds
@restrict: [
    { grant: 'READ',   to: 'Inspector' },
    { grant: 'CREATE', to: 'Inspector' },
    { grant: 'UPDATE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' },
    { grant: 'DELETE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' }
]
entity Lotes as projection on db.Lotes {
    *,
    inspecciones : redirected to Inspecciones,

    // Drives UI.UpdateHidden / UI.DeleteHidden: closed lotes cannot be
    // edited or deleted (mirrors the UPDATE/DELETE grants above)
    case
        when status.code = 'PENDIENTE' or status.code = 'EN_INSPECCION' then false
        else true
    end as edicionOculta : Boolean
};
```

`@restrict` con `where` es la forma de CAP de decir "puedes actualizar
o borrar, pero **solo si** la fila cumple esta condición" — aquí, solo
lotes `PENDIENTE` o `EN_INSPECCION`. Un lote ya `APROBADO` o
`RECHAZADO` rechaza el PATCH/DELETE con 403, a nivel de motor CAP, sin
código adicional.

El campo calculado `edicionOculta` **repite la misma condición**, pero
invertida y expuesta como columna booleana. No es redundancia
accidental: `@restrict` protege el backend, pero la UI necesita saber
*de antemano* si debe mostrar los botones Editar/Eliminar o no — para
eso están `UI.UpdateHidden`/`UI.DeleteHidden` en las anotaciones de
`qm-inspector` (capítulo 05), que apuntan justo a este campo. Sin él,
el usuario vería el botón, haría clic, y recién ahí recibiría un 403 —
la lección "hide edit/delete on closed lotes" del capítulo 09 nace de
evitar exactamente esa experiencia.

### `Inspecciones` — acción bound + más campos calculados

```cds
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
```

Nota el cuarto grant: `{ grant: 'completarInspeccion', to: 'Inspector'
}` — las acciones bound (declaradas dentro de `actions { }` de la
entidad) también se listan explícitamente en `@restrict`, igual que
CREATE/READ/UPDATE/DELETE. Sin ese grant, el endpoint de la acción
respondería 403 aunque el usuario tenga el scope `Inspector`.

`esEditable`, `controlCampo`, `controlObligatorio` son el mismo patrón
que `edicionOculta`: la condición de negocio ("solo se edita mientras
está ABIERTA") se calcula una vez en la proyección y se reutiliza
desde la UI vía `@Common.FieldControl` (capítulo 05). El comentario
`// Common.FieldControlType: 3 = Optional, 7 = Mandatory, 1 = ReadOnly`
documenta los valores mágicos que exige el vocabulario `Common` de
OData — sin el comentario serían tres números sin sentido.

### `ResultadosInspeccion` — el campo dual numérico/visual en la proyección

```cds
@restrict: [
    { grant: 'READ',   to: 'Inspector' },
    { grant: 'CREATE', to: 'Inspector' },
    { grant: 'UPDATE', to: 'Inspector' },
    { grant: 'DELETE', to: 'Inspector' }
]
entity ResultadosInspeccion as projection on db.ResultadosInspeccion {
    *,
    // true when the parametro is VISUAL (checkbox), false when numeric
    // (server-computed pass/fail icon)
    case when parametro.tipoParametro.code = 'VISUAL' then true else false end as esVisual : Boolean,

    // UI criticality for cumpleVisual: 3 = positive (green), 1 = negative
    // (red), 0 = neutral. Always derived from cumpleVisual, which for
    // numeric parametros is exclusively server-owned.
    case
        when cumpleVisual = true  then 3
        when cumpleVisual = false then 1
        else 0
    end as criticidad : Integer,

    // Common.FieldControlType (1 = ReadOnly, 3 = Optional): locked while
    // the inspección is not ABIERTA, and additionally read-only for
    // valorObtenido on VISUAL params / for cumpleVisual on numeric params
    case
        when inspeccion.status.code != 'ABIERTA' then 1
        when parametro.tipoParametro.code = 'VISUAL' then 1
        else 3
    end as controlValorObtenido : Integer,

    case
        when inspeccion.status.code != 'ABIERTA' then 1
        when parametro.tipoParametro.code = 'VISUAL' then 3
        else 1
    end as controlCumpleVisual : Integer
};
```

Cuatro columnas calculadas, todas derivadas de asociaciones
(`parametro.tipoParametro.code`, `inspeccion.status.code`) — nota que
CAP permite navegar asociaciones dentro de un `case/when` en una
proyección (`parametro.tipoParametro.code`, no solo columnas propias
de la tabla). Esto es lo que le permite a la UI mostrar el campo
correcto (checkbox vs. icono de semáforo) sin que el handler JS tenga
que intervenir en cada lectura — la proyección ya lo resuelve.

**Advertencia documentada en el propio proyecto** (ver
`recursos-md/services/guia-a.md`): los campos `case/when` no funcionan
bien en entidades con `@odata.draft.enabled` sobre HANA. `Lotes` sí
tiene draft (anotado en `qm-inspector/annotations.cds`, capítulo 05) y
sí usa `case/when` (`edicionOculta`) — funciona porque la activación
del draft en este proyecto siempre reenvía el documento completo desde
la raíz (ver capítulo 04, "Draft activation sends the whole document
... so child handlers never run"), evitando el escenario problemático.
Es un punto a vigilar si algún día se cambia ese patrón.

---

## `SupervisorService` (`/supervisor`)

```cds
@path: '/supervisor'
@requires: 'SupervisorCalidad'
service SupervisorService {
```

### Lotes: solo lectura, sin excepciones

```cds
@readonly
entity Lotes as projection on db.Lotes {
    *,
    inspecciones : redirected to Inspecciones
};
```

El supervisor **nunca edita** lotes directamente — todo cambio de
estado pasa por las acciones bound de `Inspecciones` (`tomarDecision`,
`regresarInspeccion`). El comentario de cabecera del archivo lo dice
explícito: *"All state changes go through the bound actions; the
supervisor never edits lotes, inspecciones or resultados."*

### Inspecciones: dos acciones bound, sin CREATE/UPDATE/DELETE genéricos

```cds
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
    // UI criticality for the decision column: 3 = LIBERAR (green),
    // 2 = LIBERAR_CON_DESVIACION (yellow), 1 = RECHAZAR (red), 0 = none
    case decision.decision.code
        when 'LIBERAR'                then 3
        when 'LIBERAR_CON_DESVIACION' then 2
        when 'RECHAZAR'               then 1
        else 0
    end as criticidadDecision : Integer,
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
```

No hay grant de `CREATE`, `UPDATE` ni `DELETE`: el `@restrict` de esta
entidad **solo** lista `READ` y las dos acciones — cualquier intento de
POST/PATCH/DELETE directo sobre `Inspecciones` desde este servicio se
rechaza aunque el usuario tenga el scope, porque el grant simplemente
no existe para esa operación.

`pendienteDecision` es el campo que la UI usa para habilitar o
deshabilitar los botones de acción (`Core.OperationAvailable` en
`qm-supervisor/annotations.cds`, capítulo 05): solo tiene sentido
decidir sobre una inspección `COMPLETADA` sin decisión previa.
`criticidadDecision` colorea la columna de decisión en la lista
(verde/amarillo/rojo) — la fuente de esos números (3/2/1/0) es el
vocabulario `UI.CriticalityType` de OData.

### Resultados y decisiones: solo lectura

```cds
@readonly
entity ResultadosInspeccion as projection on db.ResultadosInspeccion {
    *,
    // UI criticality: 3 = positive, 1 = negative, 0 = neutral
    virtual null as criticidad : Integer
};

@readonly
entity DecisionLote as projection on db.DecisionLote;
```

Aquí `criticidad` se declara `virtual null as criticidad : Integer` —
un truco para exponer una columna del tipo correcto sin darle un valor
por defecto en la proyección; el handler de
`srv/handlers/supervisor-service.js` la rellena en un `after READ`
(capítulo 04), porque calcular si un resultado "cumple" requiere
releer el rango del material, algo que no se puede expresar en un
`case/when` estático de la proyección.

---

## `ConfigService` (`/config`)

```cds
@path: '/config'
@requires: 'Administrador'
service ConfigService {
```

### Materiales — draft, pero solo para editar sus rangos

```cds
// Materiales + rangos de aceptación (composición editable en el draft)
@odata.draft.enabled
entity Materiales as projection on db.Materiales {
    *,
    parametros : redirected to ParametrosMaterial
};
```

`Materiales` tiene draft habilitado porque el flujo de edición de
rangos necesita guardar/descartar — pero, como se ve en el capítulo
05 (`qm-rangos`), **crear y eliminar materiales está bloqueado** vía
`Capabilities.InsertRestrictions`/`DeleteRestrictions` en las
anotaciones de esa app: esta app solo mantiene los rangos
(`parametros`), no el maestro de materiales en sí. El comentario al
pie del archivo lo explica con detalle (se cita completo más abajo).

### `ParametrosMaterial` — por qué su asociación `parametro` está redirigida

```cds
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
```

Este es uno de los puntos más delicados de todo el proyecto — ver la
lección "draft navigation crash" del capítulo 09 para el error exacto
que provocó este fix. La regla general que deja el comentario: **nunca
apuntes la asociación de un documento draft hacia otra raíz también
draft-enabled dentro del mismo servicio.** Cuando `ParametrosMaterial`
(hijo draft de `Materiales`) navega a `parametro`, y `parametro` fuera
directamente `Parametros` (que también tiene `@odata.draft.enabled`
más abajo en este mismo archivo), Fiori Elements dispara una lectura
adicional por `Common.SideEffects` que termina generando SQL de
*lean draft* que intenta leer `DraftAdministrativeData` de la tabla
**activa** de `Parametros` — columna que no existe ahí, solo en su
tabla `_drafts`. El resultado es un crash en tiempo de ejecución, no
un error de negocio.

La solución: redirigir a `ParametrosVH`, una proyección de solo
lectura y **sin draft** sobre la misma entidad base.

```cds
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
```

`ParametrosVH` cumple doble función: es el *value help* (F4) para
elegir un parámetro al agregar un rango, **y** el destino de la
asociación redirigida de arriba. Reutilizar la misma proyección para
ambas cosas evita duplicar entidades.

### El comentario final — por qué el `@readonly` de campo no basta

```cds
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
```

Esta nota es clave para no confiarse: `@readonly` en un **campo**
(distinto del `@readonly` en una **entidad** completa, que sí bloquea
todo el CRUD) solo es una pista para la UI — CAP no la hace cumplir en
un PATCH crudo contra la API OData, ni durante la activación del
draft. Por eso `srv/handlers/config-service.js` borra explícitamente
esos campos del payload en `before PATCH`/`before CREATE,UPDATE`
(capítulo 04) — la anotación y el handler hacen trabajos
complementarios, no redundantes.

---

## `ReportsService` (`/reports`)

```cds
@path: '/reports'
@requires: ['Inspector', 'SupervisorCalidad', 'Administrador']
service ReportsService {
```

Es el único servicio con `@requires` como **arreglo**: cualquiera de
los tres roles puede entrar — a diferencia de los otros tres
servicios, que exigen exactamente un rol.

### Vistas base (solo lectura, redirección explícita)

```cds
@readonly
@cds.redirection.target: true
          entity Lotes                as projection on db.Lotes;
@readonly entity Inspecciones         as projection on db.Inspecciones;
@readonly entity ResultadosInspeccion as projection on db.ResultadosInspeccion;
@readonly
@cds.redirection.target: true
          entity DecisionLote         as projection on db.DecisionLote;
@readonly entity Materiales           as projection on db.Materiales;
@readonly entity LineasProduccion     as projection on db.LineasProduccion;
@readonly entity Parametros           as projection on db.Parametros;
@readonly entity StatusLote           as projection on db.StatusLote;
```

`@cds.redirection.target: true` en `Lotes` y `DecisionLote` resuelve
la ambigüedad que se produciría porque este mismo servicio expone
además `LotesConDecision` (más abajo), que también deriva de
`Lotes`/`DecisionLote`: le dice a CAP cuál de las proyecciones es "la
oficial" para navegar cuando hay más de una candidata.

### Vistas analíticas — agregaciones con `select from ... group by`

```cds
// Vista: resumen de lotes por status
@readonly
entity ResumenLotesPorStatus as select from db.Lotes {
    key status.code as status : String,
        status.name as nombre : String,
        count(ID)   as total  : Integer
}
group by status.code, status.name;
```

```cds
// Vista: lotes con su ultima decision
@readonly
entity LotesConDecision as select from db.DecisionLote {
    key inspeccion.lote.ID,
        inspeccion.lote.numeroLote,
        inspeccion.lote.material.descripcion        as material      : String,
        inspeccion.lote.lineaProduccion.descripcion as linea         : String,
        inspeccion.lote.turno.name                  as turno         : String,
        inspeccion.lote.fechaProduccion,
        inspeccion.lote.cantidad,
        inspeccion.lote.status.name                 as statusLote    : String,
        decision.name                               as decision      : String,
        justificacion,
        createdBy                                   as aprobadorPor  : String,
        createdAt                                   as fechaDecision : Timestamp
}
```

```cds
// Vista: parametros que mas fallan
@readonly
entity ParametrosFallidos as select from db.ResultadosInspeccion as r join db.Parametros as p on p.ID = r.parametro.ID
{
    key p.codigo      as codigoParametro : String,
        p.descripcion as parametro       : String,
        p.unidadMedida,
        count(r.ID)   as totalMediciones : Integer,
        count(case when r.cumpleVisual = false
            then 1 end) as totalFallas : Integer
}
group by p.codigo, p.descripcion, p.unidadMedida;
```

```cds
// Vista: rendimiento por linea de produccion
@readonly
entity RendimientoPorLinea as select from db.Lotes as l join db.LineasProduccion as lp on lp.ID = l.lineaProduccion.ID
{
    key lp.codigo      as codigoLinea   : String,
        lp.descripcion as linea         : String,
        count(l.ID)    as totalLotes    : Integer,
        count(case when l.status.code = 'APROBADO' then 1 end)                as aprobados     : Integer,
        count(case when l.status.code = 'RECHAZADO' then 1 end)               as rechazados    : Integer,
        count(case when l.status.code = 'APROBADO_CON_DESVIACION' then 1 end) as conDesviacion : Integer,
        // Share of decided lotes released without deviation (0-100)
        round(
            100.0 * count(case when l.status.code = 'APROBADO' then 1 end)
            / nullif(count(case when l.status.code in ('APROBADO', 'RECHAZADO', 'APROBADO_CON_DESVIACION') then 1 end), 0)
        , 2) as porcentajeAprobacion : Decimal(5,2),
        // UI criticality for porcentajeAprobacion: 3 good, 2 warning, 1 bad, 0 no data
        case
            when count(case when l.status.code in ('APROBADO', 'RECHAZADO', 'APROBADO_CON_DESVIACION') then 1 end) = 0 then 0
            when 100.0 * count(case when l.status.code = 'APROBADO' then 1 end)
                 / count(case when l.status.code in ('APROBADO', 'RECHAZADO', 'APROBADO_CON_DESVIACION') then 1 end) >= 80 then 3
            when 100.0 * count(case when l.status.code = 'APROBADO' then 1 end)
                 / count(case when l.status.code in ('APROBADO', 'RECHAZADO', 'APROBADO_CON_DESVIACION') then 1 end) >= 50 then 2
            else 1
        end as criticidadAprobacion : Integer
}
group by lp.codigo, lp.descripcion;
```

Estas cuatro vistas son SQL puro expresado en CDS: `select from ...
{ } group by ...`, con `join` explícito cuando hace falta (
`ParametrosFallidos`, `RendimientoPorLinea`) en vez de navegar
asociaciones. Todas alimentan `qm-dashboard` (capítulo 05) — cada una
corresponde a una pestaña del dashboard, y los campos `criticidad*`
que calculan con `case/when` son exactamente los que las anotaciones
`UI.DataPoint`/`UI.Chart` usan para colorear.

Vale la pena notar `nullif(..., 0)` en `porcentajeAprobacion`: evita
una división por cero cuando una línea todavía no tiene lotes
decididos — sin eso, SQLite/HANA lanzarían error o `NULL` de forma
inconsistente según el motor.

### La función de solo lectura

```cds
// Funcion: lotes por rango de fechas
function lotesEnRango(
    fechaInicio : Date,
    fechaFin    : Date
) returns array of {
    ID              : UUID;
    numeroLote      : String;
    material        : String;
    linea           : String;
    fechaProduccion : Date;
    status          : String;
}
```

Una `function` (no `action`) porque es una operación de solo lectura
sin efectos secundarios — la convención que también sigue la guía de
referencia (`recursos-md/services/guia-a.md`): *funciones para
consultas, acciones para mutaciones*. Ambos parámetros son opcionales
en la práctica: el handler (capítulo 04) construye el `WHERE` solo con
los que vengan.

---

## Resumen / checklist

- [ ] Cada servicio mapea a un rol de negocio (`@requires` a nivel de servicio), no a una entidad.
- [ ] `@restrict` con `where` condiciona CREATE/UPDATE/DELETE al estado de la fila (lotes/inspecciones abiertos vs. cerrados).
- [ ] Las acciones bound (`completarInspeccion`, `tomarDecision`, `regresarInspeccion`) necesitan su propio grant en `@restrict`, igual que un CRUD.
- [ ] Los campos calculados con `case/when` en la proyección (`edicionOculta`, `esEditable`, `controlCampo`, `criticidad`, `controlValorObtenido`...) existen para que la UI no tenga que adivinar reglas de negocio — son el puente entre backend y anotaciones.
- [ ] Nunca redirijas la asociación de un hijo draft hacia otra raíz draft-enabled del mismo servicio — usa una proyección `@readonly` intermedia (`ParametrosVH`).
- [ ] `@readonly` en un campo es solo una pista de UI — la aplicación real vive en el handler.
- [ ] Las vistas analíticas de `ReportsService` son SQL agregado expresado en CDS; sus columnas `criticidad*` alimentan directamente las anotaciones de `qm-dashboard`.
