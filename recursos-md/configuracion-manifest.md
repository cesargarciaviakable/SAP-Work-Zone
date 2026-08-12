# Guía: Cómo construir un manifest.json desde cero

Supón que tienes un proyecto **my-app** con una app UI llamada `orders`
que muestra una entidad `Orders` del servicio CAP `OrderService`.

---

## Estructura completa comentada

```json
{
  "_version": "1.65.0",

  "sap.app": {
    "id": "my.app.orders",
    "type": "application",
    "i18n": "i18n/i18n.properties",
    "applicationVersion": { "version": "0.0.1" },
    "title": "{{appTitle}}",
    "description": "{{appDescription}}",
    "resources": "resources.json",

    "dataSources": {
      "mainService": {
        "uri": "/odata/v4/order/",
        "type": "OData",
        "settings": {
          "annotations": [],
          "odataVersion": "4.0"
        }
      }
    },

    "crossNavigation": {
      "inbounds": {
        "Orders-display": {
          "semanticObject": "Orders",
          "action": "display",
          "title": "{{Orders-display.flpTitle}}",
          "icon": "sap-icon://sales-order",
          "signature": {
            "parameters": {},
            "additionalParameters": "allowed"
          }
        }
      }
    }
  },

  "sap.cloud": {
    "public": true,
    "service": "my.app"
  },

  "sap.ui": {
    "technology": "UI5",
    "icons": {
      "icon": "", "favIcon": "",
      "phone": "", "phone@2": "",
      "tablet": "", "tablet@2": ""
    },
    "deviceTypes": {
      "desktop": true,
      "tablet": true,
      "phone": true
    }
  },

  "sap.ui5": {
    "flexEnabled": true,
    "dependencies": {
      "minUI5Version": "1.120.0",
      "libs": {
        "sap.m": {},
        "sap.ui.core": {},
        "sap.fe.templates": {}
      }
    },
    "contentDensities": {
      "compact": true,
      "cozy": true
    },
    "models": {
      "i18n": {
        "type": "sap.ui.model.resource.ResourceModel",
        "settings": {
          "bundleName": "my.app.orders.i18n.i18n"
        }
      },
      "": {
        "dataSource": "mainService",
        "preload": true,
        "settings": {
          "operationMode": "Server",
          "autoExpandSelect": true,
          "earlyRequests": true
        }
      }
    },
    "routing": {
      "config": {},
      "routes": [
        {
          "pattern": ":?query:",
          "name": "OrdersList",
          "target": "OrdersList"
        },
        {
          "pattern": "Orders({key}):?query:",
          "name": "OrdersObjectPage",
          "target": "OrdersObjectPage"
        }
      ],
      "targets": {
        "OrdersList": {
          "type": "Component",
          "id": "OrdersList",
          "name": "sap.fe.templates.ListReport",
          "options": {
            "settings": {
              "contextPath": "/Orders",
              "initialLoad": "Enabled",
              "variantManagement": "Page",
              "navigation": {
                "Orders": {
                  "detail": {
                    "route": "OrdersObjectPage"
                  }
                }
              }
            }
          }
        },
        "OrdersObjectPage": {
          "type": "Component",
          "id": "OrdersObjectPage",
          "name": "sap.fe.templates.ObjectPage",
          "options": {
            "settings": {
              "contextPath": "/Orders",
              "editableHeaderContent": false
            }
          }
        }
      }
    }
  },

  "sap.fiori": {
    "registrationIds": [],
    "archeType": "transactional"
  },

  "sap.fe": {
    "app": {
      "enableLazyLoading": true
    }
  }
}
```

---

## Sección por sección

### `sap.app.id`

Identificador único de la app. Usa el formato `namespace.proyecto.app`.
Debe coincidir con `metadata.name` en el `ui5-deploy.yaml`.

```
my.app.orders
│   │    └─ nombre de la app (igual que la carpeta en app/)
│   └───── nombre del proyecto
└───────── namespace de tu organización o proyecto
```

### `sap.app.dataSources.mainService.uri`

La ruta al servicio OData. CAP la construye automáticamente como:

```
/odata/v4/ + nombre del servicio en minúsculas + /
```

Ejemplos:

| Servicio en .cds          | URI en manifest              |
|---------------------------|------------------------------|
| `service OrderService`    | `/odata/v4/order/`           |
| `service BookingService`  | `/odata/v4/booking/`         |
| `service TaskService`     | `/odata/v4/task/`            |
| `service ApprovalService` | `/odata/v4/approval/`        |

Si el nombre tiene varias palabras (`service SalesOrderService`),
CAP lo convierte a kebab-case: `/odata/v4/sales-order/`.

