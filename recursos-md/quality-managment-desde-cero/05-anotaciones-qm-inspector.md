# 05a — Anotaciones de qm-inspector

## Qué vas a aprender

Cómo `app/qm-inspector/annotations.cds` construye el formulario de
captura de lotes/inspecciones/resultados: el draft, los value-helps
repetidos, cómo `Common.FieldControl` conecta con las columnas calculadas
del capítulo 03, y cómo tres `Common.SideEffects` distintos mantienen la
pantalla sincronizada mientras el inspector escribe. Da por leídos los
capítulos 03 (`InspectorService`) y 04 (sus handlers) — este capítulo es
la tercera pieza del mismo rompecabezas.

---

## Draft — la app que sí edita con formulario

```cds
annotate service.Lotes with @odata.draft.enabled;
```

A diferencia de `SupervisorService` (capítulo 05b), aquí el inspector
**sí** edita con el flujo estándar de Fiori Elements: crea/edita un
borrador, y al guardar se activa. El draft se declara en la propia
anotación de la app (no en `srv/inspector-service.cds`) — es una decisión
de este proyecto: el draft de `Lotes` vive únicamente donde se necesita.

---

## Ocultar Editar/Eliminar en lotes cerrados

```cds
annotate service.Lotes with @(
  UI.UpdateHidden: edicionOculta,
  UI.DeleteHidden: edicionOculta
) {
  edicionOculta @UI.Hidden;
};
```

`edicionOculta` es la columna calculada de `inspector-service.cds`
(capítulo 03: `case when status.code = 'PENDIENTE' or 'EN_INSPECCION'
then false else true end`). En vez de dejar que el usuario haga clic en
Editar/Eliminar y reciba un `403`/`409` del `@restrict` del backend, el
botón se oculta directamente. Es UX preventivo — **no reemplaza** la
seguridad real: el `@restrict` del service.cds sigue siendo la autoridad,
esta anotación solo evita la fricción de un clic que iba a fallar de
todas formas. Es exactamente la lección 13 del capítulo 09 (commit
`bf7827b`).

---

## Value-helps — el mismo patrón, repetido con variaciones

Cinco campos usan `Common.ValueList`, todos con la misma estructura de
fondo (`ValueListParameterInOut` mapea el campo local a la clave remota;
`ValueListParameterDisplayOnly` agrega columnas visibles en el popup):

| Campo | `CollectionPath` | Parámetro InOut | Display only | Notas |
|---|---|---|---|---|
| `material` | `Materiales` | `material_ID` → `ID` | `codigo`, `descripcion`, `unidad` | `@Common.Text: material.descripcion @Common.TextArrangement: #TextOnly` — en la lista solo se ve la descripción, no el UUID. |
| `lineaProduccion` | `LineasProduccion` | `lineaProduccion_ID` → `ID` | `codigo`, `descripcion`, `planta` | Mismo patrón. |
| `turno` | `Turnos` | `turno_code` → `code` | `name` | Además `@Common.ValueListWithFixedValues` (dropdown fijo, solo tres valores) y `#TextFirst` (muestra "M - Mañana"). |
| `status` | `StatusLote` | `status_code` → `code` | `name` | `@readonly` — el inspector nunca cambia el status a mano, lo mueve el backend. |
| `parametro` (en `ResultadosInspeccion`) | `Parametros` | `parametro_ID` → `ID` | `codigo`, `descripcion`, `tipoParametro_code`, `unidadMedida` | `#TextFirst`. |

Ejemplo real, el de `material`:

```cds
material
  @Common.Text: material.descripcion
  @Common.TextArrangement: #TextOnly
  @Common.ValueList: {
    CollectionPath: 'Materiales',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut',      LocalDataProperty: material_ID, ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'codigo' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'descripcion' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'unidad' }
    ]
  };
```

Este patrón — un `InOut` que resuelve la clave, más varios `DisplayOnly`
que enriquecen el popup — se repite en las cinco apps del proyecto; una
vez que lo entiendes aquí, lo reconoces en cualquiera de las otras.

---

## List Report de Lotes

```cds
UI.SelectionFields: [status_code, material_ID, lineaProduccion_ID, turno_code, fechaProduccion]
```

Cinco filtros — los criterios típicos con los que un inspector busca sus
lotes: por estado, material, línea, turno y fecha.

