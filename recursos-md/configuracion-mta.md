# Guía: Cómo construir un mta.yaml desde cero

Supón que tienes un proyecto llamado **my-app** con:
- Un backend CAP (`srv/`)
- Dos apps UI: `app/orders` y `app/products`
- Base de datos HANA

---

## Paso 1 — Cabecera y parámetros globales

Siempre igual. Solo cambia el ID y la descripción.

```yaml
_schema-version: "3.1"
ID: my-app                          # ← nombre único de tu MTA
description: Mi aplicación CAP
version: 1.0.0

parameters:
  deploy_mode: html5-repo           # ← managed approuter (sin app/router/)
  enable-parallel-deployments: true # ← módulos en paralelo, más rápido

build-parameters:
  before-all:
  - builder: custom
    commands:
    - npm ci                         # ← instala dependencias
    - npx cds build --production     # ← genera gen/srv y gen/db
```

---

## Paso 2 — Módulo backend CAP

Siempre `type: nodejs`, `path: gen/srv` (generado por cds build).

```yaml
- name: my-app-srv
  type: nodejs
  path: gen/srv
  requires:
  - name: my-app-db           # ← necesita HANA para leer/escribir
  - name: my-app-auth         # ← necesita XSUAA para autenticar
  - name: my-app-destination  # ← necesita Destination para ser encontrado
  provides:
  - name: srv-api             # ← expone su URL para que otros módulos la usen
    properties:
      srv-url: ${default-url}
  parameters:
    buildpack: nodejs_buildpack
    instances: 1
  build-parameters:
    builder: npm-ci
```

**Por qué `provides: srv-api`**: el módulo de Destination necesita saber
la URL del backend para configurar la ruta. Con `provides` la expones
y otros módulos la referencian con `~{srv-api/srv-url}`.

---

## Paso 3 — Módulo db-deployer

Sube el schema CDS compilado a HANA. Siempre `type: hdb`, `path: gen/db`.

```yaml
- name: my-app-db-deployer
  type: hdb
  path: gen/db
  requires:
  - name: my-app-db           # ← solo necesita el HDI container
  parameters:
    buildpack: nodejs_buildpack
```

---

## Paso 4 — Módulos HTML5 (uno por app UI)

Cada app UI tiene su propio módulo. Solo buildean, no se despliegan solos.
El ZIP resultante lo recoge el app-deployer.

```yaml
# Primera app
- name: myapporders
  type: html5
  path: app/orders             # ← ruta a tu app UI
  build-parameters:
    build-result: dist         # ← dónde queda el ZIP después del build
    builder: custom
    commands:
    - npm install
    - npm run build:cf         # ← comando en el package.json de la app
    supported-platforms: []

# Segunda app
- name: myappproducts
  type: html5
  path: app/products
  build-parameters:
    build-result: dist
    builder: custom
    commands:
    - npm install
    - npm run build:cf
    supported-platforms: []
```

**Convención del nombre**: sin guiones ni puntos, todo junto en minúsculas.
El nombre debe coincidir con el `archiveName` en el `ui5-deploy.yaml` de cada app.

---

## Paso 5 — App deployer

Recoge los ZIPs de todas las apps UI y los sube al HTML5 Repo.
Agrega una entrada en `requires` por cada app UI que tengas.

```yaml
- name: my-app-app-deployer
  type: com.sap.application.content
  path: gen
  requires:
  - name: my-app-html5-repo-host
    parameters:
      content-target: true      # ← indica que este es el destino del contenido
  build-parameters:
    build-result: app/
    requires:
    - artifacts:
      - myapporders.zip         # ← nombre del ZIP (igual al archiveName del ui5-deploy.yaml)
      name: myapporders         # ← nombre del módulo HTML5 de arriba
      target-path: app/
    - artifacts:
      - myappproducts.zip
      name: myappproducts
      target-path: app/
```

**Regla**: por cada módulo `html5` que agregues en el Paso 4,
agrega una entrada aquí en `requires` con su ZIP correspondiente.

---

## Paso 6 — Destination content

