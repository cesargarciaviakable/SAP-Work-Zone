# 02 — El modelo de datos (`db/schema.cds`)

**Qué vas a aprender**: cada entidad de `db/schema.cds`, por qué existe,
cómo se relaciona con las demás, y la convención de nombres de los CSV
de datos semilla.

El schema es la base de todo — los cuatro servicios de `srv/` y las
cinco Fiori apps solo son proyecciones y vistas sobre estas entidades.
Por eso se lee primero.

---

## Namespace

```cds
namespace lote.inspector;

using { cuid, managed } from '@sap/cds/common';
```

Todo el modelo vive bajo `lote.inspector` — de ahí el nombre de los
archivos CSV (`lote.inspector-Lotes.csv`, etc.), el `xsappname` en
`xs-security.json`, y el `sap.cloud.service` compartido por las cinco
apps (`lote.inspector`, ver capítulo 07).

`cuid` aporta una clave primaria `ID: UUID`; `managed` aporta
`createdAt`, `createdBy`, `modifiedAt`, `modifiedBy` con valores
automáticos. Casi todas las entidades usan ambos.

---

## Codelists — catálogos de valores fijos

```cds
aspect CodeList {
  key code : String(20);
  name     : localized String(255);
  descr    : localized String(1000);
}

entity Turnos : CodeList {
  key code : String(1);
  // Datos iniciales en db/data/lote.inspector-Turnos.csv
  // M = Mañana, V = Vespertino, N = Nocturno
}

entity StatusLote : CodeList {
  key code : String(30);
  // PENDIENTE, EN_INSPECCION, APROBADO, RECHAZADO, APROBADO_CON_DESVIACION
}

entity StatusInspeccion : CodeList {
  key code : String(20);
  // ABIERTA, COMPLETADA, CANCELADA
}

entity TiposDecision : CodeList {
  key code : String(30);
  // LIBERAR, RECHAZAR, LIBERAR_CON_DESVIACION
}

entity TiposParametro : CodeList {
  key code : String(20);
  // DIMENSIONAL, ELECTRICO, VISUAL, QUIMICO
}
```

El `aspect CodeList` es una plantilla reutilizable: cualquier entidad
que lo herede obtiene `code` (clave), `name` y `descr`, ambos
`localized` (soportan traducción por idioma vía la tabla de textos que
CAP genera automáticamente). Cada entidad **redeclara** `key code`
con su propia longitud (`String(1)` para `Turnos`, `String(30)` para
`StatusLote`, etc.) porque CDS no permite heredar y solo cambiar el
tamaño sin repetir la declaración de la clave.

Estas cinco entidades son los "estados" y "tipos" que gobiernan el
flujo de negocio completo — los valores concretos (`PENDIENTE`,
`ABIERTA`, `VISUAL`...) viven en los CSV de `db/data/`, no en el
schema. Esto es intencional: agregar un nuevo turno o un nuevo tipo de
decisión es un cambio de datos, no de modelo.

---

## Catálogos maestros

```cds
entity Materiales : cuid, managed {
  codigo          : String(40)  not null;
  descripcion     : String(100) not null;
  unidad          : String(10);
  activo          : Boolean default true;
  parametros      : Composition of many ParametrosMaterial on parametros.material = $self;
}

entity LineasProduccion : cuid, managed {
  codigo          : String(20)  not null;
  descripcion     : String(100) not null;
  planta          : String(50);
  activo          : Boolean default true;
}

entity Parametros : cuid, managed {
  codigo          : String(20)  not null;
  descripcion     : String(100) not null;
  tipoParametro   : Association to TiposParametro;
  unidadMedida    : String(20);
  activo          : Boolean default true;
}
```

