# Guía: Quality Management (lote.inspector) desde cero

Esta guía reconstruye, paso a paso y con el código real del proyecto,
cómo está hecha la app **Quality Management** (`quality-managment`,
namespace CDS `lote.inspector`): un sistema de inspección de lotes de
producción con captura de resultados, revisión por un supervisor de
calidad, mantenimiento de rangos de aceptación y reportes.

No es un tutorial genérico de CAP + Fiori (para eso ya existe
`recursos-md/README.md` en este mismo repositorio) — es la explicación
de **por qué este proyecto concreto** está construido como está,
incluyendo los errores reales que aparecieron durante su desarrollo y
cómo se resolvieron.

---

## A quién está dirigida

A cualquiera que necesite entender, mantener o extender esta app sin
haber participado en su desarrollo original: un desarrollador nuevo en
el equipo, tu propio yo dentro de seis meses, o quien tenga que
depurar un incidente en producción.

---

## Arquitectura de un vistazo

```
                    ┌─────────────────────────────┐
                    │   db/schema.cds              │
                    │   namespace lote.inspector    │
                    │   (SQLite en dev, HANA en    │
                    │    hybrid/production)         │
                    └───────────────┬──────────────┘
                                    │
        ┌───────────────┬──────────┼──────────────┬──────────────┐
        ▼               ▼          ▼              ▼              │
 InspectorService SupervisorService ConfigService ReportsService  │
   /inspector       /supervisor      /config       /reports       │
   @requires         @requires       @requires    @requires (3)   │
   Inspector       SupervisorCalidad Administrador                │
        │               │          │              │               │
        ▼               ▼          ▼              ▼               │
   qm-inspector   qm-supervisor  qm-rangos    qm-dashboard         │
                                  qm-parametros                    │
        │               │          │              │               │
        └───────────────┴──────────┴──────────────┘               │
                         │ build (mbt) → gen/srv, gen/db,          │
                         │ dist de cada app                        │
                         ▼                                        │
              ┌─────────────────────────┐                         │
              │  Managed Approuter       │◄────────────────────────┘
              │  (destino de la subcuenta │  app/services.cds
              │   BTP, sin módulo propio) │  agrupa las 5 annotations.cds
              └────────────┬─────────────┘
                            │ HTML5 Application Repository (html5-apps-repo)
                            │ + xsuaa (autenticación, scopes)
                            ▼
              ┌─────────────────────────┐
              │  SAP Build Work Zone     │
              │  (site, roles de Work    │
              │   Zone + role collections │
              │   de BTP → visibilidad   │
              │   + autorización)         │
              └─────────────────────────┘
```

**Los 5 apps Fiori y su rol:**

| App | Servicio consumido | Rol requerido | Qué hace |
|---|---|---|---|
| `qm-inspector` | `InspectorService` (`/inspector`) | `Inspector` | Captura lotes, inspecciones y resultados |
| `qm-supervisor` | `SupervisorService` (`/supervisor`) | `SupervisorCalidad` | Revisa inspecciones completadas y decide liberar/rechazar |
| `qm-dashboard` | `ReportsService` (`/reports`) | `Inspector`, `SupervisorCalidad`, `Administrador` | Reportes y gráficos de solo lectura |
| `qm-rangos` | `ConfigService` (`/config`) | `Administrador` | Mantiene los rangos de aceptación por material |
| `qm-parametros` | `ConfigService` (`/config`) | `Administrador` | Mantiene el catálogo de parámetros de calidad |

`app/services.cds` es el archivo que junta las cinco `annotations.cds`
en un único punto de entrada que CAP compila junto con los servicios:

```cds
using from './qm-inspector/annotations';
using from './qm-supervisor/annotations';
using from './qm-dashboard/annotations';
using from './qm-rangos/annotations';
using from './qm-parametros/annotations';
```

Sin este archivo, `cds build` no incluiría las anotaciones de UI al
generar el metadata OData — cada app se anota en su propio archivo
(buena práctica, ver `recursos-md/annotations/guia-a.md`), pero algo
tiene que importarlos todos.

