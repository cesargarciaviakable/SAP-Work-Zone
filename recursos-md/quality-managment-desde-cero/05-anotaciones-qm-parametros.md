# 05e — Anotaciones de qm-parametros

## Qué vas a aprender

La app más simple de las cinco: un catálogo con draft, un solo value-help
sobre un code list, y — deliberadamente — sin ningún `FieldControl` ni
`SideEffects` del lado cliente para la regla "un parámetro VISUAL no
tiene unidad de medida". Este capítulo también documenta esa ausencia,
comparándola con el tratamiento que sí recibe el mismo problema en
`qm-rangos`, porque entender **qué falta** es tan útil como entender qué
está.

---

## Qué mantiene esta app

`qm-parametros` mantiene el catálogo completo `Parametros` (`@odata.
draft.enabled` en `ConfigService`, capítulo 03). A diferencia de
`qm-rangos`, no tiene ninguna composición hija que anotar — es una
entidad plana.

```cds
using ConfigService as service from '../../srv/config-service';
```

---

## List Report

```cds
annotate service.Parametros with @(
  UI.SelectionFields: [
    tipoParametro_code,
    activo
  ],

  UI.LineItem: [
    { Value: codigo,             Label: 'Código' },
    { Value: descripcion,        Label: 'Descripción' },
    { Value: tipoParametro_code, Label: 'Tipo de Parámetro' },
    { Value: unidadMedida,       Label: 'Unidad de Medida' },
    { Value: activo,             Label: 'Activo' }
  ]
);
```

Filtros por tipo de parámetro y por activo — los dos criterios más útiles
para acotar un catálogo de mantenimiento. Sin `Criticality` ni columnas
calculadas: no hay ningún flujo de estados aquí, solo un catálogo.

---

## Object Page

```cds
annotate service.Parametros with @(
  UI.HeaderInfo: {
    TypeName: 'Parámetro',
    TypeNamePlural: 'Parámetros',
    Title: { Value: descripcion },
    Description: { Value: codigo }
  },

  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Información General', Target: '@UI.FieldGroup#General' }
  ],

  UI.FieldGroup#General: {
    Data: [
      { Value: codigo,             Label: 'Código' },
      { Value: descripcion,        Label: 'Descripción' },
      { Value: tipoParametro_code, Label: 'Tipo de Parámetro' },
      { Value: unidadMedida,       Label: 'Unidad de Medida' },
      { Value: activo,             Label: 'Activo' }
    ]
  }
);
```

Un único `UI.Facets` ("Información General") — a diferencia de
`qm-rangos`, no hay tabla anidada porque `Parametros` no tiene
composiciones relevantes para esta app.

---

## Propiedades y el value-help del tipo de parámetro

```cds
annotate service.Parametros with {

  codigo
    @title: 'Código'
    @mandatory;

  descripcion
    @title: 'Descripción'
    @mandatory;

  unidadMedida
    @title: 'Unidad de Medida';

  activo
    @title: 'Activo';

  tipoParametro
    @title: 'Tipo de Parámetro'
    @mandatory
    @Common.Text: tipoParametro.name
    @Common.TextArrangement: #TextFirst
    @Common.ValueListWithFixedValues
    @Common.ValueList: {
      CollectionPath: 'TiposParametro',

      Parameters: [
        { $Type: 'Common.ValueListParameterInOut',     LocalDataProperty: tipoParametro_code, ValueListProperty: 'code' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
      ]
    };
};
```

`codigo` y `descripcion` llevan `@mandatory` — y a diferencia de los
campos "vestigiales" de `Materiales` en `qm-rangos`, aquí **sí** hay
aplicación real: coincide con `not null` en `db/schema.cds` para ambos
campos (capítulo 02), y con la validación de unicidad de código que hace
el handler (`before(['CREATE','UPDATE'], Parametros, ...)`, busca
duplicados de `codigo` y rechaza con `400`, capítulo 04) — esta app sí
crea y edita parámetros de verdad.

`tipoParametro` es un value-help clásico contra un code list fijo
(`TiposParametro`: `DIMENSIONAL`/`ELECTRICO`/`VISUAL`/`QUIMICO`, capítulo
02). `@Common.ValueListWithFixedValues` lo renderiza como dropdown simple
en lugar de un popup de búsqueda F4 — apropiado porque la lista es corta y
fija, nunca crece dinámicamente. `@Common.Text: tipoParametro.name` +
`#TextFirst` muestra el nombre legible del tipo, no el código técnico, en
modo lectura.

---

## Lo que NO está: una asimetría a propósito de documentar

A diferencia de `qm-rangos` — que sí tiene `Common.FieldControl:
controlRango` y `Common.SideEffects #Parametro` para bloquear/limpiar
rangos cuando el parámetro es `VISUAL` (capítulo 05d) — en
`qm-parametros/annotations.cds` **no hay ningún `Common.FieldControl`
sobre `unidadMedida`**, ni ningún `Common.SideEffects` que reaccione al
cambio de `tipoParametro_code`.

