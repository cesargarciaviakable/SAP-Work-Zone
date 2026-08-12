# Guía: xs-app.json — Configuración de routing de la app UI

El `xs-app.json` define cómo el approuter (managed o standalone)
enruta las peticiones HTTP que llegan a tu app UI. Cada ruta
intercepta un patrón de URL y decide qué hacer con él.

---

## Dónde va y cuántos hay

Con **managed approuter** (recomendado), cada app UI tiene su
propio `xs-app.json` dentro de su carpeta:

```
app/
├── tasks/
│   ├── xs-app.json       ← routing de la app tasks
│   └── webapp/
├── approvals/
│   ├── xs-app.json       ← routing de la app approvals
│   └── webapp/
```

Con **standalone approuter**, hay uno solo en `app/router/`:

```
app/
└── router/
    └── xs-app.json       ← routing centralizado de todas las apps
```

---

## Estructura base — Managed Approuter

Esta es la configuración correcta para cualquier app Fiori Elements
con CAP usando managed approuter:

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/odata/(.*)$",
      "target": "/odata/$1",
      "destination": "my-app-srv-api",
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

Solo dos rutas. Nada más es necesario con managed approuter.

---

## Estructura base — Standalone Approuter

Con standalone, el `xs-app.json` en `app/router/` necesita
rutas para cada app UI del proyecto además de la ruta OData:

```json
{
  "welcomeFile": "/my.app.tasks/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/odata/(.*)$",
      "target": "/odata/$1",
      "destination": "my-app-srv-api",
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

---

## Cada campo explicado

### `welcomeFile`

La URL que se carga cuando alguien accede a la raíz de la app.

```json
"welcomeFile": "/index.html"
```

Con managed approuter siempre es `/index.html` — el HTML5 Runtime
sabe qué app servir por el contexto de Work Zone.

Con standalone approuter incluye el ID de la app:
```json
"welcomeFile": "/my.app.tasks/index.html"
```

### `authenticationMethod`

```json
"authenticationMethod": "route"
```

Siempre `"route"` — significa que la autenticación se define
por ruta individual, no de forma global. Nunca uses `"none"`
en producción.

### `routes`

Array ordenado de rutas. El approuter evalúa de arriba hacia abajo
y aplica la **primera que coincida**. El orden importa.

---

## Las dos rutas esenciales

### Ruta OData — llama al backend CAP

```json
{
  "source": "^/odata/(.*)$",
  "target": "/odata/$1",
  "destination": "my-app-srv-api",
  "authenticationType": "xsuaa",
  "csrfProtection": true
}
```

| Campo | Valor | Por qué |
|-------|-------|---------|
| `source` | `^/odata/(.*)$` | Captura cualquier URL que empiece con `/odata/` |
| `target` | `/odata/$1` | Reenvía al backend con el mismo path |
| `destination` | nombre del destination | Debe coincidir exactamente con el `Name` en el mta.yaml |
| `authenticationType` | `xsuaa` | Requiere token JWT válido |
| `csrfProtection` | `true` | Protege POST/PUT/PATCH/DELETE contra CSRF |

**El `destination` es el campo más crítico** — debe ser exactamente
el mismo nombre que definiste en el resource de Destination del `mta.yaml`:

```yaml
# mta.yaml
destinations:
- Name: my-app-srv-api    # ← este nombre
```

```json
// xs-app.json
"destination": "my-app-srv-api"   // ← mismo nombre
```

Si no coinciden, todas las llamadas OData retornan 404.

### Ruta HTML5 — sirve los archivos estáticos de la app

```json
{
  "source": "^(.*)$",
  "target": "$1",
  "service": "html5-apps-repo-rt",
  "authenticationType": "xsuaa"
}
```

| Campo | Valor | Por qué |
|-------|-------|---------|
| `source` | `^(.*)$` | Captura cualquier URL (catch-all) |
| `target` | `$1` | Reenvía el path tal como viene |
| `service` | `html5-apps-repo-rt` | Nombre interno del HTML5 Runtime de SAP |
| `authenticationType` | `xsuaa` | Requiere usuario autenticado |

Esta ruta siempre va **al final** — como captura todo, si va primero
intercepta también las llamadas OData.

---

## csrfProtection — por qué siempre true

CSRF (Cross-Site Request Forgery) es un ataque donde un sitio
malicioso hace peticiones en nombre del usuario autenticado.

```json
// ❌ El generator lo genera así — inseguro para escritura
"csrfProtection": false

