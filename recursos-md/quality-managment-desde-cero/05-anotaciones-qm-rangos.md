# 05d — Anotaciones de qm-rangos

## Qué vas a aprender

Cómo `app/qm-rangos/annotations.cds` bloquea la creación y borrado de
materiales a la vez en la UI y en el backend, cómo el value-help del
parámetro apunta exactamente a la misma entidad (`ParametrosVH`) a la que
está redirigida la asociación en el servicio, y cómo `Common.FieldControl`
+ `Common.SideEffects` trabajan juntos para bloquear los campos de rango
cuando el parámetro elegido es `VISUAL`. Da por leídos los capítulos 03
(`ConfigService`) y 04 (sus handlers) — aquí se cierra el círculo del lado
de la UI.

---

## Qué mantiene esta app y qué no

`qm-rangos` consume `ConfigService` pero **no gestiona materiales** — solo
la composición `parametros` de cada material (es decir, `ParametrosMaterial`:
los rangos de aceptación mínimo/máximo por parámetro). El comentario del
propio `annotations.cds` lo dice sin rodeos:

```cds
using ConfigService as service from '../../srv/config-service';
```

---

## Materiales — Create/Delete bloqueados en las dos capas

```cds
// Materiales come from the master data: this app only maintains their
// acceptance ranges. Create and Delete are hidden here (and rejected
// server-side, see srv/config-service.cds / srv/handlers/config-service.js);
// Edit stays available to maintain ranges.
annotate service.Materiales with @(
  UI.CreateHidden: true,
  UI.DeleteHidden: true,
  Capabilities.InsertRestrictions.Insertable: false,
  Capabilities.DeleteRestrictions.Deletable: false
);
```

| Anotación | Capa | Efecto |
|---|---|---|
| `UI.CreateHidden: true` / `UI.DeleteHidden: true` | Presentación (UX) | Oculta los botones "Crear" y "Eliminar" en el List Report y el Object Page. Un usuario cuidadoso ni siquiera ve la opción. |
| `Capabilities.InsertRestrictions.Insertable: false` / `Capabilities.DeleteRestrictions.Deletable: false` | Protocolo OData | Estas son las que realmente importan: CAP genera metadata que hace que el runtime **rechace** un `POST` o `DELETE` con `405` antes de que corra ningún handler custom. |

El propio comentario en `srv/handlers/config-service.js` (capítulo 04) lo
confirma desde el otro lado: *"Enforced via @Capabilities...— these are
CAP's own generic checks — libx runtime rejects with 405 before any
custom handler runs — so no extra `before` handler is needed here"*. Es
la regla general que conviene recordar: `UI.*Hidden` es cosmético, la
seguridad real vive en `Capabilities`. Esta es exactamente la lección 14
del capítulo 09 (commit `17c40f0`), y tiene su propio grupo de tests
dedicado en `test/config-service.test.js` (`Materiales — no se crean ni
se eliminan (T10)`, capítulo 08).

---

## Materiales — List Report y Object Page (solo consulta)

```cds
annotate service.Materiales with @(
  UI.SelectionFields: [
    codigo,
    activo
  ],

  UI.LineItem: [
    { Value: codigo,      Label: 'Código' },
    { Value: descripcion, Label: 'Descripción' },
    { Value: unidad,      Label: 'Unidad' },
    { Value: activo,      Label: 'Activo' }
  ]
);

annotate service.Materiales with @(
  UI.HeaderInfo: {
    TypeName: 'Material',
    TypeNamePlural: 'Materiales',
    Title: { Value: descripcion },
    Description: { Value: codigo }
  },

  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Información General', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', Label: 'Rangos de aceptación', Target: 'parametros/@UI.LineItem#Rangos' }
  ],

  UI.FieldGroup#General: {
    Data: [
      { Value: codigo,      Label: 'Código' },
      { Value: descripcion, Label: 'Descripción' },
      { Value: unidad,      Label: 'Unidad' },
      { Value: activo,      Label: 'Activo' }
    ]
  }
);
```

Sin criticidad ni columnas calculadas — es una lista de referencia simple.
Lo importante está en `UI.Facets`: dos secciones, una con los datos del
material (solo consulta) y otra que navega por la composición
`parametros/@UI.LineItem#Rangos` — **esa** es la tabla realmente editable
de la app, definida más abajo.

```cds
annotate service.Materiales with {
  codigo      @title: 'Código'      @mandatory;
  descripcion @title: 'Descripción' @mandatory;
  unidad      @title: 'Unidad';
  activo      @title: 'Activo';
};
```

