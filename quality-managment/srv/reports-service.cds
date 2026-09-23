using { lote.inspector as db } from '../db/schema';

// ─────────────────────────────────────────
// SERVICIO REPORTES
// Rol: visibilidad completa, solo lectura
// Accesible por Inspector y Supervisor
// ─────────────────────────────────────────

@path: '/reports'
@requires: ['Inspector', 'SupervisorCalidad', 'Administrador']
service ReportsService {

    // Vistas base
    @readonly
    @cds.redirection.target: true
              entity Lotes                as projection on db.Lotes;
    @readonly entity Inspecciones         as projection on db.Inspecciones;
    @readonly entity ResultadosInspeccion as projection on db.ResultadosInspeccion;
    @readonly
    @cds.redirection.target: true
              entity DecisionLote         as projection on db.DecisionLote;
    @readonly entity Materiales           as projection on db.Materiales;
    @readonly entity LineasProduccion     as projection on db.LineasProduccion;
    @readonly entity Parametros           as projection on db.Parametros;
    @readonly entity StatusLote           as projection on db.StatusLote;

    // Vista: resumen de lotes por status
    // Util para el dashboard principal
    @readonly
    entity ResumenLotesPorStatus as select from db.Lotes {
        key status.code as status : String,
            status.name as nombre : String,
            count(ID)   as total  : Integer
    }
    group by status.code, status.name;

    // Vista: lotes con su ultima decision
    @readonly
    entity LotesConDecision as select from db.DecisionLote {
        key inspeccion.lote.ID,
            inspeccion.lote.numeroLote,
            inspeccion.lote.material.descripcion        as material      : String,
            inspeccion.lote.lineaProduccion.descripcion as linea         : String,
            inspeccion.lote.turno.name                  as turno         : String,
            inspeccion.lote.fechaProduccion,
            inspeccion.lote.cantidad,
            inspeccion.lote.status.name                 as statusLote    : String,
            decision.name                               as decision      : String,
            justificacion,
            createdBy                                   as aprobadorPor  : String,
            createdAt                                   as fechaDecision : Timestamp
    }

    // Vista: parametros que mas fallan
    @readonly
    entity ParametrosFallidos as select from db.ResultadosInspeccion as r join db.Parametros as p on p.ID = r.parametro.ID
    {
        key p.codigo      as codigoParametro : String,
            p.descripcion as parametro       : String,
            p.unidadMedida,
            count(r.ID)   as totalMediciones : Integer,
            count(case when r.cumpleVisual = false
                then 1 end) as totalFallas : Integer
    }
    group by p.codigo, p.descripcion, p.unidadMedida;

    // Vista: rendimiento por linea de produccion
    @readonly
    entity RendimeintoPorLinea as select from db.Lotes as l join db.LineasProduccion as lp on lp.ID = l.lineaProduccion.ID
    {
        key lp.codigo as codigoLinea : String,
            lp.descripcion as lineas : String,
            count(l.ID) as totalLotes : Integer,
            count(case when l.status.code = 'APROBADO' then 1 end) as aprobados : Integer,
            count(case when l.status.code = 'RECHAZADO' then 1 end) as rechazados : Integer,
            count(case when l.status.code = 'APROBADO_CON_DESVIACION' then 1 end) as conDesviacion : Integer
    }
    group by lp.codigo, lp.descripcion;

    // Funcion: lotes por rango de fechas
    @readonly
    function lotesEnRango(
        fechaInicio : Date,
        fechaFin    : Date
    ) returns array of {
        ID              : UUID;
        numeroLote      : String;
        material        : String;
        linea           : String;
        fechaProduccion : Date;
        status          : String;
    }
}