// ✅ Correcto para producción
"csrfProtection": true
```

Fiori Elements maneja el token CSRF automáticamente — pide el token
antes de cada operación de escritura y lo incluye en el header.
No necesitas hacer nada en el frontend para que funcione.

**Solo ponlo en `false`** si estás haciendo pruebas con Postman
o herramientas que no manejan CSRF, y solo en desarrollo.

---

## authenticationType — opciones disponibles

```json
"authenticationType": "xsuaa"   // ← usuario debe estar autenticado con XSUAA
"authenticationType": "none"    // ← sin autenticación (solo para recursos públicos)
```

En producción todas las rutas deben usar `xsuaa`. La única excepción
sería una ruta para un health check o un recurso verdaderamente público,
lo cual es raro en apps empresariales.

---

## Lo que NO debe estar en xs-app.json (managed approuter)

### ❌ Rutas de /resources y /test-resources

```json
// Elimina estas rutas — solo sirven para preview local en BAS
{ "source": "^/resources/(.*)$",      "destination": "ui5" },
{ "source": "^/test-resources/(.*)$", "destination": "ui5" }
```

El generator de Fiori las agrega por defecto. En Cloud Foundry
con managed approuter el HTML5 Runtime sirve UI5 automáticamente
sin necesitar estas rutas. Dejarlas no rompe nada pero es
configuración innecesaria que puede causar confusión.

### ❌ Rutas duplicadas para el mismo path

```json
// ❌ Dos rutas que capturan el mismo patrón
{ "source": "^/my.app.tasks/(.*)$", "service": "html5-apps-repo-rt" },
{ "source": "^(.*)$",               "service": "html5-apps-repo-rt" }
// La segunda hace lo mismo que la primera — elimina la primera
```

Con managed approuter el catch-all `^(.*)$` al final es suficiente.
No necesitas rutas específicas por app.

### ❌ Rutas a destinations que no existen

```json
// Si no tienes un destination "srv-api" en el mta.yaml, esto falla
{ "destination": "srv-api" }
```

El nombre del destination debe existir exactamente en el `mta.yaml`.

---

## xs-app.json del standalone approuter — diferencias

Con standalone el `xs-app.json` en `app/router/` tiene el mismo
contenido pero hay una diferencia clave: el destination de OData
debe ser el nombre correcto del proyecto, no el genérico `srv-api`
que usa el template base.

```json
// ❌ Template genérico que genera el generator a veces
"destination": "srv-api"

// ✅ Nombre específico del destination definido en mta.yaml
"destination": "room-booking-srv-api"
```

Este es el error más común al migrar de standalone a managed —
el destination en el `xs-app.json` apuntaba a `srv-api` pero
en el `mta.yaml` el destination se llama `room-booking-srv-api`.

---

## Cómo verificar que el xs-app.json está bien

Después del deploy, si las llamadas OData fallan con 404, revisa:

1. El `destination` en `xs-app.json` coincide con el `Name` en `mta.yaml`
2. El destination fue creado en CF — verifica con `cf services` que
   el servicio de destination existe y está bound al srv
3. El `csrfProtection` no está bloqueando — prueba temporalmente con
   `false` para aislar el problema

Si la app no carga en Work Zone pero el OData funciona:
1. El `service: html5-apps-repo-rt` está escrito correctamente
2. El `welcomeFile` apunta al path correcto

---

## Checklist del xs-app.json

- [ ] Solo dos rutas: la de OData y el catch-all de HTML5
- [ ] `authenticationMethod: "route"` en la raíz
- [ ] `destination` coincide exactamente con el `Name` del mta.yaml
- [ ] `csrfProtection: true` en la ruta OData
- [ ] `authenticationType: "xsuaa"` en ambas rutas
- [ ] Sin rutas de `/resources` ni `/test-resources`
- [ ] Sin rutas duplicadas
- [ ] La ruta catch-all `^(.*)$` es la última del array