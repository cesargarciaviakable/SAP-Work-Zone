# Guía: Flujo completo para crear una app CAP + Fiori desde cero

Esta guía es el mapa de ruta completo. Sigue los pasos en orden —
cada uno depende del anterior. Al final tienes una app desplegada
en BTP con managed approuter, HANA, y Work Zone.

---

## Visión general del flujo

```
1. Inicializar proyecto CAP
2. Definir el schema (datos)
3. Agregar datos semilla (opcional)
4. Definir los servicios (.cds)
5. Agregar lógica de negocio (.js)
6. Configurar package.json
7. Generar las apps UI (Fiori Generator)
8. Escribir las anotaciones
9. Configurar xs-security.json
10. Revisar y ajustar mta.yaml
11. Build y deploy
12. Configurar Work Zone
```

---

## Paso 1 — Inicializar el proyecto CAP

Desde la terminal en BAS, en la carpeta donde quieres el proyecto:

```bash
# Opción A — proyecto nuevo en carpeta nueva
cds init my-app

# Opción B — proyecto en la carpeta actual
cds init .
```

Esto genera la estructura base:

```
my-app/
├── db/
│   └── schema.cds        ← vacío, aquí van tus entidades
├── srv/
│   └── .gitkeep          ← aquí van tus servicios
├── package.json
└── .cdsrc.json
```

Luego instala las dependencias:

```bash
cd my-app
npm install
```

Agrega las dependencias de producción que siempre necesitas:

```bash
npm add @sap/xssec @cap-js/hana
```

---

## Paso 2 — Definir el schema (db/schema.cds)

Define tus entidades antes de cualquier otra cosa.
El schema es la base — todo lo demás depende de él.

```cds
namespace my.app;

using { cuid, managed } from '@sap/cds/common';

entity Orders : cuid, managed {
    title       : String(100)  @mandatory;
    description : String(500);
    status      : OrderStatus  default 'draft';
    amount      : Decimal(10,2);
    customer    : Association to Customers;
    items       : Composition of many OrderItems on items.order = $self;
}

entity Customers : cuid, managed {
    name  : String(100) @mandatory;
    email : String(100) @mandatory;
    phone : String(20);
}

entity OrderItems : cuid {
    order    : Association to Orders;
    product  : String(100);
    quantity : Integer default 1;
    price    : Decimal(10,2);
}

type OrderStatus : String(20) enum {
    draft     = 'draft';
    confirmed = 'confirmed';
    shipped   = 'shipped';
    cancelled = 'cancelled';
}
```

**Qué revisar antes de continuar**:
- Todos los campos obligatorios tienen `@mandatory`
- Las asociaciones y composiciones están en la dirección correcta
- Los tipos de dato son apropiados (String con longitud, Decimal con precisión)
- El namespace coincide con el que usarás en los services

---

## Paso 3 — Datos semilla (db/data/*.csv)

Agrega datos iniciales para ValueLists o para desarrollo local.
Los CSVs se despliegan a HANA en el primer deploy.

El nombre del archivo debe seguir el patrón:
`{namespace}-{Entidad}.csv`

```
db/data/
├── my.app-Customers.csv
├── my.app-Orders.csv      ← opcional, solo si quieres datos de prueba
└── my.app-OrderStatuses.csv  ← si tienes entidad de estados para ValueList
```

Ejemplo de CSV:

```csv
ID,name,email,phone
"550e8400-e29b-41d4-a716-446655440001","Acme Corp","contact@acme.com","+1-555-0100"
"550e8400-e29b-41d4-a716-446655440002","Globex Corp","info@globex.com","+1-555-0200"
```

**Cuándo son necesarios**:
- Para entidades de referencia que alimentan ValueLists (siempre necesarios)
- Para datos de prueba en desarrollo (opcionales)
- Para configuración inicial que no cambia (roles, categorías, etc.)

**Cuándo omitirlos**:
- Entidades transaccionales que el usuario llena (Orders, Bookings, Tasks)

---

## Paso 4 — Definir los servicios (srv/*.cds)

Un archivo por caso de uso, no uno por entidad.

```cds
// srv/order-service.cds
using { my.app as db } from '../db/schema';

@requires: 'authenticated-user'
service OrderService {

    @odata.draft.enabled
    entity Orders as projection on db.Orders {
        *,
        customer.name as customerName : String
    };

    @readonly
    entity Customers as projection on db.Customers;

    entity Orders as projection on db.Orders actions {
        action confirmOrder(comment : String) returns Orders;
        action cancelOrder(reason   : String) returns Orders;
    };

    function getPendingCount() returns Integer;
}
```

