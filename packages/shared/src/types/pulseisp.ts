import { RunMode } from './common';

export interface CustomerNetworkHealth {
  healthScore: number; // 0..100
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE' | 'UNKNOWN';
  optical: {
    rxDbm: number | null;
    txDbm: number | null;
    trend: 'STABLE' | 'DEGRADING' | 'IMPROVING' | 'UNKNOWN';
  };
  stability: {
    disconnects7d: number | null;
    reconnects7d: number | null;
    lastEventAt: string | null;
  };
  activeAnomalies: Array<{
    id: string;
    scope: 'INDIVIDUAL' | 'PON' | 'OLT' | 'REGION';
    affectedCustomers: number | null;
    startedAt: string;
    description: string;
  }>;
  recommendations: string[];
  observedAt: string;
  mode: RunMode;
}
