# Guía: Configuración de apps UI con el Fiori Generator

El Fiori Generator crea la estructura base de una app Fiori Elements
conectada a tu servicio CAP. Esta guía explica cada decisión que
tomas durante el proceso y qué efecto tiene.

---

## Cuándo usar el Fiori Generator

Úsalo siempre que necesites una nueva app UI para una entidad CAP.
Genera automáticamente:
- `manifest.json` con la configuración de la app
- `ui5.yaml` y `ui5-deploy.yaml` para el build
- `xs-app.json` para el routing
- `package.json` de la app
- Estructura de carpetas `webapp/`

No lo uses para modificar apps existentes — edita directamente
los archivos generados.

---

## Paso 1 — Tipo de aplicación

Al abrir el generator selecciona:

**SAP Fiori application** → **List Report Page**

Es el floorplan estándar para apps de gestión de datos en CAP.
Genera un List Report (tabla con filtros) + Object Page (formulario de detalle).

Otros floorplans disponibles pero menos comunes con CAP:
- **Worklist** — tabla sin panel de filtros lateral
- **Overview Page** — dashboard con múltiples cards
- **Form Entry** — formulario directo sin list report

---

## Paso 2 — Data Source and Service Selection

### Data Source

Selecciona **Connect to a CAP project**.

Esto le dice al generator que tu backend es un proyecto CAP local,
no un sistema SAP externo. Activa opciones específicas de CAP
como la detección automática del servicio.

### CAP project folder path

Selecciona la carpeta raíz de tu proyecto CAP — donde está
el `package.json` y la carpeta `srv/`.

### OData service

Aparecen todos los servicios CAP detectados en el proyecto.
Selecciona el servicio que corresponde a la app que estás creando.

```
TaskService   → app/tasks
ApprovalService → app/approvals
BookingService  → app/bookings
```

---

## Paso 3 — Entity Selection

### Main entity

La entidad principal que muestra el List Report.
Selecciona la entidad que el usuario va a ver y editar.

```
TaskService.Tasks           → app de gestión de tareas
ApprovalService.ApprovalRequests → app de aprobaciones
BookingService.Bookings     → app de reservaciones
```

### Navigation entity

La entidad que se abre en el Object Page al hacer clic en una fila.
Normalmente es la misma que la Main entity.

Úsala diferente solo si tienes una entidad de resumen en el List Report
y quieres navegar a la entidad completa en el Object Page.

### Automatically add table columns

Selecciona **No**.

Si dices Sí, el generator agrega todas las columnas automáticamente
en el `manifest.json`. Eso funciona para ver la app rápido, pero
genera código que luego tienes que limpiar. Es mejor definir
las columnas tú mismo en `annotations.cds`.

---

## Paso 4 — Project Attributes

### Module name

Nombre técnico de la app, sin espacios ni caracteres especiales.
Por convención usa el nombre del proyecto + la entidad, todo junto:

```
tasklisttasks       → app de tareas del proyecto task-list
tasklistapprovals   → app de aprobaciones
roombookingbookings → app de reservaciones
```

Este nombre se usa como:
- Nombre del módulo en el `mta.yaml`
- Nombre del ZIP generado (`tasklisttasks.zip`)
- Nombre del módulo en el `ui5-deploy.yaml`

### Application title

El título que aparece en Work Zone. Puede tener espacios y
caracteres especiales. Ejemplos:
```
Task Manager
Approval Requests
Room Booking
```

### Application namespace

El namespace del proyecto en formato de puntos. Debe ser único
y consistente con el `sap.cloud.service` del `mta.yaml`:

```
task.list    → para el proyecto task-list
room.booking → para el proyecto room-booking
my.app       → para un proyecto genérico
```

El `sap.app.id` de la app queda como `namespace.modulename`:
```
task.list.tasklisttasks
room.booking.roombookingbookings
```

### Minimum SAPUI5 version

Deja el valor que el generator sugiere o usa `1.120.0`.
No bajes de `1.90.0` si usas `sap.fe.templates`.

### Enable TypeScript

**No** — a menos que ya sepas TypeScript y lo uses en todo el proyecto.
TypeScript agrega complejidad de build sin beneficio real para proyectos CAP pequeños.

### Add SAP Fiori Launchpad configuration

**Yes** — siempre.

Esto agrega la sección `crossNavigation.inbounds` al `manifest.json`
que Work Zone necesita para registrar y mostrar la app.

Si dices No, la app no aparece en Work Zone aunque el deploy funcione.

Al seleccionar Yes aparecen campos adicionales:

**Semantic Object** — nombre del objeto de negocio. Debe ser único
entre todas tus apps y sin espacios:
```
Tasks, Approvals, Bookings, Orders, Products
```

**Action** — siempre `display` para apps de consulta/gestión.

**Title** — el título que aparece en el tile de Work Zone.
Puede ser el mismo que Application title.

---

## Paso 5 — Deployment Configuration

Haz clic en **Add deployment configuration**.

### Target

Selecciona **Cloud Foundry**.

### Destination name

Selecciona el destination que apunta a tu backend CAP.
Este es el `Name` que definiste en el `mta.yaml` dentro del
resource de Destination:

```yaml
# En mta.yaml:
destinations:
- Name: task-list-srv-api    # ← selecciona este
```

**Primera app del proyecto**: selecciona el destination existente
si ya desplegaste el proyecto antes, o `srv-api` si es el nombre
que usaste.