- `Materiales`: el maestro de materiales que se inspeccionan. Su
  composición `parametros` (hacia `ParametrosMaterial`) es la que
  administra `qm-rangos` — el propio material (`codigo`,
  `descripcion`, `unidad`, `activo`) es de solo lectura desde esa app
  (ver capítulo 05, `qm-rangos`, y la lección "maintain only ranges,
  not materials" del capítulo 09).
- `LineasProduccion`: catálogo simple de líneas/plantas.
- `Parametros`: el catálogo de parámetros de calidad que se pueden
  medir (dimensional, eléctrico, visual, químico). `tipoParametro` es
  la asociación que determina si un parámetro se captura como valor
  numérico o como *pasa/no pasa* — esta distinción atraviesa todo el
  proyecto (ver capítulos 03 y 04).

### La relación material ↔ parámetros esperados

```cds
// Relación Material ↔ Parámetros esperados
// Permite que cada material tenga sus propios rangos de aceptación
@assert.unique: { materialParametro: [material, parametro] }
entity ParametrosMaterial : cuid {
  material        : Association to Materiales not null;
  parametro       : Association to Parametros not null;
  valorMinimo     : Decimal(10,3);
  valorMaximo     : Decimal(10,3);
  esObligatorio   : Boolean default true;
}
```

`ParametrosMaterial` es la tabla puente: para un material dado, qué
parámetros se le deben medir y en qué rango (`valorMinimo`/
`valorMaximo`) se considera aceptable. `@assert.unique: {
materialParametro: [material, parametro] }` le pide a CAP que rechace
un segundo registro con la misma combinación material+parámetro.

**Importante** (ver capítulo 04 y la lección correspondiente en el
09): en SQLite, `@assert.unique` violado produce un error 500 crudo,
no un 400 legible. Por eso el handler de `config-service.js` valida
duplicados también a mano antes de guardar, en vez de confiar
únicamente en esta anotación.

---

## El core transaccional

```cds
entity Lotes : cuid, managed {
  numeroLote      : String(40)  not null;
  material        : Association to Materiales not null;
  lineaProduccion : Association to LineasProduccion not null;
  turno           : Association to Turnos;
  cantidad        : Decimal(13,3);
  unidad          : String(10);
  fechaProduccion : Date;
  status          : Association to StatusLote default 'PENDIENTE';
  observaciones   : String(500);

  // Composiciones — el ciclo de vida de inspecciones depende del lote
  inspecciones    : Composition of many Inspecciones
                      on inspecciones.lote = $self;

  // Vista calculada — cuántas inspecciones tiene
  virtual cantidadInspecciones : Integer;
}
```

Un `Lote` es la unidad de producción a inspeccionar. `status` arranca
en `'PENDIENTE'` (default a nivel de schema). `inspecciones` es una
**composición** (no una simple asociación): el ciclo de vida de las
inspecciones pertenece al lote — borrar un lote, en principio,
borraría en cascada sus inspecciones, lo que el handler de
`inspector-service.js` bloquea explícitamente cuando alguna ya no está
`ABIERTA` (ver capítulo 04, lección del capítulo 09 "block cascade
delete"). `cantidadInspecciones` es `virtual`: no se guarda en la base,
se calcula — en este caso ni siquiera se llegó a poblar en ningún
handler; queda declarado para uso futuro.

```cds
entity Inspecciones : cuid, managed {
  lote            : Association to Lotes not null;
  fechaInspeccion : DateTime;
  status          : Association to StatusInspeccion default 'ABIERTA';
  observaciones   : String(500);

  // Composiciones
  resultados      : Composition of many ResultadosInspeccion
                      on resultados.inspeccion = $self;
  decision        : Composition of one DecisionLote
                      on decision.inspeccion = $self;

  // Campos calculados en handler — no almacenados
  virtual totalParametros   : Integer;
  virtual parametrosCumplen : Integer;
  virtual porcentajeCumplimiento : Decimal(5,2);
}
```

Una inspección pertenece a un lote (`lote`, obligatorio), arranca
`ABIERTA` y compone sus `resultados` (uno por parámetro medido) y, una
vez decidida, una `DecisionLote` (composición **de uno**, no de
muchos: solo puede haber una decisión por inspección). Los tres campos
`virtual` (`totalParametros`, `parametrosCumplen`,
`porcentajeCumplimiento`) son deliberadamente virtuales — se calculan
en `srv/handlers/supervisor-service.js` en un handler `after READ`
(capítulo 04) en vez de mantenerse como columnas reales, porque
dependen de comparar cada resultado contra el rango del material, algo
que cambia si el rango cambia después de capturado el resultado.

```cds
entity ResultadosInspeccion : cuid, managed {
  inspeccion      : Association to Inspecciones not null;
  parametro       : Association to Parametros not null;

  // Para parámetros numéricos
  valorObtenido   : Decimal(10,3);

  // Para parámetros visuales (pasa/no pasa)
  cumpleVisual    : Boolean;

  // Calculado en srv — no almacenado en DB
  virtual cumple  : Boolean;

  observacion     : String(200);
}
```

Este es el corazón del modelo dual **numérico vs. visual** que
atraviesa toda la app:

| Tipo de parámetro | Campo que captura el usuario | Quién decide si cumple |
|---|---|---|
| Numérico (`DIMENSIONAL`, `ELECTRICO`, `QUIMICO`) | `valorObtenido` | El servidor, comparando contra `ParametrosMaterial.valorMinimo/valorMaximo` |
| Visual (`VISUAL`) | `cumpleVisual` directamente (checkbox) | El usuario — el servidor nunca lo sobrescribe |

`cumpleVisual` está **físicamente en la tabla** (a pesar del nombre,
que sugiere "solo visual") porque también se usa como resultado
final calculado para parámetros numéricos: el handler de
`inspector-service.js` escribe ahí el resultado de comparar
`valorObtenido` contra el rango. `cumple` es `virtual` y solo lo llena
`SupervisorService` en lectura (capítulo 04) como una relectura
defensiva del mismo cálculo, pensada para cuando el rango pudo cambiar
después de guardado el resultado.

```cds
entity DecisionLote : cuid, managed {
  inspeccion      : Association to Inspecciones not null;
  decision        : Association to TiposDecision not null;
  justificacion   : String(500) not null;
  // createdBy de managed = quién aprobó
  // createdAt de managed = fecha de decisión
}
```

La decisión del supervisor. `justificacion` es obligatoria a nivel de
schema (`not null`), aunque el handler de `supervisor-service.js`
además exige que **no esté vacía** solo cuando la decisión es
`RECHAZAR` o `LIBERAR_CON_DESVIACION` — el schema no puede expresar esa
condición, por eso vive en el handler (capítulo 04). El comentario en
el propio schema documenta que `createdBy`/`createdAt` de `managed`
cumplen el rol de "quién aprobó" y "cuándo" — no hacía falta
duplicarlos con otro nombre.

---

## Datos semilla (`db/data/*.csv`)

```
db/data/
├── lote.inspector-DecisionLote.csv
├── lote.inspector-Inspecciones.csv
├── lote.inspector-LineasProduccion.csv
├── lote.inspector-Lotes.csv
├── lote.inspector-Materiales.csv
├── lote.inspector-Parametros.csv
├── lote.inspector-ParametrosMaterial.csv
├── lote.inspector-ResultadosInspeccion.csv
├── lote.inspector-StatusInspeccion.csv
├── lote.inspector-StatusLote.csv
├── lote.inspector-TiposDecision.csv
├── lote.inspector-TiposParametro.csv
└── lote.inspector-Turnos.csv
```

Convención de nombre: `{namespace}-{Entidad}.csv`. Hay dos categorías:

- **Codelists** (`Turnos`, `StatusLote`, `StatusInspeccion`,
  `TiposDecision`, `TiposParametro`): siempre necesarios — sin ellos
  los `Common.ValueListWithFixedValues` de las apps (capítulo 05)
  estarían vacíos y el flujo de estados no tendría valores válidos.
- **Datos de prueba** (`Materiales`, `LineasProduccion`, `Parametros`,
  `ParametrosMaterial`, `Lotes`, `Inspecciones`,
  `ResultadosInspeccion`, `DecisionLote`): existen para tener algo con
  qué probar la app apenas se levanta — en un proyecto real de
  producción, estas tablas normalmente arrancarían vacías o con datos
  migrados, no versionadas en CSV. Aun así, aquí sirven de fixtures
  para los tests (capítulo 08): los `test/*.test.js` referencian IDs
  concretos de estos CSV con comentarios como
  `// Fixture IDs from db/data/lote.inspector-*.csv`.

---

## Resumen / checklist

- [ ] `aspect CodeList` + 5 codelists (`Turnos`, `StatusLote`, `StatusInspeccion`, `TiposDecision`, `TiposParametro`) gobiernan todos los estados/tipos fijos del sistema.
- [ ] `Materiales`, `LineasProduccion`, `Parametros` son catálogos maestros; `ParametrosMaterial` es la tabla puente con los rangos de aceptación (`@assert.unique` por material+parámetro).
- [ ] `Lotes → Inspecciones → ResultadosInspeccion` y `Inspecciones → DecisionLote` son composiciones: el hijo no tiene sentido sin el padre.
- [ ] El modelo dual numérico/visual vive en `ResultadosInspeccion.cumpleVisual` (persistido, doble uso) y `ResultadosInspeccion.cumple` (virtual, solo lectura en `SupervisorService`).
- [ ] Los campos `virtual` (`cantidadInspecciones`, `totalParametros`, `parametrosCumplen`, `porcentajeCumplimiento`, `cumple`) nunca se guardan — siempre los llena un handler.
- [ ] Los CSV siguen `{namespace}-{Entidad}.csv`; los codelists son obligatorios, los datos transaccionales son solo fixtures de desarrollo/test.