---

## Flujo de negocio, en una frase por estado

```
Lote:        PENDIENTE → EN_INSPECCION → (COMPLETADA la inspección) →
             APROBADO | RECHAZADO | APROBADO_CON_DESVIACION

Inspección:  ABIERTA → COMPLETADA → (decisión del supervisor)
                ↑___________________|
                (regresarInspeccion la reabre con observaciones)
```

Un inspector crea un lote y su primera inspección (`ABIERTA`), captura
resultados por parámetro, y llama a la acción `completarInspeccion`.
El supervisor ve la inspección `COMPLETADA` y llama a `tomarDecision`
(libera, rechaza o libera con desviación) o a `regresarInspeccion` si
falta algo. La decisión mueve el `status` del lote.

---

## Orden de lectura sugerido

1. **[01-proyecto-y-estructura.md](01-proyecto-y-estructura.md)** — cómo arranca el proyecto, `package.json`, perfiles de CDS, layout de carpetas.
2. **[02-modelo-de-datos.md](02-modelo-de-datos.md)** — `db/schema.cds`, entidad por entidad.
3. **[03-servicios-cds.md](03-servicios-cds.md)** — los cuatro `.cds` de `srv/`.
4. **[04-handlers-js.md](04-handlers-js.md)** — la lógica de negocio en JavaScript, handler por handler.
5. **[05-anotaciones-qm-inspector.md](05-anotaciones-qm-inspector.md)**, **[qm-supervisor](05-anotaciones-qm-supervisor.md)**, **[qm-dashboard](05-anotaciones-qm-dashboard.md)**, **[qm-rangos](05-anotaciones-qm-rangos.md)**, **[qm-parametros](05-anotaciones-qm-parametros.md)** — anotaciones UI de cada Fiori app, línea por línea.
6. **[06-seguridad-y-roles.md](06-seguridad-y-roles.md)** — `xs-security.json`, scopes, roles, mocked users, Work Zone.
7. **[07-deploy-mta-y-work-zone.md](07-deploy-mta-y-work-zone.md)** — `mta.yaml`, build, deploy, Work Zone.
8. **[08-testing.md](08-testing.md)** — la carpeta `test/`, por qué se fuerza una base en memoria.
9. **[09-errores-y-lecciones.md](09-errores-y-lecciones.md)** — cada error real encontrado, con su causa, solución y evidencia en `git log`.
10. **[10-tips.md](10-tips.md)** — consejos prácticos sueltos.

Si solo tienes tiempo para dos capítulos: lee **04** (handlers, porque
ahí vive casi toda la lógica de negocio real) y **09** (para no repetir
los mismos errores).

---

## Prerrequisitos

- **SAP Business Application Studio (BAS)** con la extensión de CAP, o
  VS Code + `@sap/cds-dk` instalado localmente (`npm i -g @sap/cds-dk`).
- **Cloud Foundry CLI** (`cf`) autenticado contra tu subcuenta BTP
  (`cf login ...`).
- **`mbt`** (Multi-Target Application Build Tool) — se instala como
  `devDependency` del proyecto, no hace falta instalarlo global.
- Acceso a una subcuenta BTP trial o enterprise con: HANA HDI
  container, XSUAA, Destination service, HTML5 Application Repository
  y SAP Build Work Zone.
- Node.js compatible con `@sap/cds` `^10` (ver `package.json`).

---

## Convenciones de esta guía

- El código se cita **exactamente** como está en el repositorio, con
  su ruta de archivo. Si ves una diferencia entre esta guía y el
  código actual, confía en el código — puede haber cambiado después de
  escribirse esto.
- Los identificadores (nombres de campo, entidades, rutas) se dejan tal
  cual, en español mezclado con inglés técnico, como están en el
  proyecto real.
- Cada capítulo empieza con un breve "Qué vas a aprender" y cierra con
  un resumen o checklist.