Nota la aparente contradicción: estos campos llevan `@mandatory`, pero la
edición real está bloqueada en tres capas distintas — `@readonly` sobre
cada campo en `ConfigService.Materiales` (capítulo 03), el `ignorarCambiosDeMaestro`
del handler (capítulo 04), y (para create/delete completos) las
`Capabilities` de arriba. `@mandatory` aquí es vestigial: refleja la regla
de que el campo nunca debe estar vacío **si algún día se editara desde
otro lugar**, pero en la práctica, en esta app, nunca se llega a escribir.

---

## ParametrosMaterial — el value-help que cierra el círculo de `ParametrosVH`

```cds
annotate service.ParametrosMaterial with {

  parametro
    @title: 'Parámetro'
    @mandatory
    @Common.Text: parametro.descripcion
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'ParametrosVH',
      SearchSupported: true,

      Parameters: [
        { $Type: 'Common.ValueListParameterInOut',     LocalDataProperty: parametro_ID, ValueListProperty: 'ID' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'codigo' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'descripcion' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'tipoParametro_code' }
      ]
    };
```

`CollectionPath: 'ParametrosVH'` no es casualidad: es la contraparte del
lado cliente de la redirección que viste en el capítulo 03 —

```cds
// srv/config-service.cds
parametro : redirected to ParametrosVH,
```

Recordatorio del porqué (lección 8 del capítulo 09, commit `9bd5c78`):
`Parametros` tiene `@odata.draft.enabled`, y un hijo de un draft (`Parametros
Material`, hijo de `Materiales`) no puede navegar directamente hacia otra
raíz draft-enabled sin romper la lectura de `DraftAdministrativeData` en
SQLite. La solución fue crear `ParametrosVH`, una proyección de solo
lectura sin draft — y esta anotación es la mitad que le corresponde a la
UI: el F4-help de `parametro` apunta explícitamente a esa misma colección.
**Ambas piezas deben usar la misma entidad** — si el `CollectionPath`
apuntara a `Parametros` en vez de `ParametrosVH`, el popup de búsqueda
mostraría una colección distinta a la que realmente queda navegada tras
elegir un valor.

`@Common.Text: parametro.descripcion` + `#TextFirst` — muestra
"código — descripción" en el campo en vez del UUID crudo.

---

## Field control de los rangos — `controlRango`

```cds
  // Read-only: min/max are locked once the parametro is VISUAL
  // (srv/config-service.cds computes controlRango from parametro.tipoParametro)
  valorMinimo
    @title: 'Valor Mínimo'
    @Common.FieldControl: controlRango;

  valorMaximo
    @title: 'Valor Máximo'
    @Common.FieldControl: controlRango;

  esObligatorio
    @title: 'Obligatorio';

  esVisual      @UI.Hidden;
  controlRango  @UI.Hidden;
  material      @UI.Hidden;
};
```

`@Common.FieldControl: controlRango` en ambos campos numéricos apunta a
la columna calculada del `.cds` (capítulo 03:
`case when parametro.tipoParametro.code = 'VISUAL' then 1 else 3 end`,
donde `1` = ReadOnly y `3` = Optional). Cuando el usuario elige un
parámetro visual, `valorMinimo`/`valorMaximo` se vuelven de solo lectura
automáticamente — sin ningún código JavaScript en el cliente. `esVisual` y
`controlRango` quedan `@UI.Hidden` porque son soporte técnico: nunca deben
aparecer como columnas propias, solo alimentan el `FieldControl` (y,
como ves abajo, el `SideEffects`). `material @UI.Hidden` oculta la
asociación al padre — redundante en una tabla ya anidada dentro del propio
Material.

---

## LineItem calificado de la tabla anidada

```cds
annotate service.ParametrosMaterial with @(
  UI.LineItem #Rangos: [
    { Value: parametro_ID, Label: 'Parámetro' },
    {
      // Read-only: the parameter's own type, shown for reference next to
      // the range so the user knows why min/max may be locked
      Value: parametro.tipoParametro_code,
      Label: 'Tipo de Parámetro'
    },
    { Value: valorMinimo,   Label: 'Valor Mínimo' },
    { Value: valorMaximo,   Label: 'Valor Máximo' },
    { Value: esObligatorio, Label: 'Obligatorio' }
  ]
);
```

El calificador `#Rangos` es la conexión con `Target:
'parametros/@UI.LineItem#Rangos'` del `UI.Facets` de `Materiales` visto
arriba — sin él, Fiori Elements no sabría cuál `UI.LineItem` usar para esa
tabla anidada. Se incluye `parametro.tipoParametro_code` como columna de
solo referencia junto a los rangos, para que el usuario entienda de un
vistazo por qué el mínimo/máximo puede aparecer bloqueado en cierta fila.

---