**Qué revisar**:
- `@requires: 'authenticated-user'` en el servicio o en cada entidad
- `@readonly` en entidades de referencia
- `@odata.draft.enabled` solo en entidades con formulario de edición
- Acciones bound definidas dentro del bloque `actions { }` de la entidad
- Funciones (no actions) para operaciones de solo lectura

---

## Paso 5 — Lógica de negocio (srv/*.js)

Un archivo `.js` por cada `.cds` de servicio, con el mismo nombre.

```js
// srv/order-service.js
const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = require('@sap/cds/lib/ql/cds-ql')

module.exports = class OrderService extends cds.ApplicationService {
    async init() {
        const { Orders, Customers } = this.entities

        // Validaciones al guardar (draft)
        this.before('SAVE', Orders, async (req) => {
            const { amount } = req.data
            if (amount <= 0)
                return req.error(400, 'El monto debe ser mayor a cero.')
        })

        // Acción bound: confirmar pedido
        this.on('confirmOrder', Orders, async (req) => {
            const { ID } = req.params[0]
            const { comment } = req.data

            const order = await SELECT.one.from(Orders).where({ ID })
            if (!order) return req.error(404, 'Pedido no encontrado.')
            if (order.status !== 'draft')
                return req.error(400, 'Solo puedes confirmar pedidos en borrador.')

            await UPDATE(Orders).set({
                status     : 'confirmed',
                confirmedBy: req.user.id,
                confirmedAt: new Date().toISOString()
            }).where({ ID })

            return SELECT.one.from(Orders).where({ ID })
        })

        await super.init()
    }
}
```

**Qué revisar**:
- `before('SAVE')` para validaciones con draft, `before('CREATE')` sin draft
- Acciones custom siempre en `this.on()`
- Cada acción verifica existencia y estado antes de operar
- Acciones bound devuelven el registro actualizado
- `await super.init()` al final

---

## Paso 6 — Configurar package.json

Agrega la sección `cds` con la configuración de producción.
Sin esto, CAP no sabe que debe usar HANA en producción.

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "@cap-js/hana": "^1",
    "@sap/cds"    : "^9",
    "@sap/xssec"  : "^4"
  },
  "devDependencies": {
    "@cap-js/sqlite": "^1",
    "@sap/cds-dk"   : "^9",
    "cds-plugin-ui5": "^0.17.0",
    "mbt"           : "^1.2.49",
    "rimraf"        : "^5.0.5"
  },
  "cds": {
    "requires": {
      "db": {
        "[hybrid]"    : { "kind": "hana" },
        "[production]": { "kind": "hana" }
      }
    },
    "[production]": {
      "requires": {
        "auth": "xsuaa"
      }
    }
  },
  "scripts": {
    "start"  : "cds-serve",
    "build"  : "rimraf resources mta_archives && mbt build --mtar archive",
    "deploy" : "cf deploy mta_archives/archive.mtar --retries 1",
    "undeploy": "cf undeploy my-app --delete-services --delete-service-keys"
  }
}
```

**Qué revisar**:
- `@sap/xssec` y `@cap-js/hana` en `dependencies` (no devDependencies)
- La sección `cds.requires.db` con los perfiles `[hybrid]` y `[production]`
- La sección `[production].requires.auth: "xsuaa"`
- El script `undeploy` con el ID correcto del MTA

---

## Paso 7 — Generar las apps UI (Fiori Generator)

Una app por entidad principal que el usuario va a ver.

Para cada app:

1. Abre el Fiori Generator en BAS
2. Selecciona **List Report Page**
3. **Data Source**: Connect to a CAP project → selecciona tu proyecto
4. **OData service**: selecciona el servicio correcto
5. **Main entity**: selecciona la entidad
6. **Automatically add table columns**: **No**
7. **Project Attributes**:
   - Module name: `myapporders` (sin guiones, sin puntos)
   - Namespace: `my.app`
   - Add Launchpad configuration: **Yes**
   - Semantic Object: `Orders` (único por app)
8. **Deployment Configuration** → **Cloud Foundry**
   - Destination: selecciona el destination del backend
   - Primera app: crear nuevo mta.yaml
   - Segunda app en adelante: agregar al mta.yaml existente
9. Selecciona **Managed Approuter**

---

## Paso 8 — Escribir las anotaciones (app/{app}/annotations.cds)

El generator no crea este archivo — lo creas tú.

```
app/
└── orders/
    ├── annotations.cds   ← crear manualmente
    ├── manifest.json
    └── xs-app.json
