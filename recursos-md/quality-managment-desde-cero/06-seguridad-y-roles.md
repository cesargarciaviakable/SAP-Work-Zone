# 06 — Seguridad y roles

## Qué vas a aprender

Cómo se definen los tres roles de negocio en `xs-security.json`, cómo esos
roles llegan hasta los `@requires`/`@restrict` de los servicios CDS
(capítulo 03), cómo se prueban localmente sin un IdP real, y por qué en
BTP hacen falta **dos** capas separadas de autorización: la de scopes/role
collections del backend y la de roles de Work Zone para la visibilidad de
los tiles. Confundir esas dos capas fue la última traba que se encontró
desplegando este proyecto (ver la lección 16 del capítulo 09).

---

## El modelo de roles del proyecto

Solo tres roles de negocio, sin jerarquías intermedias:

| Rol | Quién lo tiene | Qué puede hacer |
|---|---|---|
| `Inspector` | Personal de planta que inspecciona lotes | `InspectorService` completo (capturar lotes, inspecciones, resultados) |
| `SupervisorCalidad` | Supervisores de calidad | `SupervisorService` completo (revisar y decidir) |
| `Administrador` | Quien mantiene catálogos | `ConfigService` completo (rangos, parámetros) |

`ReportsService` es la excepción: lo pueden usar los tres roles, porque es
de solo lectura y todos necesitan ver reportes.

---

## `xs-security.json` — declarando el rol en BTP

```json
{
  "xsappname": "quality-managment",
  "tenant-mode": "dedicated",
  "description": "Security config for Quality Management - Lote Inspector",
  "oauth2-configuration": {
    "token-validity": 3600,
    "refresh-token-validity": 43200,
    "redirect-uris": [
      "https://*.hana.ondemand.com/**"
    ]
  },
  "scopes": [
    { "name": "$XSAPPNAME.Inspector",         "description": "Captura resultados de inspección de lotes" },
    { "name": "$XSAPPNAME.SupervisorCalidad", "description": "Revisa inspecciones y toma decisiones de liberación" },
    { "name": "$XSAPPNAME.Administrador",     "description": "Acceso completo incluyendo catálogos y reportes" }
  ],
  "attributes": [],
  "role-templates": [
    { "name": "Inspector",         "description": "Inspector de calidad — captura resultados", "scope-references": ["$XSAPPNAME.Inspector"] },
    { "name": "SupervisorCalidad", "description": "Supervisor de calidad — aprueba o rechaza lotes", "scope-references": ["$XSAPPNAME.SupervisorCalidad"] },
    {
      "name": "Administrador",
      "description": "Administrador — acceso total",
      "scope-references": [
        "$XSAPPNAME.Inspector",
        "$XSAPPNAME.SupervisorCalidad",
        "$XSAPPNAME.Administrador"
      ]
    }
  ],
  "role-collections": [
    { "name": "QM_Inspector",      "description": "Colección para inspectores de calidad",      "role-template-references": ["$XSAPPNAME.Inspector"] },
    { "name": "QM_Supervisor",     "description": "Colección para supervisores de calidad",      "role-template-references": ["$XSAPPNAME.SupervisorCalidad"] },
    { "name": "QM_Administrador",  "description": "Colección para administradores del sistema",  "role-template-references": ["$XSAPPNAME.Administrador"] }
  ]
}
```

Tres capas, de abajo hacia arriba:

1. **`scopes`** — el permiso atómico que XSUAA incluye en el token JWT.
   `$XSAPPNAME` se sustituye en tiempo de deploy por el `xsappname` real
   (con el sufijo `-${org}-${space}` que agrega el `mta.yaml`, ver
   capítulo 07).
2. **`role-templates`** — agrupan uno o más scopes bajo un nombre de rol.
   Nota que `Administrador` referencia **los tres** scopes, no solo el
   suyo — un administrador puede hacer todo lo que hace un inspector y un
   supervisor además de administrar catálogos. `Inspector` y
   `SupervisorCalidad`, en cambio, referencian solo su propio scope.
3. **`role-collections`** — lo que un administrador de BTP le asigna a un
   usuario real desde el cockpit (`QM_Inspector`, `QM_Supervisor`,
   `QM_Administrador`). Cada colección envuelve exactamente un
   role-template.