## `Common.SideEffects` — refresco al cambiar el parámetro de una fila

```cds
// Changing the parametro refreshes the derived field control (and the
// tipo de parámetro column) for the same row
annotate service.ParametrosMaterial with @(
  Common.SideEffects #Parametro: {
    SourceProperties: [ parametro_ID ],
    TargetProperties: [ 'esVisual', 'controlRango', 'parametro/tipoParametro_code' ]
  }
);
```

| Elemento | Qué hace |
|---|---|
| `SourceProperties: [parametro_ID]` | Dispara el side effect cuando el usuario elige un parámetro distinto en la fila (vía el value-help visto arriba). |
| `TargetProperties: ['esVisual', 'controlRango', 'parametro/tipoParametro_code']` | Le dice a Fiori Elements qué recargar del backend tras el cambio: los dos campos que gobiernan si mínimo/máximo quedan editables, y la columna de referencia del tipo. |

Sin este `SideEffects`, el usuario tendría que guardar y volver a abrir la
fila para ver el campo bloquearse. Encaja con el patrón general del
proyecto: el handler `before('PATCH', ParametrosMaterial.drafts, ...)`
(capítulo 04) ya limpia `valorMinimo`/`valorMaximo` cuando el parámetro
pasa a ser `VISUAL` y emite un `req.info(...)` — el `SideEffects` es lo
que hace que la UI **vea** ese cambio de inmediato, sin refrescar
manualmente.

---

## manifest.json — lo no genérico

```json
"dataSources": {
  "mainService": {
    "uri": "/config/",
    "type": "OData",
    "settings": { "annotations": [], "odataVersion": "4.0" }
  }
}
```

Consume `ConfigService` en `/config/` (coincide con `@path: '/config'`,
capítulo 03).

```json
"sap.cloud": {
  "public": true,
  "service": "lote.inspector"
}
```

Mismo `sap.cloud.service` en las cinco apps y en `mta.yaml` — el
identificador de "familia de apps" que usa Work Zone/el managed approuter
para agrupar todos los módulos del mismo backend (capítulo 09, lección 2).

```json
"routing": {
  "targets": {
    "MaterialesObjectPage": {
      "options": { "settings": {
        "editableHeaderContent": false,
        "contextPath": "/Materiales",
        "controlConfiguration": {
          "parametros/@com.sap.vocabularies.UI.v1.LineItem#Rangos": {
            "tableSettings": { "type": "ResponsiveTable", "creationMode": { "name": "Inline" } }
          }
        }
      } }
    }
  }
}
```

`controlConfiguration` sobre la tabla anidada
`parametros/@...LineItem#Rangos` con `creationMode: { name: 'Inline' }` —
permite crear filas de rango directamente en la tabla, sin abrir un
diálogo emergente. Es la única entidad realmente editable de toda la app,
así que tiene sentido optimizar su flujo de captura al máximo.

```json
"sap.fe": { "app": { "enableLazyLoading": true } }
```

Igual que en el resto de apps: ajuste manual, el generator lo deja en
`false`.

---

## xs-app.json

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/config/(.*)$",
      "target": "/config/$1",
      "destination": "quality-managment-srv-api",
      "authenticationType": "xsuaa",
      "csrfProtection": true
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    }
  ]
}
```

Mismo patrón que las demás apps: la primera ruta reenvía todo lo que
empieza con `/config/` (el prefijo del `@path` de `ConfigService`) hacia
el destino `quality-managment-srv-api`, y la segunda (catch-all) sirve los
recursos estáticos propios de la app desde el HTML5 Application
Repository.

---

## Resumen / checklist

- [ ] `UI.CreateHidden`/`UI.DeleteHidden` son cosméticos; `Capabilities.
      InsertRestrictions`/`DeleteRestrictions` son la protección real
      (rechazan con `405` antes de correr cualquier handler).
- [ ] Cuando el backend redirige una asociación
      (`parametro : redirected to ParametrosVH`), el `Common.ValueList`
      del lado cliente debe apuntar exactamente al mismo `CollectionPath`
      — ambas piezas son las dos mitades de la misma solución.
- [ ] `@Common.FieldControl` sobre un campo apunta a una columna
      calculada del `.cds` (`controlRango`) — así el bloqueo condicional
      no necesita ni una línea de JavaScript en el cliente.
- [ ] `Common.SideEffects` con `SourceProperties`/`TargetProperties`
      refresca campos derivados cuando el campo origen cambia, sin
      esperar a guardar.
- [ ] El calificador `#Nombre` conecta un `UI.LineItem`/`UI.FieldGroup`
      con el `Target` de un `UI.Facets` que navega por composición —
      imprescindible para una tabla anidada.
