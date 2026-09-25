# 01 — El proyecto y su estructura

## Qué vas a aprender

Cómo arrancó este proyecto con `cds init`, qué hace cada sección de
`package.json` (perfiles de base de datos, autenticación mockeada, el
truco del script `test`), y cómo se organiza la carpeta completa. Es el
punto de partida antes de tocar el schema.

---

## `cds init` — el arranque

El proyecto se generó como un proyecto CAP estándar:

```bash
cds init quality-managment
cd quality-managment
npm install
```

Eso produce la estructura base (`db/`, `srv/`, `package.json`, `readme.md`
genérico de CAP). A partir de ahí se agregaron las dependencias de
producción:

```bash
npm add @cap-js/hana @sap/xssec
```

y las de desarrollo necesarias para SQLite local, tests, y build de MTA:

```bash
npm add -D @cap-js/sqlite @cap-js/cds-test cds-plugin-ui5 mbt rimraf
```

---

## `package.json` explicado

```json
{
  "name": "quality-managment",
  "version": "1.0.0",
  "description": "SAP CAP Quality Management - Lote Inspector",
  "dependencies": {
    "@cap-js/hana": "*",
    "@sap/cds": "^10",
    "@sap/xssec": "^4.15.0",
    "express": "^4"
  },
  "devDependencies": {
    "@cap-js/cds-test": "^1.0.2",
    "@cap-js/sqlite": "*",
    "@sap/cds-dk": "^10",
    "cds-plugin-ui5": "^0.17.0",
    "mbt": "^1.2.49",
    "rimraf": "^5.0.5"
  },
```

**Por qué `@cap-js/hana` y `@sap/xssec` van en `dependencies` y no en
`devDependencies`**: son los paquetes que el backend necesita en tiempo de
ejecución en Cloud Foundry (conexión a HANA, validación de tokens XSUAA).
Si quedaran en `devDependencies`, un `npm ci --omit=dev` en el build de
producción los dejaría fuera y el backend fallaría al arrancar. `@cap-js/
sqlite` y `@cap-js/cds-test`, en cambio, solo hacen falta en desarrollo y
en los tests — por eso van en `devDependencies`.

### Los scripts

```json
  "scripts": {
    "start": "cds-serve",
    "watch": "cds watch",
    "watch-qm-inspector": "cds watch --open lote.inspector.app.qminspector/index.html?sap-ui-xx-viewCache=false --livereload false",
    "undeploy": "cf undeploy quality-managment --delete-services --delete-service-keys --delete-service-brokers",
    "build": "rimraf resources mta_archives && mbt build --mtar archive",
    "deploy": "cf deploy mta_archives/archive.mtar --retries 1",
    "watch-qm-supervisor": "cds watch --open lote.inspector.app.qmsupervisor/index.html?sap-ui-xx-viewCache=false --livereload false",
    "watch-qm-dashboard": "cds watch --open lote.inspector.app.qmdashboard/index.html?sap-ui-xx-viewCache=false --livereload false",
    "watch-qm-rangos": "cds watch --open lote.inspector.app.qmrangos/index.html?sap-ui-xx-viewCache=false --livereload false",
    "watch-qm-parametros": "cds watch --open lote.inspector.app.qmparametros/index.html?sap-ui-xx-viewCache=false --livereload false",
    "test": "CDS_PLUGIN_UI5_ACTIVE=false CDS_REQUIRES_DB_CREDENTIALS_URL=:memory: node --test test/*.test.js"
  },
```

| Script | Qué hace |
|---|---|
| `start` | Arranca el servidor CAP compilado, sin recarga en vivo — para producción o para probar el build final localmente. |
| `watch` | `cds watch` genérico: recompila y recarga en cada cambio, sirve todas las apps bajo `app/*`. |
| `watch-qm-<app>` | Uno por cada app UI, con `--open` apuntando directo al `index.html` de esa app (usando su namespace completo: `lote.inspector.app.qminspector`) y `--livereload false` para que UI5 no intente recargar en caliente el propio Component. Evita tener que navegar manualmente cuando solo quieres iterar sobre una app. |
| `build` | Limpia `resources/` y `mta_archives/` (residuos de un build anterior) y corre `mbt build --mtar archive` — genera el `.mtar` desplegable. |
| `deploy` | `cf deploy` del `.mtar` generado, con un reintento (`--retries 1`) por si el primer intento falla por un timeout transitorio de CF. |
| `undeploy` | Desinstala todo: la app, sus servicios, sus service keys, y cualquier service broker asociado. Útil para limpiar un ambiente de prueba antes de un redeploy limpio. |
| `test` | Ver la sección siguiente — no es un script trivial. |