```cds
UI.LineItem: [
    { Value: numeroLote,      Label: 'No. Lote' },
    { Value: material_ID,     Label: 'Material' },
    { Value: lineaProduccion_ID, Label: 'Línea' },
    { Value: turno_code,      Label: 'Turno' },
    { Value: cantidad,        Label: 'Cantidad' },
    { Value: unidad,          Label: 'Unidad' },
    { Value: fechaProduccion, Label: 'Fecha Producción' },
    { Value: status_code,     Label: 'Status' }
]
```

Ocho columnas simples, sin criticidad — la criticidad de este proyecto
vive en `Inspecciones`/`ResultadosInspeccion` (más abajo), no en `Lotes`.

---

## Object Page de Lotes — dos secciones

```cds
UI.HeaderInfo: { TypeName: 'Lote', TypeNamePlural: 'Lotes', Title: { Value: numeroLote }, Description: { Value: material.descripcion } }
UI.Facets: [
  { $Type: 'UI.ReferenceFacet', Label: 'Información General', Target: '@UI.FieldGroup#General' },
  { $Type: 'UI.ReferenceFacet', Label: 'Inspecciones', Target: 'inspecciones/@UI.LineItem#Inspecciones' }
]
```

Dos pestañas: los datos generales del lote (`FieldGroup #General`) y la
tabla de inspecciones hijas, que apunta directo a un `UI.LineItem`
calificado (`#Inspecciones`) definido más abajo sobre la entidad
`Inspecciones` — el mismo patrón de "LineItem con nombre para un facet
anidado" que ya viste en el capítulo 05b.

```cds
numeroLote      @title: 'No. Lote'     @mandatory;
cantidad        @title: 'Cantidad'     @mandatory;
fechaProduccion @title: 'Fecha de Producción' @mandatory;
unidad          @title: 'Unidad'       @readonly;
observaciones   @title: 'Observaciones' @UI.MultiLineText;
```

`unidad @readonly` — siempre se deriva del material elegido (ver
`Common.SideEffects #Material` más abajo); el usuario nunca la teclea a
mano. `@UI.MultiLineText` convierte `observaciones` en un textarea.

---

## Inspecciones — acción embebida en la tabla y en el header

```cds
UI.LineItem#Inspecciones: [
    { Value: fechaInspeccion, Label: 'Fecha Inspección' },
    { Value: status_code, Label: 'Status' },
    { Value: observaciones, Label: 'Observaciones' },
    { $Type: 'UI.DataFieldForAction', Label: 'Completar Inspección', Action: 'InspectorService.completarInspeccion' }
],
UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Label: 'Completar Inspección', Action: 'InspectorService.completarInspeccion' }
]
```

El mismo `Action` (`completarInspeccion`) aparece **dos veces**: como
columna-botón en la tabla anidada de inspecciones (para completarla fila
por fila desde el Object Page del lote) y en `UI.Identification` (el botón
del header cuando el inspector entra al Object Page de esa inspección
específica). Dos ubicaciones, la misma acción bound del capítulo 03/04.

`lote @UI.Hidden;` sobre `Inspecciones` — oculta la asociación hacia
atrás; no tiene sentido mostrar el lote dentro de su propia inspección
anidada.

---

## Resultados — el icono de criticidad y los campos ocultos de control

```cds
{ Value: cumpleVisual, Label: 'Cumple', Criticality: criticidad, CriticalityRepresentation: #WithIcon }
```

`criticidad` es la columna calculada de `inspector-service.cds` (capítulo
03: `3` verde / `1` rojo / `0` neutro, derivada de `cumpleVisual`).
`CriticalityRepresentation: #WithIcon` pinta un icono de semáforo en la
celda, en vez de solo colorear el fondo — más visible en una tabla densa
de resultados.

```cds
esVisual @UI.Hidden;
criticidad @UI.Hidden;
controlValorObtenido @UI.Hidden;
controlCumpleVisual @UI.Hidden;
```

Los cuatro campos de control (capítulo 03) quedan ocultos — son "campos
de soporte", nunca datos que el usuario deba ver directamente; solo
existen como destino de otras anotaciones (`FieldControl`,
`SideEffects`), como ves a continuación.

---

