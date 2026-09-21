import { CustomerNetworkHealth } from '@ispagent/shared';

/**
 * Subconjunto do `GET /api/customers/{id}` (Customer 360) do PulseISP que o ISPAgent consome. Os campos e
 * valores foram lidos do código do PulseISP (apps/api/src/modules/customers.controller.ts, engine/types.ts,
 * prisma/schema.prisma), não inventados. Tudo é opcional de propósito: um campo ausente vira "desconhecido"
 * (null/UNKNOWN), nunca um valor plausível.
 */
export interface PulseCustomer360 {
  asOf?: string;
  customer?: { id: string; externalId?: string; name?: string; phone?: string | null; city?: string | null; status?: string };
  contract?: {
    id?: string;
    externalId?: string;
    status?: string;
    startDate?: string | null;
    addressLine?: string | null;
    plan?: { id?: string; name?: string; downloadMbps?: number; uploadMbps?: number; priceCents?: number } | null;
  } | null;
  network?: {
    onu?: { status?: string; lastRxDbm?: number | null; lastTxDbm?: number | null } | null;
    session?: { active?: boolean } | null;
  };
  health?: {
    score?: number;
    band?: string;
    metrics?: {
      optical?: { trend?: string };
      connection?: { drops7d?: number; lastDropAt?: string | null };
    };
  } | null;
  // O Customer 360 traz só estes campos da anomalia (select em customers.controller.ts); `scopeType` e
  // `firstDetectedAt` vêm de `GET /anomalies/{id}` (PulseAnomalyDetail abaixo).
  anomalies?: Array<{
    id: string;
    type?: string;
    status?: string;
    scopeName?: string;
    affectedCustomers?: number;
    windowStart?: string;
    summary?: string;
  }>;
  recommendations?: Array<{ category?: string; recommendation?: string; status?: string }>;
}

/** Campos de `GET /anomalies/{id}` que o Customer 360 não traz (PulseISP: model NetworkAnomaly). */
export interface PulseAnomalyDetail {
  scopeType?: string;
  firstDetectedAt?: string;
}

const OFFLINE_ONU_STATUS = new Set(['OFFLINE', 'LOS', 'DYING_GASP']);

function mapStatus(c: PulseCustomer360): CustomerNetworkHealth['status'] {
  const onuStatus = c.network?.onu?.status;
  if (onuStatus && OFFLINE_ONU_STATUS.has(onuStatus)) return 'OFFLINE';
  switch (c.health?.band) {
    case 'HEALTHY':
      return 'HEALTHY';
    case 'ATTENTION':
      return 'DEGRADED';
    case 'CRITICAL':
      return 'CRITICAL';
    default:
      return 'UNKNOWN';
  }
}

function mapTrend(trend?: string): CustomerNetworkHealth['optical']['trend'] {
  switch (trend) {
    case 'STABLE':
      return 'STABLE';
    case 'DEGRADING':
    case 'ABRUPT_DROP':
      return 'DEGRADING';
    case 'IMPROVING':
    case 'RECOVERED':
      return 'IMPROVING';
    default:
      return 'UNKNOWN'; // NO_DATA, OSCILLATING ou ausente — não tem equivalente no contrato do ISPAgent
  }
}

// Contrato do ISPAgent: INDIVIDUAL | PON | OLT | REGION. O PulseISP também escopa por CONCENTRATOR
// (concentrador PPPoE), que atende uma região — mapeado para REGION. Sem o detalhe da anomalia (falha
// ao buscar), cai em REGION, o escopo mais amplo, em vez de afirmar uma PON/OLT que não sabemos.
function mapScope(scopeType?: string): CustomerNetworkHealth['activeAnomalies'][number]['scope'] {
  if (scopeType === 'PON') return 'PON';
  if (scopeType === 'OLT') return 'OLT';
  return 'REGION';
}

/**
 * `null` = o PulseISP não tem NENHUMA telemetria deste cliente (sem health score e sem ONU) — a ferramenta
 * responde NOT_FOUND em vez de inventar um diagnóstico. Não há "score 0" fabricado para cliente sem dados.
 */
export function mapCustomer360ToNetworkHealth(
  c: PulseCustomer360,
  anomalyDetails: Record<string, PulseAnomalyDetail> = {},
): CustomerNetworkHealth | null {
  const hasHealth = typeof c.health?.score === 'number';
  const hasOnu = Boolean(c.network?.onu);
  if (!hasHealth && !hasOnu) return null;

  const onu = c.network?.onu;
  const connection = c.health?.metrics?.connection;
  const observedAt = c.asOf ?? new Date().toISOString();

  return {
    healthScore: hasHealth ? (c.health!.score as number) : 0,
    status: mapStatus(c),
    optical: {
      rxDbm: onu?.lastRxDbm ?? null,
      txDbm: onu?.lastTxDbm ?? null,
      trend: mapTrend(c.health?.metrics?.optical?.trend),
    },
    stability: {
      disconnects7d: typeof connection?.drops7d === 'number' ? connection.drops7d : null,
      // O PulseISP não separa "reconexões" de "quedas" nesse resumo — não copiamos o mesmo número.
      reconnects7d: null,
      lastEventAt: connection?.lastDropAt ?? null,
    },
    activeAnomalies: (c.anomalies ?? [])
      .filter((a) => a.status === 'ACTIVE')
      .map((a) => ({
        id: a.id,
        scope: mapScope(anomalyDetails[a.id]?.scopeType),
        affectedCustomers: typeof a.affectedCustomers === 'number' ? a.affectedCustomers : null,
        startedAt: anomalyDetails[a.id]?.firstDetectedAt ?? a.windowStart ?? observedAt,
        description: a.summary ?? 'Incidente de rede detectado pelo PulseISP.',
      })),
    recommendations: (c.recommendations ?? [])
      .filter((r) => r.category === 'TECHNICAL' && (r.status === 'OPEN' || r.status === 'ACKNOWLEDGED') && r.recommendation)
      .map((r) => r.recommendation as string),
    observedAt,
    mode: 'LIVE',
  };
}
