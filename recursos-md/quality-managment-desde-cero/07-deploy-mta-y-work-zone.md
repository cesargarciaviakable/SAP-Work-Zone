# 07 — Deploy: mta.yaml y Work Zone

## Qué vas a aprender

Cómo está armado el `mta.yaml` del proyecto módulo por módulo (backend,
db-deployer, cinco apps HTML5, destination content), los comandos de
build/deploy, y cómo se configura SAP Build Work Zone al final para que
las apps aparezcan y se puedan abrir. Este capítulo asume que ya leíste el
capítulo 06 (seguridad) — aquí se explica la infraestructura que hace
posible lo que ahí se describió.

---

## Managed approuter: la decisión que atraviesa todo el archivo

Antes de leer el `mta.yaml`, la decisión de diseño más importante: este
proyecto usa **managed approuter** (`deploy_mode: html5-repo`), no un
approuter standalone (`app/router/` con su propio módulo `approuter.
nodejs`). La diferencia se nota en todo el archivo:

- No hay ningún módulo `type: approuter.nodejs`.
- Cada app UI (`qm-inspector`, etc.) trae su propio `xs-app.json` (capítulo
  05), en vez de haber un único `xs-app.json` centralizado en
  `app/router/`.
- El HTML5 Application Repository (`html5-apps-repo`) sirve las apps
  directamente, resuelto por Work Zone/el HTML5 Runtime — no hay un
  proceso Node.js adicional corriendo el approuter.

El proyecto **empezó** con approuter standalone y **migró** a managed
approuter a mitad de desarrollo — el motivo exacto (colisión de nombres de
destination entre proyectos del mismo subaccount) está documentado en el
capítulo 09, lección 2.

---

## Cabecera y parámetros globales

```yaml
_schema-version: "3.1"
ID: quality-managment
description: SAP CAP Quality Management - Lote Inspector
version: 1.0.0
```

`ID` es el identificador único del MTA dentro del space de Cloud Foundry —
todos los nombres de servicio/destination del resto del archivo lo usan
como prefijo (`quality-managment-db`, `quality-managment-srv`, etc.).

```yaml
parameters:
  deploy_mode: html5-repo
  enable-parallel-deployments: true
build-parameters:
  before-all:
  - builder: custom
    commands:
    - npm ci
    - npx cds build --production
```

- `deploy_mode: html5-repo` — activa managed approuter, tal como se
  explicó arriba.
- `enable-parallel-deployments: true` — permite que Cloud Foundry
  despliegue varios módulos en paralelo cuando no dependen entre sí (por
  ejemplo, las cinco apps HTML5 se pueden compilar/subir simultáneamente),
  acelerando el deploy.
- `before-all` corre **antes** de compilar cualquier módulo:
  `npm ci` instala todas las dependencias del monorepo (incluidos los
  workspaces `app/*`, capítulo 01), y `npx cds build --production` genera
  `gen/srv` (el backend compilado, listo para Node.js sin `.cds` fuente)
  y `gen/db` (el esquema compilado listo para HDI). Sin este paso, los
  módulos `quality-managment-srv` y `quality-managment-db-deployer` de
  abajo no tendrían nada que empaquetar.

---

## Módulo backend

```yaml
- name: quality-managment-srv
  type: nodejs
  path: gen/srv
  requires:
  - name: quality-managment-db
  - name: quality-managment-auth
  - name: quality-managment-destination
  provides:
  - name: srv-api
    properties:
      srv-url: ${default-url}
  parameters:
    buildpack: nodejs_buildpack
    readiness-health-check-http-endpoint: /health
    readiness-health-check-type: http
  build-parameters:
    builder: npm-ci
```

`path: gen/srv` — no apunta a `srv/` sino al resultado del `cds build
--production` del `before-all`. `requires` declara sus tres dependencias
de servicios BTP (base de datos, autenticación, destination). `provides:
srv-api` expone su propia URL (`${default-url}`, la que Cloud Foundry le
asigna al desplegarse) bajo el nombre `srv-api`, para que otros módulos
(el resource `quality-managment-destination`, más abajo) la referencien
con `~{srv-api/srv-url}`. Los dos `readiness-health-check-*` le dicen a
CF cómo saber si la app arrancó bien antes de enrutarle tráfico —
`@sap/cds` expone `/health` automáticamente.