**Por qué el nombre del scope (`Inspector`) coincide exactamente con el
que usan `@requires`/`@restrict` en los `.cds`**: no es casualidad — CAP,
al correr con `auth: xsuaa` en producción, compara el rol que declara el
`.cds` contra los scopes del token JWT del usuario autenticado, buscando
`$XSAPPNAME.<rol>`. Si el nombre del rol en el `.cds` no coincide
exactamente (mayúsculas incluidas) con el de un `scope-reference`, la
autorización simplemente nunca se concede.

---

## De `xs-security.json` a `@requires`/`@restrict`

Repaso rápido del capítulo 03, ahora desde el ángulo de seguridad:

```cds
// srv/inspector-service.cds
@requires: 'Inspector'
service InspectorService { /* ... */ }
```

```cds
// srv/reports-service.cds
@requires: ['Inspector', 'SupervisorCalidad', 'Administrador']
service ReportsService { /* ... */ }
```

```cds
// srv/inspector-service.cds — dentro de InspectorService
@restrict: [
    { grant: 'READ',   to: 'Inspector' },
    { grant: 'CREATE', to: 'Inspector' },
    { grant: 'UPDATE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' },
    { grant: 'DELETE', to: 'Inspector', where: 'status_code = ''PENDIENTE'' or status_code = ''EN_INSPECCION''' }
]
entity Lotes as projection on db.Lotes { /* ... */ }
```

`@requires` a nivel de servicio es la primera puerta (sin el rol, ni
siquiera se puede leer el `$metadata`). `@restrict` a nivel de entidad es
la segunda puerta, más fina: distingue operación (`READ`/`CREATE`/
`UPDATE`/`DELETE`/nombre de acción bound) y, opcionalmente, agrega una
condición `where` evaluada fila por fila. Los tres nombres de rol que
aparecen en todos los `@requires`/`@restrict` del proyecto
(`Inspector`, `SupervisorCalidad`, `Administrador`) son exactamente los
tres `role-templates` de `xs-security.json` — ni uno más.

---

## Probar los roles en local sin XSUAA

```json
// package.json
"cds": {
  "requires": {
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
}
```

`kind: "mocked"` reemplaza a XSUAA en desarrollo: no hay token JWT real,
CAP simplemente confía en HTTP Basic Auth contra estos usuarios
declarados en el propio `package.json`. Cada usuario tiene exactamente los
roles que necesitas para probar un caso concreto sin tener que dar de alta
un usuario en un IdP:

- `alice` — los tres roles, para probar flujos que cruzan más de un
  servicio o para administración.
- `bob` — solo `Inspector`, para confirmar que le funciona todo lo de
  `InspectorService`/`ReportsService` y que le rechazan todo lo demás
  (los tests de `config-service.test.js`, capítulo 08, usan justamente a
  `bob` para el caso `403`).
- `carol` — solo `SupervisorCalidad`, simétrico a `bob`.

Nadie tiene `Administrador` en solitario porque en este proyecto ese rol
no tiene ninguna app dedicada propia más allá de `ConfigService` (que
comparten `qm-rangos` y `qm-parametros`) — `alice` cubre ese caso.

---

## Producción: dos capas de autorización que no deben confundirse

Este es el punto que costó más tiempo resolver en el despliegue real de
este proyecto (capítulo 09, lección 16), y merece quedar explícito aquí en
lugar de asumirlo implícito:

```
┌─────────────────────────────────────────────────────────┐
│  Capa 1 — Autorización del backend (BTP role collections)│
│  QM_Inspector / QM_Supervisor / QM_Administrador          │
│  (definidas en xs-security.json, asignadas en             │
│   BTP Cockpit → Security → Users → Assign Role Collection)│
│                                                             │
│  Controla: si una llamada OData al backend se acepta o     │
│  se rechaza con 403 — independiente de si el usuario ve    │
│  el tile en Work Zone o no.                                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Capa 2 — Visibilidad en SAP Build Work Zone               │
│  Roles de Work Zone (p. ej. QM_Supervisor_App,              │
│  QM_Inspector_App) asignados a un Site, que a su vez         │
│  agrupan qué tiles/apps aparecen para ese Work Zone role     │
│                                                             │
│  Controla: si el usuario ve el tile de la app en su          │
│  launchpad — no autoriza nada del backend por sí sola.       │
└─────────────────────────────────────────────────────────┘
```