**Importante**: el nombre del destination aquí debe coincidir
exactamente con el que está en tu `xs-app.json` de la app.

---

## Paso 6 — ¿Agregar al mta.yaml existente?

Esta es la decisión más importante cuando tienes más de una app.

### Primera app del proyecto — Crear nuevo mta.yaml

Selecciona que se cree un `mta.yaml` nuevo. El generator genera
un MTA básico con:
- El módulo de la app
- El módulo srv (si detecta el proyecto CAP)
- Resources básicos

Después deberás ajustar el `mta.yaml` según la guía de MTA.

### Segunda app en adelante — Agregar al mta.yaml existente

Selecciona que se agregue al `mta.yaml` existente.
El generator agrega automáticamente:
- El nuevo módulo `html5` de la app
- La nueva entrada en el `app-deployer`

No toca los recursos ni los otros módulos.

---

## Paso 7 — Managed Approuter vs Standalone

Esta pantalla aparece cuando agregas deployment configuration.

### ✅ Managed Approuter (recomendado)

Selecciona siempre **Managed Approuter** para proyectos en BTP Free Trial
o cualquier proyecto donde quieras la arquitectura más simple.

**Qué genera**:
- Sin carpeta `app/router/`
- Sin módulo `approuter.nodejs` en el `mta.yaml`
- El parámetro `deploy_mode: html5-repo` en el `mta.yaml`
- Las apps se sirven a través del HTML5 Runtime de SAP

**Ventajas**:
- Menos recursos en Cloud Foundry (ahorra cuota de Free Trial)
- Menos configuración
- SAP mantiene el approuter por ti

### ❌ Standalone Approuter (evitar salvo casos específicos)

Genera una carpeta `app/router/` con un proceso Node.js propio.

**Cuándo usarlo**:
- Necesitas lógica de routing custom que el managed approuter no soporta
- Tienes requisitos de autenticación especiales
- El proyecto lo requiere por política corporativa

**Qué genera extra**:
- Carpeta `app/router/` con `xs-app.json`
- Módulo `approuter.nodejs` en el `mta.yaml`
- Servicio `html5-apps-repo` con plan `app-runtime`
- 64MB adicionales de memoria en CF

---

## Qué revisar después del generator

El generator no genera todo perfecto. Revisa siempre:

### 1. `manifest.json` — sap.cloud.service

```json
"sap.cloud": {
    "public": true,
    "service": "task.list"   // ← debe coincidir con mta.yaml
}
```

El generator a veces pone un valor incorrecto o diferente al del
resto del proyecto. Verifica que sea el mismo en todas las apps
del proyecto.

### 2. `xs-app.json` — csrfProtection

```json
{
    "source": "^/odata/(.*)$",
    "destination": "task-list-srv-api",
    "authenticationType": "xsuaa",
    "csrfProtection": true    // ← cambia false por true
}
```

El generator pone `false` por defecto. Cámbialo a `true` para
proteger las operaciones de escritura.

### 3. `xs-app.json` — rutas de /resources y /test-resources

El generator puede agregar estas rutas que solo sirven para
preview local en BAS:

```json
// Elimina estas rutas del xs-app.json al desplegar en CF:
{ "source": "^/resources/(.*)$",      "destination": "ui5" },
{ "source": "^/test-resources/(.*)$", "destination": "ui5" }
```

En Cloud Foundry el HTML5 Runtime sirve UI5 automáticamente.
Estas rutas son innecesarias y pueden causar conflictos.

### 4. `mta.yaml` — before-all

Si es el primer MTA generado, agrega el bloque `before-all`:

```yaml
build-parameters:
  before-all:
  - builder: custom
    commands:
    - npm ci
    - npx cds build --production
```

Y el parámetro `deploy_mode`:

```yaml
parameters:
  deploy_mode: html5-repo
  enable-parallel-deployments: true
```

### 5. `mta.yaml` — artifacts duplicados

Si agregaste una segunda app al mta.yaml existente, el generator
a veces duplica entradas en el `app-deployer`. Verifica que
cada app aparezca una sola vez en `build-parameters.requires`.

---

## Agregar una segunda app al proyecto (resumen)

1. Abre el Fiori Generator
2. Configura: tipo → List Report, Data Source → CAP project, servicio → el correcto
3. Selecciona la entidad correcta, deja Automatically add columns en No
4. Configura Project Attributes con el namespace del proyecto
5. En Deployment Configuration → selecciona el destination existente
6. En la pregunta del MTA → selecciona agregar al MTA existente
7. Selecciona Managed Approuter
8. Revisa el `mta.yaml` generado buscando duplicados
9. Corrige `manifest.json` (sap.cloud.service) y `xs-app.json` (csrfProtection)

---

## Checklist post-generator

- [ ] `sap.cloud.service` en `manifest.json` coincide con el del `mta.yaml`
- [ ] `csrfProtection: true` en `xs-app.json`
- [ ] Rutas de `/resources` y `/test-resources` eliminadas del `xs-app.json`
- [ ] `before-all` presente en `mta.yaml`
- [ ] `deploy_mode: html5-repo` en `mta.yaml`
- [ ] Sin duplicados en `build-parameters.requires` del app-deployer
- [ ] `enableLazyLoading: true` en `manifest.json` (el generator lo pone en false)
- [ ] `crossNavigation.inbounds` tiene un `semanticObject` único
- [ ] El `Module name` coincide con el `archiveName` en `ui5-deploy.yaml`