### El script `test` y por qué fuerza SQLite en memoria

```json
"test": "CDS_PLUGIN_UI5_ACTIVE=false CDS_REQUIRES_DB_CREDENTIALS_URL=:memory: node --test test/*.test.js"
```

Dos variables de entorno antes del comando:

- **`CDS_PLUGIN_UI5_ACTIVE=false`** — desactiva el plugin `cds-plugin-ui5`
  durante los tests (que sirve las apps UI5 vía CAP en desarrollo); no
  aporta nada a un test de backend y solo agrega ruido/tiempo de arranque.
- **`CDS_REQUIRES_DB_CREDENTIALS_URL=:memory:`** — fuerza que **cualquier**
  configuración de base de datos, sea la que sea, use SQLite en memoria en
  vez del archivo `db.sqlite` persistente del perfil de desarrollo.

Esta segunda variable existe por una lección aprendida documentada también
en el propio código de los tests (ver capítulo 08 y capítulo 09, lección
6): el patrón "de libro" de `@cap-js/cds-test`
(`cds.test(__dirname + '/..')`) solo activa el modo en memoria cuando el
proyecto **no tiene ninguna base de datos configurada**. Como este
proyecto sí tiene `cds.requires.db` configurado (ver más abajo, con
`kind: "sqlite"` para desarrollo), ese patrón por sí solo correría los
tests contra el archivo real `db.sqlite` — y los escribiría/mutaría. La
variable de entorno `CDS_REQUIRES_DB_CREDENTIALS_URL=:memory:` fuerza el
modo en memoria de forma incondicional, sin importar qué diga la
configuración del perfil. Es la primera línea de defensa; la segunda es el
flag `--in-memory` que cada archivo de test pasa explícitamente a
`cds.test()` (capítulo 08).

### La sección `cds` — perfiles de base de datos y autenticación

```json
  "cds": {
    "requires": {
      "db": {
        "kind": "sqlite",
        "[hybrid]": { "kind": "hana" },
        "[production]": { "kind": "hana" }
      },
      "auth": {
        "[development]": {
          "kind": "mocked",
          "users": {
            "alice": { "password": "", "roles": ["Inspector", "SupervisorCalidad", "Administrador"] },
            "bob":   { "password": "", "roles": ["Inspector"] },
            "carol": { "password": "", "roles": ["SupervisorCalidad"] }
          }
        },
        "[production]": { "kind": "xsuaa" }
      }
    }
  },
```

CAP resuelve la configuración por **perfiles** (`profiles`): el bloque sin
corchetes es el valor por defecto (`development`, cuando corres `cds
watch` local sin `--profile`); `[hybrid]` y `[production]` sobreescriben
ese valor cuando corres con esos perfiles.

| Perfil | `db.kind` | `auth.kind` | Cuándo se usa |
|---|---|---|---|
| *(default / development)* | `sqlite` (archivo persistente `db.sqlite`) | `mocked` (usuarios `alice`/`bob`/`carol` con roles fijos, sin login real) | Desarrollo local con `cds watch`. |
| `hybrid` | `hana` | *(hereda `mocked` — no se sobreescribe `auth` para este perfil)* | Desarrollo local pero conectado a un HDI container real de BTP, para probar contra HANA sin desplegar. |
| `production` | `hana` | `xsuaa` | Cloud Foundry, con autenticación real vía XSUAA. |

Los tres usuarios mockeados (`alice`, `bob`, `carol`) con contraseña vacía
son los que usan los tests (capítulo 08) y los que usarías para probar
manualmente cada rol en local sin necesitar un IdP: `alice` tiene los tres
roles (para probar todo), `bob` es un inspector puro, `carol` una
supervisora pura — esa separación fuerza a comprobar que las restricciones
de `@requires`/`@restrict` (capítulo 03) realmente funcionan por rol.

### Workspaces y `sapux`

```json
  "workspaces": [
    "app/*"
  ],
  "sapux": [
    "app/qm-inspector",
    "app/qm-supervisor",
    "app/qm-dashboard",
    "app/qm-rangos",
    "app/qm-parametros"
  ]
}
```

`workspaces: ["app/*"]` — usa los *npm workspaces* nativos: cada carpeta
bajo `app/` con su propio `package.json` es un paquete del monorepo,
instalado desde la raíz con una sola pasada de `npm install`/`npm ci`, en
lugar de tener que entrar a cada carpeta de app a instalar por separado.
**Esto trae una obligación**: cada app nueva bajo `app/` debe quedar
también reflejada en `package-lock.json` — si no, el build en CI falla
(ver capítulo 09, lección 11, para el error exacto que esto causó en este
proyecto).