## `Common.SideEffects` — tres refrescos en vivo distintos

```cds
annotate service.Inspecciones actions {
  completarInspeccion @(
    Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'ABIERTA' ] } },
    Common.SideEffects: { TargetProperties: [ 'in/status_code' ] }
  );
};

annotate service.ResultadosInspeccion with @(
  Common.SideEffects #Cumple: {
    SourceProperties: [ valorObtenido, parametro_ID, cumpleVisual ],
    TargetProperties: [ 'cumpleVisual', 'esVisual', 'controlValorObtenido', 'controlCumpleVisual', 'criticidad' ]
  }
);

annotate service.Lotes with @(
  Common.SideEffects #Material: { SourceProperties: [ material_ID ], TargetProperties: [ 'unidad' ] }
);
```

Tres mecanismos distintos, cada uno resuelve un problema concreto:

| SideEffects | Se dispara cuando | Refresca | Por qué |
|---|---|---|---|
| `Core.OperationAvailable` en `completarInspeccion` | (evaluación en cliente, sin ir al servidor) | Habilita/deshabilita el botón según `in/status_code = 'ABIERTA'` | El inspector no debe poder hacer clic en "Completar" sobre una inspección que ya no está abierta. |
| `#Cumple` sobre `ResultadosInspeccion` | El usuario toca `valorObtenido`, `parametro_ID` o `cumpleVisual` | `cumpleVisual`, `esVisual`, `controlValorObtenido`, `controlCumpleVisual`, `criticidad` | Es justo lo que recalcula `before('PATCH', ResultadosInspeccion.drafts, ...)` con `aplicarControlesDraft` (capítulo 04) — sin este SideEffect, el icono de criticidad y el bloqueo de campos quedarían desactualizados hasta un refresh manual. |
| `#Material` sobre `Lotes` | El usuario cambia `material_ID` | `unidad` | El backend recalcula `unidad` en `before(['NEW','PATCH'], Lotes.drafts, ...)` (capítulo 04) — este SideEffect es lo que hace que la UI la muestre sin recargar. |

Vale la pena notar el paralelismo con la lección 8 del capítulo 09 (el
bug de `DraftAdministrativeData` en `qm-rangos`): ese bug también nació de
un `Common.SideEffects` navegando por una asociación hacia un draft. Aquí,
en `qm-inspector`, el patrón es análogo pero **no** dispara el mismo
problema, porque ninguno de estos tres `SideEffects` navega hacia otra
raíz `@odata.draft.enabled` — solo refrescan campos propios o alcanzables
sin cruzar a otro draft root.

---

## Capabilities + FieldControl condicionados por columnas calculadas

```cds
annotate service.Inspecciones with @(
  Capabilities.DeleteRestrictions: { Deletable: esEditable },
  Capabilities.NavigationRestrictions: {
    RestrictedProperties: [
      { NavigationProperty: resultados, InsertRestrictions: { Insertable: esEditable } }
    ]
  }
) {
  fechaInspeccion @Common.FieldControl: controlObligatorio;
  observaciones   @Common.FieldControl: controlCampo;
  esEditable      @UI.Hidden;
  controlCampo    @UI.Hidden;
  controlObligatorio @UI.Hidden;
};

annotate service.ResultadosInspeccion with @(
  Capabilities.DeleteRestrictions: { Deletable: inspeccion.esEditable }
) {
  parametro     @Common.FieldControl: inspeccion.controlObligatorio;
  valorObtenido @Common.FieldControl: controlValorObtenido;
  cumpleVisual  @Common.FieldControl: controlCumpleVisual;
  observacion   @Common.FieldControl: inspeccion.controlCampo;
};
```

Dos detalles técnicos que vale la pena resaltar:

1. **`Capabilities.DeleteRestrictions.Deletable` puede apuntar a una
   propiedad calculada** (`esEditable`), no solo a `true`/`false` fijo —
   el botón "Eliminar" se habilita/deshabilita **fila por fila** según el
   estado de esa inspección específica. Lo mismo con
   `NavigationRestrictions.InsertRestrictions.Insertable`, que bloquea
   "agregar resultado" en una inspección que ya no está abierta.