**Un usuario necesita ambas capas para usar una app de verdad**: la
BTP role collection para que el backend acepte sus llamadas OData, y el
rol de Work Zone para que el tile de la app aparezca en su launchpad. Dar
solo una de las dos produce alguno de estos dos síntomas confusos:

- Tiene la role collection de BTP pero no el rol de Work Zone → no ve el
  tile, aunque si accediera a la URL directa del backend sí podría operar.
- Tiene el rol de Work Zone pero no la role collection de BTP → ve el
  tile, lo abre, y todas las llamadas OData le devuelven `403`.

### Pasos para asignar ambas capas

**Capa 1 — BTP Cockpit**:

1. **Security → Users → (usuario) → Assign Role Collection**
2. Asigna la colección que corresponda: `QM_Inspector`, `QM_Supervisor`, o
   `QM_Administrador` (los nombres exactos de `xs-security.json`).

**Capa 2 — SAP Build Work Zone**:

1. **Site Manager → Role Management** (o el menú equivalente de tu
   versión de Work Zone) → crea un rol de Work Zone por perfil, por
   ejemplo `QM_Supervisor_App`, `QM_Inspector_App`.
2. Asocia cada rol de Work Zone con los tiles/apps que le corresponden
   (los grupos y catálogos donde viven las apps de `qm-inspector`,
   `qm-supervisor`, etc).
3. **Importante**: quita las apps QM del rol `Everyone` si estaba ahí por
   defecto — si no, cualquier usuario del site las ve, sin importar el
   rol de Work Zone real que tenga asignado.
4. En el **Site** (Site Directory / configuración del site), confirma que
   esos roles de Work Zone están efectivamente asignados al site — un rol
   de Work Zone creado pero no asignado al site correcto no produce
   ningún tile visible, sin ningún mensaje de error obvio. Este fue,
   concretamente, el último bloqueador encontrado en este proyecto: los
   roles de Work Zone existían y estaban bien configurados, pero no
   estaban asignados en la configuración del site.
5. Asigna a cada usuario real el rol de Work Zone correspondiente (además
   de, no en lugar de, la role collection de BTP del paso anterior).

---

## `csrfProtection` y el token CSRF

Mencionado también en el capítulo 05/07: cada `xs-app.json` de app UI
declara `"csrfProtection": true` en su ruta OData. Fiori Elements gestiona
el token CSRF automáticamente (pide un `GET` con header
`X-CSRF-Token: Fetch` antes de la primera escritura, y lo reenvía en cada
`POST`/`PATCH`/`DELETE`) — no requiere ningún código adicional en el
frontend, pero si alguna vez pruebas los endpoints con una herramienta que
no maneja CSRF (Postman sin configurar, un `curl` directo a un método de
escritura), vas a recibir un 403 aunque el rol y la role collection estén
bien. No lo pongas en `false` salvo temporalmente, en desarrollo, para
aislar ese caso.

---

## Resumen / checklist

- [ ] Los nombres de rol en `@requires`/`@restrict` (`.cds`) coinciden
      exactamente, carácter por carácter, con los `role-templates` de
      `xs-security.json`.
- [ ] `@requires` a nivel de servicio es la primera puerta; `@restrict` a
      nivel de entidad, con `where`, es la segunda y más fina.
- [ ] Los usuarios mockeados de `[development]` cubren cada rol por
      separado para poder probar rechazo/aceptación de forma aislada.
- [ ] En producción hacen falta **dos** asignaciones independientes por
      usuario: la role collection de BTP (autoriza el backend) y el rol
      de Work Zone (muestra el tile) — ninguna de las dos sustituye a la
      otra.
- [ ] Un rol de Work Zone que existe pero no está asignado al site
      correcto no produce tiles visibles, sin error explícito — revisa la
      configuración del site, no solo la del rol.
- [ ] `csrfProtection: true` siempre en la ruta OData de cada
      `xs-app.json` — Fiori Elements lo maneja solo.