`sapux` — un array plano con la ruta de cada app Fiori del proyecto; lo
usan las herramientas de SAP (Fiori tooling, generadores, algunos
comandos de `cds`) para saber qué carpetas son "apps SAPUI5/Fiori" dentro
del monorepo sin tener que adivinarlo por convención de nombre.

---

## Estructura de carpetas completa

```
quality-managment/
├── db/
│   ├── schema.cds              ← el modelo de datos (capítulo 02)
│   └── data/                   ← CSV de datos semilla
│       └── lote.inspector-*.csv
├── srv/
│   ├── inspector-service.cds   ← 4 servicios (capítulo 03)
│   ├── supervisor-service.cds
│   ├── config-service.cds
│   ├── reports-service.cds
│   └── handlers/                ← su lógica en JS (capítulo 04)
│       ├── inspector-service.js
│       ├── supervisor-service.js
│       ├── config-service.js
│       └── reports-service.js
├── app/
│   ├── services.cds             ← agrega las anotaciones de las 5 apps
│   ├── qm-inspector/            ← 5 apps Fiori Elements (capítulo 05)
│   ├── qm-supervisor/
│   ├── qm-dashboard/
│   ├── qm-rangos/
│   └── qm-parametros/
│       (cada una con annotations.cds, webapp/manifest.json, xs-app.json)
├── test/
│   ├── cumple.test.js           ← tests de integración (capítulo 08)
│   ├── inspector-delete.test.js
│   ├── supervisor-list.test.js
│   ├── lote-edit-visibility.test.js
│   └── config-service.test.js
├── db-backups/                  ← snapshots manuales de db.sqlite (no versionado)
├── .vscode/
│   └── tasks.json               ← tarea "cds watch" para BAS/VS Code
├── mta.yaml                     ← infraestructura de despliegue (capítulo 07)
├── xs-security.json             ← roles y scopes (capítulo 06)
├── package.json
└── .gitignore
```

Nota que `app/qm-*` no tienen un `app/router/` — no hay approuter
standalone en este proyecto. Cada app UI trae su propio `xs-app.json` y se
sirve a través de un **managed approuter** provisto por el servicio HTML5
Apps Repo de BTP (capítulos 05 y 07 profundizan en esto; el capítulo 09,
lección 2, cuenta por qué se migró desde un approuter standalone).

---

## `.vscode/tasks.json`

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "shell",
      "label": "cds watch",
      "command": "cds watch",
    }
  ]
}
```

Una sola tarea, expuesta para que en Business Application Studio (o VS
Code) puedas lanzar `cds watch` desde **Terminal → Run Task** sin escribir
el comando a mano. Es la forma recomendada por el `readme.md` genérico que
`cds init` deja en la raíz del proyecto.

---

## Prerrequisitos antes de tocar código

- **Business Application Studio** (BAS) con el *Full Stack Application
  Dev Space* (incluye Node.js, `cds`, `mbt`, y el editor con soporte CDS).
- **CLI de Cloud Foundry** (`cf`) instalado y con login hecho contra el
  API endpoint de tu subaccount trial/productivo.
- **`mbt`** (Multi-Target Application Build Tool) — ya viene como
  devDependency del proyecto, pero también es útil tenerlo global para
  comandos sueltos.
- **`gh` CLI autenticado** si vas a hacer `git push` desde una terminal de
  BAS que no sea la integrada del editor (ver capítulo 09, lección 15).

---

## Resumen / checklist

- [ ] `@cap-js/hana` y `@sap/xssec` están en `dependencies`, no en
      `devDependencies`.
- [ ] La sección `cds.requires.db`/`auth` define un perfil por default
      (desarrollo), uno `[hybrid]`, y uno `[production]`.
- [ ] El script `test` fuerza SQLite en memoria con
      `CDS_REQUIRES_DB_CREDENTIALS_URL=:memory:` — nunca confíes solo en
      el patrón de `cds.test()` si el proyecto ya tiene un `db.kind`
      configurado.
- [ ] `workspaces: ["app/*"]` significa que cada app nueva necesita
      quedar reflejada en `package-lock.json` (`npm install
      --package-lock-only`) antes de que el build de CI la reconozca.
- [ ] Los usuarios mockeados de `[development]` cubren los tres roles del
      proyecto por separado, para poder probar cada uno de forma aislada.