```

```cds
// app/orders/annotations.cds
using OrderService as service from '../../srv/order-service';

annotate service.Orders with @(
    UI.LineItem: [
        { Value: title,        Label: 'Título'   },
        { Value: customerName, Label: 'Cliente'  },
        { Value: amount,       Label: 'Monto'    },
        { Value: status,       Label: 'Estado'   }
    ],
    UI.HeaderInfo: {
        TypeName      : 'Pedido',
        TypeNamePlural: 'Pedidos',
        Title         : { Value: title        },
        Description   : { Value: customerName }
    },
    UI.Facets: [{
        $Type : 'UI.ReferenceFacet',
        Label : 'Detalles',
        Target: '@UI.FieldGroup#General'
    }],
    UI.FieldGroup #General: {
        Data: [
            { Value: title       },
            { Value: customer_ID, Label: 'Cliente' },
            { Value: amount      },
            { Value: status      },
            { Value: description }
        ]
    },
    UI.Identification: [
        { $Type: 'UI.DataFieldForAction', Action: 'OrderService.confirmOrder', Label: 'Confirmar' },
        { $Type: 'UI.DataFieldForAction', Action: 'OrderService.cancelOrder',  Label: 'Cancelar'  }
    ],
    UI.SelectionFields: [status, customer_ID]
);

annotate service.Orders with {
    status      @Common.ValueListWithFixedValues: true;
    title       @title: 'Título';
    amount      @title: 'Monto';
    description @title: 'Descripción';
    customer    @Common.ValueList: {
        CollectionPath: 'Customers',
        Parameters: [
            { $Type: 'Common.ValueListParameterInOut',     LocalDataProperty: customer_ID, ValueListProperty: 'ID'    },
            { $Type: 'Common.ValueListParameterDisplayOnly',                                ValueListProperty: 'name'  },
            { $Type: 'Common.ValueListParameterDisplayOnly',                                ValueListProperty: 'email' }
        ]
    };
};
```

---

## Paso 9 — xs-security.json

En la raíz del proyecto:

```json
{
  "xsappname": "my-app",
  "tenant-mode": "dedicated",
  "description": "Security for My App",
  "oauth2-configuration": {
    "token-validity": 3600,
    "refresh-token-validity": 43200,
    "redirect-uris": [
      "https://*.cfapps.us10-001.hana.ondemand.com/**",
      "https://*.hana.ondemand.com/**"
    ]
  },
  "scopes": [
    { "name": "$XSAPPNAME.User", "description": "Access to My App" }
  ],
  "role-templates": [
    { "name": "User", "description": "Access to My App", "scope-references": ["$XSAPPNAME.User"] }
  ],
  "role-collections": [
    { "name": "MyApp_User", "description": "Access to My App", "role-template-references": ["$XSAPPNAME.User"] }
  ]
}
```

**Qué revisar**:
- `xsappname` es único en tu subaccount
- `redirect-uris` incluye el dominio de tu subaccount BTP
- `role-collections` tiene al menos una colección para asignarte a ti

---

## Paso 10 — Revisar y ajustar mta.yaml

El generator crea un `mta.yaml` básico pero siempre necesita ajustes.

**Agrega si no está**:

```yaml
parameters:
  deploy_mode: html5-repo          # ← managed approuter
  enable-parallel-deployments: true

build-parameters:
  before-all:
  - builder: custom
    commands:
    - npm ci
    - npx cds build --production   # ← genera gen/srv y gen/db
```

**Cambia el builder del srv**:
```yaml
build-parameters:
  builder: npm-ci    # ← en lugar de npm
```

**Verifica que el HDI container sea propio**:
```yaml
resources:
- name: my-app-db
  type: com.sap.xs.hdi-container   # ← no existing-service
  parameters:
    service: hana
    service-plan: hdi-shared
```

**Verifica los nombres de destinations**:
```yaml
# En el resource destination
- Name: my-app-srv-api    # ← este nombre