Es coherente con el `.cds`: `ConfigService.Parametros` es una proyección
simple (`entity Parametros as projection on db.Parametros;`, capítulo 03),
sin ninguna columna calculada equivalente a `controlRango` — a diferencia
de `ConfigService.ParametrosMaterial`, que sí calcula `controlRango` a
partir del tipo del parámetro relacionado.

La regla de negocio "un parámetro `VISUAL` no tiene unidad de medida"
**sí existe** — pero se aplica únicamente del lado servidor (capítulo 04):

```js
// srv/handlers/config-service.js
this.before(['CREATE', 'UPDATE'], Parametros, async (req) => {
    if (req.data.tipoParametro_code === TIPO_VISUAL) {
        req.data.unidadMedida = null
    }
    // ...
})

this.before('PATCH', Parametros.drafts, async (req) => {
    if (req.data.tipoParametro_code !== TIPO_VISUAL) return
    // ...
    req.data.unidadMedida = null
    req.info({ message: 'Se eliminó la unidad de medida porque el parámetro es visual', target: 'unidadMedida' })
})
```

**Consecuencia práctica para el usuario**: el campo `unidadMedida` sigue
apareciendo **editable** en la UI incluso cuando el tipo elegido es
`VISUAL` — no hay ningún `FieldControl` que lo bloquee en pantalla. El
usuario puede escribir un valor, pero al guardar el draft ese valor se
descarta silenciosamente en el servidor; la única señal que recibe es el
`req.info` (un mensaje no bloqueante en el header `sap-messages` de la
respuesta) informando que se eliminó. Compáralo con `qm-rangos`, donde el
mismo tipo de regla sí tiene su `FieldControl` — ahí el campo se ve
bloqueado *antes* de que el usuario intente escribir nada.

Vale la pena marcarlo como una inconsistencia de UX menor, no como un bug:
el dato final queda correcto en ambos casos gracias al backend, pero la
experiencia de edición es más pulida en un lugar que en otro. Es un buen
candidato de mejora si algún día se retoma esta app (ver capítulo 10).

---

## manifest.json — lo no genérico

```json
"dataSources": {
  "mainService": { "uri": "/config/", "type": "OData", "settings": { "annotations": [], "odataVersion": "4.0" } }
}
```

Mismo servicio `/config/` que `qm-rangos` — ambas apps comparten
`ConfigService`, cada una expone entidades distintas.

```json
"sap.cloud": { "public": true, "service": "lote.inspector" }
```

Mismo `sap.cloud.service` compartido por las cinco apps.

```json
"crossNavigation": {
  "inbounds": {
    "QMParametros-manage": {
      "semanticObject": "QMParametros",
      "action": "manage"
    }
  }
}
```

Semantic Object propio, `QMParametros` — distinto del `QMRangos` de la
app hermana. Cada app necesita su propio Semantic Object único para que
su tile en el launchpad/Work Zone tenga un intent de navegación
inequívoco.

```json
"routing": {
  "targets": {
    "ParametrosObjectPage": {
      "options": { "settings": { "editableHeaderContent": false, "contextPath": "/Parametros" } }
    }
  }
}
```

Sin `controlConfiguration` de tablas anidadas (a diferencia de
`qm-rangos`) — no hay composiciones hijas que mostrar.
`editableHeaderContent: false` igual que en el resto de apps con Object
Page generado por el Fiori Generator.

```json
"sap.fe": { "app": { "enableLazyLoading": true } }
```

Mismo ajuste manual que en las demás apps.

---

## xs-app.json

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    { "source": "^/config/(.*)$", "target": "/config/$1", "destination": "quality-managment-srv-api", "authenticationType": "xsuaa", "csrfProtection": true },
    { "source": "^(.*)$", "target": "$1", "service": "html5-apps-repo-rt", "authenticationType": "xsuaa" }
  ]
}
```

Idéntico al de `qm-rangos` (misma plantilla, mismo destino
`quality-managment-srv-api`, mismo prefijo `/config/`) — ambas apps
apuntan al mismo backend `ConfigService`; solo difieren en qué entidades
exponen y qué reglas de UI activan.

---

## Resumen / checklist

- [ ] Una entidad plana (sin composiciones hijas relevantes) solo
      necesita un `UI.Facets` con un `UI.FieldGroup` — no fuerces una
      estructura de secciones que no aporta nada.
- [ ] `@Common.ValueListWithFixedValues` sobre un campo de code list corto
      y fijo produce un dropdown en vez de un popup de búsqueda — úsalo
      cuando la lista de opciones no va a crecer dinámicamente.
- [ ] Una regla de negocio puede estar bien implementada en el backend
      (`req.data.unidadMedida = null`) y aun así faltarle su contraparte
      de UX en el cliente (`Common.FieldControl`/`Common.SideEffects`) —
      el dato queda correcto, pero la experiencia de edición no avisa a
      tiempo. Compara siempre ambos lados al revisar una regla de
      negocio, no solo el backend.
- [ ] Dos apps que comparten el mismo servicio backend (`ConfigService`)
      pueden tener rutas (`xs-app.json`) y `dataSources` (`manifest.json`)
      prácticamente idénticos — lo que las distingue es qué entidades
      anotan y qué Semantic Object usan para su tile.