---

## Módulo db-deployer

```yaml
- name: quality-managment-db-deployer
  type: hdb
  path: gen/db
  requires:
  - name: quality-managment-db
  build-parameters:
    builder: npm
```

`type: hdb` — un módulo especial que solo corre una vez, al desplegar,
para aplicar el esquema compilado (`gen/db`) al HDI container. No queda
corriendo después — despliega la estructura de tablas/vistas en HANA y
termina.

---

## Los cinco módulos HTML5 — uno por app

```yaml
- name: loteinspectorappqminspector
  type: html5
  path: app/qm-inspector
  build-parameters:
    build-result: dist
    builder: custom
    commands:
    - npm install
    - npm run build:cf
    supported-platforms: []
```

y lo mismo, cambiando solo `name`/`path`, para
`loteinspectorappqmsupervisor` (`app/qm-supervisor`),
`loteinspectorappqmdashboard` (`app/qm-dashboard`),
`loteinspectorappqmrangos` (`app/qm-rangos`), y
`loteinspectorappqmparametros` (`app/qm-parametros`).

**Convención del nombre**: todo junto, sin guiones ni puntos, en
minúsculas — `loteinspectorappqminspector` viene de
`lote.inspector.app.qminspector` (el namespace UI5 completo de la app,
capítulo 05) sin separadores. `build:cf` es el script del `package.json`
de cada app individual (capítulo 05) que compila con `ui5 build preload`.
`supported-platforms: []` le indica al MTA que este módulo no se despliega
como una app CF independiente — solo produce un artefacto (el ZIP en
`dist`) que otro módulo recoge.

---

## Destination content — registrar las rutas para Work Zone

```yaml
- name: quality-managment-destination-content
  type: com.sap.application.content
  requires:
  - name: quality-managment-destination
    parameters:
      content-target: true
  - name: quality-managment-html5-repo-host
    parameters:
      service-key:
        name: quality-managment-html5-repo-host-key
  - name: quality-managment-auth
    parameters:
      service-key:
        name: quality-managment-auth-key
  parameters:
    content:
      instance:
        destinations:
        - Name: quality_managment_repo_host
          ServiceInstanceName: quality-managment-html5-repo-host
          ServiceKeyName: quality-managment-html5-repo-host-key
          sap.cloud.service: lote.inspector
        - Authentication: OAuth2UserTokenExchange
          Name: quality_managment_uaa
          ServiceInstanceName: quality-managment-auth
          ServiceKeyName: quality-managment-auth-key
          sap.cloud.service: lote.inspector
        existing_destinations_policy: update
  build-parameters:
    no-source: true
```

Este módulo no tiene código propio (`no-source: true`) — su único trabajo
es **registrar** dos destinations en el servicio Destination de la
subcuenta: uno apuntando al HTML5 Repo (para que Work Zone encuentre el
contenido de las apps) y otro apuntando a XSUAA con
`OAuth2UserTokenExchange` (para que el usuario navegue autenticado). El
campo `sap.cloud.service: lote.inspector` en ambos es el identificador que
usa Work Zone para agrupar "todo lo que pertenece a esta app de negocio";
**debe coincidir exactamente** con el mismo valor en el `sap.cloud.service`
del `manifest.json` de cada app (capítulo 05) — si no coinciden, Work Zone
no relaciona el contenido con el destination y las apps no aparecen
disponibles para agregar al site.

---

## App-content — empaqueta los cinco ZIPs

```yaml
- name: quality-managment-app-content
  type: com.sap.application.content
  path: .
  requires:
  - name: quality-managment-html5-repo-host
    parameters:
      content-target: true
  build-parameters:
    build-result: resources
    requires:
    - artifacts:
      - loteinspectorappqminspector.zip
      name: loteinspectorappqminspector
      target-path: resources/
    - artifacts:
      - loteinspectorappqmsupervisor.zip
      name: loteinspectorappqmsupervisor
      target-path: resources/
    - artifacts:
      - loteinspectorappqmdashboard.zip
      name: loteinspectorappqmdashboard
      target-path: resources/
    - artifacts:
      - loteinspectorappqmrangos.zip
      name: loteinspectorappqmrangos
      target-path: resources/
    - artifacts:
      - loteinspectorappqmparametros.zip
      name: loteinspectorappqmparametros
      target-path: resources/
```