# En el xs-app.json de cada app
"destination": "my-app-srv-api"    # ← mismo nombre
```

---

## Paso 11 — Revisar xs-app.json de cada app

Cada app generada tiene su `xs-app.json`. Verifica que sea:

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

**Corrige**:
- `csrfProtection: false` → `true`
- Elimina rutas de `/resources` y `/test-resources`
- Verifica que `destination` coincide con el nombre en `mta.yaml`

---

## Paso 12 — Revisar manifest.json de cada app

El generator lo genera bien en su mayoría. Verifica:

```json
{
  "sap.cloud": {
    "public": true,
    "service": "my.app"    // ← coincide con mta.yaml
  },
  "sap.fe": {
    "app": {
      "enableLazyLoading": true    // ← el generator lo pone en false
    }
  }
}
```

---

## Paso 13 — Build y deploy

```bash
# Primero autentica en CF
cf login -a https://api.cf.us10-001.hana.ondemand.com \
         -u tu@email.com \
         -o tu-org-trial \
         -s dev

# Build y deploy
npm run build && npm run deploy
```

Si el deploy falla, revisa los logs:
```bash
cf logs my-app-srv --recent
```

Los errores más comunes y su causa:
- `Cannot find module '@sap/xssec'` → no está en `dependencies`
- `Cannot find module '@cap-js/hana'` → no está en `dependencies`
- `Cannot find module './archivo'` → el archivo no se copió al `gen/srv`
- `sql syntax error` con draft → campo `case/when` en entidad con draft
- `NO_DATABASE_CONNECTION` → falta `[production].kind: "hana"` en `package.json`

---

## Paso 14 — Configurar Work Zone

Después del primer deploy exitoso:

1. **BTP Cockpit → Security → Users → tu usuario**
   → Assign Role Collections → agrega `MyApp_User`

2. **SAP Build Work Zone → Site Manager**
   → actualiza el Content Channel
   → la app aparece disponible para agregar al site

3. **En el site**, agrega la app al launchpad y verifica que
   el tile aparece y la app carga correctamente.

---

## Resumen del orden y dependencias

```
schema.cds         ← base de todo, primero siempre
    ↓
db/data/*.csv      ← datos semilla, depende del schema
    ↓
srv/*.cds          ← expone el schema, depende del schema
    ↓
srv/*.js           ← lógica, depende del service.cds
    ↓
package.json       ← configuración de producción, independiente
    ↓
Fiori Generator    ← genera la estructura UI, depende del service.cds
    ↓
annotations.cds    ← UI del servicio, depende del service.cds y del manifest
    ↓
xs-security.json   ← autenticación, independiente
    ↓
mta.yaml           ← infraestructura, depende de todo lo anterior
    ↓
xs-app.json        ← routing, depende del mta.yaml (nombre del destination)
    ↓
manifest.json      ← configuración de la app, depende del mta.yaml (sap.cloud.service)
    ↓
Build y deploy
    ↓
Work Zone
```

---

## Checklist final antes de hacer build

### Schema y datos
- [ ] Namespace del schema coincide con el del service.cds
- [ ] CSVs de ValueLists tienen datos

### Servicios
- [ ] `@requires: 'authenticated-user'` en cada servicio
- [ ] `@odata.draft.enabled` en entidades con formulario
- [ ] `await super.init()` al final de cada service.js
- [ ] Sin `cds.transaction(req)` — innecesario en CAP moderno

### package.json
- [ ] `@sap/xssec` y `@cap-js/hana` en `dependencies`
- [ ] Sección `cds` con perfiles `[hybrid]` y `[production]`

### Fiori Generator y UI
- [ ] Una app generada por entidad principal
- [ ] `annotations.cds` creado manualmente en cada carpeta de app
- [ ] `csrfProtection: true` en cada `xs-app.json`
- [ ] Sin rutas de `/resources` en cada `xs-app.json`
- [ ] `enableLazyLoading: true` en cada `manifest.json`
- [ ] `sap.cloud.service` en `manifest.json` coincide con `mta.yaml`

### xs-security.json
- [ ] `xsappname` único en el subaccount
- [ ] Al menos una `role-collection` definida

### mta.yaml
- [ ] `deploy_mode: html5-repo`
- [ ] `before-all` con `npm ci` y `npx cds build --production`
- [ ] HDI container como `com.sap.xs.hdi-container` (no existing-service)
- [ ] Nombre del destination coincide con el `xs-app.json`
- [ ] Sin módulo `approuter.nodejs` (managed approuter)