Registra los destinations en el servicio Destination para que
Work Zone encuentre las apps. Siempre tiene la misma estructura —
solo cambia el `sap.cloud.service` (debe ser único y coincidir
con el del `manifest.json`).

```yaml
- name: my-app-destination-content
  type: com.sap.application.content
  requires:
  - name: my-app-destination
    parameters:
      content-target: true
  - name: my-app-html5-repo-host
    parameters:
      service-key:
        name: my-app-html5-repo-host-key
  - name: my-app-auth
    parameters:
      service-key:
        name: my-app-auth-key
  parameters:
    content:
      instance:
        destinations:
        - Name: my_app_repo_host
          ServiceInstanceName: my-app-html5-repo-host
          ServiceKeyName: my-app-html5-repo-host-key
          sap.cloud.service: my.app       # ← debe coincidir con manifest.json
        - Authentication: OAuth2UserTokenExchange
          Name: my_app_uaa
          ServiceInstanceName: my-app-auth
          ServiceKeyName: my-app-auth-key
          sap.cloud.service: my.app       # ← mismo valor
        existing_destinations_policy: update
  build-parameters:
    no-source: true
```

---

## Paso 7 — Resources

Los servicios de infraestructura que tus módulos consumen.

```yaml
resources:

# HDI Container — base de datos propia del proyecto
- name: my-app-db
  type: com.sap.xs.hdi-container
  parameters:
    service: hana
    service-plan: hdi-shared

# XSUAA — autenticación, lee el xs-security.json
- name: my-app-auth
  type: org.cloudfoundry.managed-service
  parameters:
    service: xsuaa
    service-plan: application
    service-name: my-app-auth        # ← nombre visible en cf services
    path: ./xs-security.json

# Destination — rutas hacia el backend y hacia ui5.sap.com
- name: my-app-destination
  type: org.cloudfoundry.managed-service
  requires:
  - name: srv-api                    # ← necesita la URL del backend
  parameters:
    service: destination
    service-plan: lite
    service-name: my-app-destination
    config:
      HTML5Runtime_enabled: true
      init_data:
        instance:
          existing_destinations_policy: update
          destinations:
          - Authentication: NoAuthentication
            HTML5.DynamicDestination: true
            HTML5.ForwardAuthToken: true
            Name: my-app-srv-api     # ← nombre del destination (debe coincidir con xs-app.json)
            ProxyType: Internet
            Type: HTTP
            URL: ~{srv-api/srv-url}  # ← URL del backend (viene del provides del srv)
          - Authentication: NoAuthentication
            Name: ui5
            ProxyType: Internet
            Type: HTTP
            URL: https://ui5.sap.com

# HTML5 Repo Host — almacena los ZIPs de las UIs
- name: my-app-html5-repo-host
  type: org.cloudfoundry.managed-service
  parameters:
    service: html5-apps-repo
    service-name: my-app-html5-service
    service-plan: app-host
```

---

## Checklist antes de hacer build

- [ ] El `ID` del MTA es único en tu space
- [ ] El `sap.cloud.service` en destination-content coincide con el del `manifest.json` de cada app
- [ ] El `Name` del destination (`my-app-srv-api`) coincide con el `destination` en el `xs-app.json` de cada app
- [ ] El `archiveName` en cada `ui5-deploy.yaml` coincide con el nombre del ZIP en el app-deployer
- [ ] El `xsappname` en `xs-security.json` coincide con el `service-name` del XSUAA resource
- [ ] Por cada app UI nueva: agregar módulo `html5` + entrada en app-deployer

---

## Qué cambia si agregas una tercera app UI

Solo dos lugares:

**1. Nuevo módulo HTML5:**
```yaml
- name: myappinvoices
  type: html5
  path: app/invoices
  build-parameters:
    build-result: dist
    builder: custom
    commands:
    - npm install
    - npm run build:cf
    supported-platforms: []
```

**2. Nueva entrada en app-deployer:**
```yaml
    - artifacts:
      - myappinvoices.zip
      name: myappinvoices
      target-path: app/
```

Nada más cambia — el mismo XSUAA, el mismo Destination, el mismo HTML5 Repo Host sirven para todas las apps del proyecto.