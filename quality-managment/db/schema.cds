namespace lote.inspector;

using { cuid, managed } from '@sap/cds/common';

// ─────────────────────────────────────────
// CODELISTS — mantenibles desde UI/CSV
// ─────────────────────────────────────────

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

// ─────────────────────────────────────────
// CATÁLOGOS
// ─────────────────────────────────────────

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

// ─────────────────────────────────────────
// CORE
// ─────────────────────────────────────────

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

entity DecisionLote : cuid, managed {
  inspeccion      : Association to Inspecciones not null;
  decision        : Association to TiposDecision not null;
  justificacion   : String(500) not null;
  // createdBy de managed = quién aprobó
  // createdAt de managed = fecha de decisión
}