2. **`Common.FieldControl` puede navegar por asociación** —
   `parametro @Common.FieldControl: inspeccion.controlObligatorio` toma el
   control field de la entidad **padre** (`inspeccion`), no de la propia
   fila. El campo de control puede vivir en cualquier punto alcanzable de
   la proyección.

La diferencia clave entre `valorObtenido` y `cumpleVisual` resume toda la
lección 4 del capítulo 09: `controlValorObtenido` es ReadOnly (`1`)
cuando el parámetro es `VISUAL` (ese campo no aplica); `controlCumpleVisual`
es ReadOnly (`1`) cuando es numérico (ese lo calcula el servidor). En
cualquier fila, exactamente uno de los dos está habilitado — nunca los
dos a la vez.

---

## manifest.json — lo no genérico

| Clave | Valor | Por qué |
|---|---|---|
| `sap.app.id` | `lote.inspector.app.qminspector` | Namespace + nombre de módulo (coincide con la entrada `sapux` de `package.json`, capítulo 01). |
| `sap.app.dataSources.mainService.uri` | `/inspector/` | Coincide con `@path: '/inspector'` (capítulo 03). |
| `sap.app.crossNavigation.inbounds` | `LoteInspector-manage` (Semantic Object `LoteInspector`, acción `manage`) | El intent del tile — debe ser único entre las cinco apps para que Work Zone no las confunda; mismo principio que el nombre único del destination (capítulo 09, lección 2), aplicado ahora al identificador del tile. |
| `sap.cloud.service` | `lote.inspector` | Coincide con el namespace del schema y con el destination content del `mta.yaml` (capítulo 07). |
| `sap.ui5.models[""].settings` | `operationMode: "Server"`, `autoExpandSelect: true`, `earlyRequests: true` | Configuración estándar de OData V4 para Fiori Elements: filtrado/orden en servidor, `$select` automático, pedir el metadata cuanto antes. |
| `sap.ui5.routing` | 3 rutas (`LotesList`, `LotesObjectPage`, `InspeccionesObjectPage`) | Patrón estándar List Report + Object Page (+ Object Page anidado) generado por el Fiori Generator. |
| `controlConfiguration` en `InspeccionesObjectPage` | `resultados/@...LineItem#Resultados` como `ResponsiveTable` con `creationMode: { name: "Inline" }` | Permite agregar filas de resultado directo en la tabla, sin diálogo aparte — clave para la UX de capturar varios parámetros rápido, uno tras otro. |
| `sap.fe.app.enableLazyLoading` | `true` | Ajuste manual; el Fiori Generator lo deja en `false` por defecto. |

---

## xs-app.json

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    { "source": "^/inspector/(.*)$", "target": "/inspector/$1", "destination": "quality-managment-srv-api", "authenticationType": "xsuaa", "csrfProtection": true },
    { "source": "^(.*)$", "target": "$1", "service": "html5-apps-repo-rt", "authenticationType": "xsuaa" }
  ]
}
```

Mismo patrón que el resto: la primera ruta reenvía todo lo que empiece
con `/inspector/` hacia `quality-managment-srv-api` (el nombre único
post-migración a managed approuter, capítulo 09 lección 2), con
`csrfProtection: true` obligatorio para una app que sí escribe. La
segunda ruta sirve los estáticos desde el HTML5 Application Repository.

---

## Resumen / checklist

- [ ] `@odata.draft.enabled` se declara en la app que necesita el
      formulario editable — no todos los consumidores del mismo servicio
      necesitan draft (compáralo con `SupervisorService`, capítulo 05b).
- [ ] Un `Common.ValueList` siempre combina un `InOut` (resuelve la clave)
      con uno o más `DisplayOnly` (enriquecen el popup) — patrón repetido
      en las cinco apps.
- [ ] `Capabilities.*Restrictions` puede apuntar a una propiedad
      calculada, no solo a un booleano fijo — así el bloqueo es por fila,
      no global.
- [ ] `Common.FieldControl` puede navegar por asociación hacia el padre —
      el control field no tiene que vivir en la misma entidad que el
      campo que controla.
- [ ] Cada campo calculado que la UI necesita en vivo (mientras el
      usuario edita, sin guardar) necesita su propio
      `Common.SideEffects` con el `SourceProperties`/`TargetProperties`
      correcto — mapea uno a uno con los `before` de draft del handler
      (capítulo 04).