Recoge los cinco ZIPs producidos por los módulos `html5` de arriba y los
sube al HTML5 Application Repository. **Regla mecánica**: cada módulo
`html5` nuevo que agregues necesita una entrada correspondiente aquí en
`requires` — es exactamente el error que ocurrió al agregar `qm-rangos` y
`qm-parametros` si se hubiera olvidado este paso (aunque en este proyecto
el error real que ocurrió fue en el lockfile, no aquí — ver capítulo 09,
lección 11).

---

## Resources — los servicios de infraestructura

```yaml
resources:
- name: quality-managment-db
  type: com.sap.xs.hdi-container
  parameters:
    service: hana
    service-plan: hdi-shared
  properties:
    hdi-service-name: ${service-name}
```

HDI container propio del proyecto — nunca `existing-service` apuntando a
uno compartido con otro proyecto (eso generaría el mismo tipo de colisión
que la lección 2 documenta para destinations).

```yaml
- name: quality-managment-auth
  type: org.cloudfoundry.managed-service
  parameters:
    config:
      tenant-mode: dedicated
      xsappname: quality-managment-${org}-${space}
    path: ./xs-security.json
    service: xsuaa
    service-plan: application
    service-name: quality-managment-auth
```

`xsappname: quality-managment-${org}-${space}` — el `mta.yaml` le agrega
al `xsappname` base de `xs-security.json` (`quality-managment`, capítulo
06) el org y el space de destino, para que el xsappname efectivo en BTP
sea único incluso si el mismo MTA se despliega en varios espacios de la
misma subcuenta. `path: ./xs-security.json` es lo que conecta este
resource con los scopes/role-templates/role-collections del capítulo 06.

```yaml
- name: quality-managment-destination
  type: org.cloudfoundry.managed-service
  parameters:
    config:
      HTML5Runtime_enabled: true
      init_data:
        instance:
          destinations:
          - Authentication: NoAuthentication
            Name: ui5
            ProxyType: Internet
            Type: HTTP
            URL: https://ui5.sap.com
          - Authentication: NoAuthentication
            HTML5.DynamicDestination: true
            HTML5.ForwardAuthToken: true
            Name: quality-managment-srv-api
            ProxyType: Internet
            Type: HTTP
            URL: ~{srv-api/srv-url}
          existing_destinations_policy: update
    service: destination
    service-plan: lite
    service-name: quality-managment-destination
  requires:
  - name: srv-api
```

Dos destinations declaradas en `init_data`: una genérica a `ui5.sap.com`
(para cargar las librerías UI5 estándar) y **la crítica**:
`quality-managment-srv-api`, con `URL: ~{srv-api/srv-url}` — la
interpolación que resuelve, en tiempo de deploy, a la URL real del módulo
backend gracias al `provides: srv-api` visto más arriba. `HTML5Runtime_
enabled: true` es el flag que activa el modo managed approuter para este
destination específicamente. **Este es el nombre** (`quality-managment-
srv-api`) que debe coincidir exactamente con el campo `"destination"` de
cada `xs-app.json` de cada app (capítulo 05) — si no coinciden, toda
llamada OData desde la UI devuelve 404. Es justamente el nombre que en la
migración a managed approuter (lección 2) se renombró desde un genérico
`srv-api` que colisionaba entre proyectos.

```yaml
- name: quality-managment-html5-repo-host
  type: org.cloudfoundry.managed-service
  parameters:
    service: html5-apps-repo
    service-plan: app-host
    service-name: quality-managment-html5-repo-host
```

El servicio que almacena físicamente los ZIPs de las cinco apps
compiladas — lo que `quality-managment-app-content` sube y lo que
`quality-managment-destination-content` referencia.

---

## Comandos de build y deploy

```json
"scripts": {
  "build": "rimraf resources mta_archives && mbt build --mtar archive",
  "deploy": "cf deploy mta_archives/archive.mtar --retries 1"
}
```

```bash
# Autenticar contra Cloud Foundry
cf login -a https://api.cf.<region>.hana.ondemand.com \
         -u tu@email.com \
         -o tu-org \
         -s dev

# Build (limpia residuos, compila todo, produce el .mtar)
npm run build

# Deploy
npm run deploy
```

`rimraf resources mta_archives` antes de cada build evita mezclar
artefactos de un build anterior (por ejemplo, un ZIP de una app que ya no
existe) con los del build actual.