### `sap.app.crossNavigation.inbounds`

Define cómo aparece la app en Work Zone. La clave (`Orders-display`)
es el identificador interno — por convención es `SemanticObject-action`.

- `semanticObject` — nombre del objeto de negocio. Único por app.
- `action` — siempre `display` para apps de consulta/gestión.
- `title` — referencia al i18n. Agrégalo en `i18n/i18n.properties`.
- `icon` — cualquier `sap-icon://`. Busca iconos en
  https://sapui5.hana.ondemand.com/sdk/#/topic/icon-explorer

### `sap.cloud.service`

Conecta la app con el MTA. Debe ser el mismo valor en tres lugares:

```
manifest.json           → "sap.cloud.service": "my.app"
mta.yaml                → sap.cloud.service: my.app  (en destination-content)
```

Si no coinciden, Work Zone no registra la app aunque el deploy sea exitoso.

### `sap.ui5.dependencies.minUI5Version`

Usa al menos `1.90.0` para `sap.fe.templates`. Valores recomendados:

- `1.108.0` — estable, compatible con la mayoría de entornos
- `1.120.0` — LTS actual, recomendado para proyectos nuevos
- `1.148.0+` — versiones recientes, las que genera el Fiori generator

### `sap.ui5.models`

El modelo `i18n` usa `bundleName` que es el `sap.app.id` + `.i18n.i18n`:

```json
"bundleName": "my.app.orders.i18n.i18n"
//             └──────────────┘ └──────┘
//             sap.app.id      carpeta/archivo i18n
```

### `sap.ui5.routing`

El patrón siempre es el mismo para List Report + Object Page.
Lo único que cambia es el nombre de la entidad:

```json
"pattern": "Orders({key}):?query:"
//          └─────┘
//          nombre de la entidad en el servicio CAP (con mayúscula)

"contextPath": "/Orders"
//              └─────┘
//              mismo nombre, con / al inicio
```

La navegación conecta ambas pantallas:

```json
"navigation": {
    "Orders": {              // ← nombre de la entidad
        "detail": {
            "route": "OrdersObjectPage"   // ← nombre del target
        }
    }
}
```

---

## Checklist para un manifest nuevo

- [ ] `sap.app.id` coincide con `metadata.name` del `ui5-deploy.yaml`
- [ ] `dataSources.uri` usa el nombre del servicio CAP en minúsculas
- [ ] `crossNavigation.semanticObject` es único entre todas tus apps
- [ ] `sap.cloud.service` coincide con el del `mta.yaml`
- [ ] `models.i18n.bundleName` es `sap.app.id` + `.i18n.i18n`
- [ ] `contextPath` coincide con el nombre de la entidad en el `.cds`
- [ ] La navegación en `targets.OrdersList` apunta al nombre correcto del Object Page

---

## Lo que nunca necesitas cambiar

Estas secciones salen del Fiori generator y son iguales en todos los proyectos:

```json
"sap.ui.icons"          // deja todo en blanco
"sap.ui.deviceTypes"    // desktop/tablet/phone: true siempre
"contentDensities"      // compact/cozy: true siempre
"flexEnabled"           // true siempre
"sap.fiori.archeType"   // "transactional" para apps de gestión
"sap.fe.enableLazyLoading" // true siempre (mejor rendimiento)
"models."               // el modelo vacío "" siempre igual
```

---

## Si tienes más de una entidad (sub-páginas)

Si `Orders` tiene `OrderItems` como composición y quieres una
tercera pantalla para los items, agregas una ruta y un target más:

```json
"routes": [
    { "pattern": ":?query:",                        "name": "OrdersList",       "target": "OrdersList"       },
    { "pattern": "Orders({key}):?query:",           "name": "OrdersObjectPage", "target": "OrdersObjectPage" },
    { "pattern": "Orders({key})/OrderItems({key2}):?query:", "name": "OrderItemsObjectPage", "target": "OrderItemsObjectPage" }
],
"targets": {
    "OrdersList": { ... },
    "OrdersObjectPage": {
        "options": {
            "settings": {
                "contextPath": "/Orders",
                "navigation": {
                    "OrderItems": {
                        "detail": { "route": "OrderItemsObjectPage" }
                    }
                }
            }
        }
    },
    "OrderItemsObjectPage": {
        "type": "Component",
        "name": "sap.fe.templates.ObjectPage",
        "options": {
            "settings": {
                "contextPath": "/Orders/OrderItems"
            }
        }
    }
}
```

El `contextPath` de la sub-página es la ruta de navegación completa:
`/EntidadPadre/EntidadHija`.