Si el deploy falla, el primer paso es revisar los logs del backend:

```bash
cf logs quality-managment-srv --recent
```

---

## Después del primer deploy: Cloud Foundry trial apaga las apps

Si tu subaccount es **trial**, Cloud Foundry detiene automáticamente las
apps en algún momento de inactividad (típicamente durante la noche). El
síntoma en Work Zone es un `404 - route does not exist` al abrir el tile
— no es un problema de configuración, es que el proceso simplemente no
está corriendo. Antes de investigar nada más, comprueba el estado real:

```bash
cf apps
```

Si ves `stopped` en `quality-managment-srv` (o en cualquier otro módulo,
salvo el `-db-deployer`, que corre una vez y termina por diseño), arráncalo:

```bash
cf start quality-managment-srv
```

Un alias útil para arrancar de una sola vez todo lo que esté detenido,
excluyendo los módulos `db-deployer` (que no deben re-arrancarse — ya
completaron su trabajo):

```bash
# en ~/.bashrc
alias cf-start-all='cf apps | awk "\$2==\"stopped\" && \$1 !~ /-db-deployer\$/ {print \$1}" | xargs -r -n1 cf start'
```

**Este alias no se ejecuta solo** — no hay ningún hook ni cron que lo
dispare cuando arranca tu dev space; tienes que invocarlo tú mismo
(`cf-start-all`) cada vez que vuelvas a trabajar en el proyecto después de
un rato de inactividad. Ver capítulo 09, lección 1, para más contexto.

---

## Configurar SAP Build Work Zone

Una vez el deploy terminó con éxito:

1. **BTP Cockpit → Security → Users → (tu usuario) → Assign Role
   Collection** — asigna la colección de BTP correspondiente
   (`QM_Inspector`/`QM_Supervisor`/`QM_Administrador`, capítulo 06).

2. **SAP Build Work Zone → Site Manager → Content Manager (o Channel
   Manager, según la versión)** — actualiza/refresca el **Content
   Channel** de HTML5 Apps. Si no lo haces, Work Zone puede seguir
   mostrando contenido cacheado de un deploy anterior, o incluso de
   **otro proyecto** que comparte el mismo Content Channel del
   subaccount — este fue exactamente el síntoma que apareció una vez en
   este proyecto (el catálogo mostraba una app de otro proyecto viejo).

3. **Asigna los roles de Work Zone** al site y a los usuarios reales,
   como se detalló en el capítulo 06 (Capa 2) — sin este paso, aunque el
   Content Channel esté actualizado, el usuario no ve el tile.

4. **Abre el site** y confirma que:
   - El tile de cada app aparece.
   - Al hacer clic, la app carga (no da 404 ni pantalla en blanco).
   - Las operaciones OData funcionan (crear un lote de prueba, por
     ejemplo) — confirma que la Capa 1 de autorización (capítulo 06)
     también está bien asignada.

Si algo de esto falla, revisa en este orden: (1) `cf apps` — ¿está todo
corriendo?; (2) Content Channel — ¿está actualizado?; (3) roles de Work
Zone — ¿están asignados al site y al usuario?; (4) role collections de
BTP — ¿están asignadas al usuario?

---

## Resumen / checklist

- [ ] `deploy_mode: html5-repo` en `parameters` — managed approuter, sin
      módulo `approuter.nodejs`.
- [ ] `before-all` corre `npm ci` + `npx cds build --production` antes de
      compilar cualquier módulo.
- [ ] Cada app UI nueva necesita: un módulo `html5` + una entrada en
      `requires` de `quality-managment-app-content`.
- [ ] El `sap.cloud.service` de `destination-content` coincide con el del
      `manifest.json` de cada app.
- [ ] El `Name` del destination (`quality-managment-srv-api`) coincide
      con el `destination` de cada `xs-app.json`.
- [ ] En trial, revisa `cf apps` antes de asumir un problema de
      configuración cuando Work Zone da 404 — probablemente solo está
      detenido.
- [ ] Refresca el Content Channel de HTML5 Apps después de cada deploy
      relevante — puede quedar cacheado, incluso con contenido de otro
      proyecto.
- [ ] Work Zone necesita sus propios roles asignados al site, además de
      (no en lugar de) las role collections de BTP.
