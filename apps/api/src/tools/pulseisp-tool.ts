import { z } from 'zod';
import { ToolResult } from '@ispagent/shared';
import { PulseISPAdapter } from '../integrations/pulseisp/pulseisp-adapter.interface';
import { ToolDefinition } from './tool.types';

type Fact = ToolResult['facts'][number];

export function createPulseISPQueryTool(pulseisp: PulseISPAdapter): ToolDefinition<{ contractId: string }, unknown> {
  return {
    name: 'PulseISPTool',
    action: 'pulseisp.query',
    inputSchema: z.object({ contractId: z.string().min(1) }),
    adapter: pulseisp.name,
    capability: 'network_health',
    mode: 'DEMO',
    execute: async (input) => {
      const health = await pulseisp.getCustomerNetworkHealth(input.contractId);
      if (!health) {
        return { status: 'NOT_FOUND', facts: [] };
      }

      const collectiveAnomaly = health.activeAnomalies.find((a) => a.scope !== 'INDIVIDUAL');

      const facts: Fact[] = [
        { path: 'data.status', label: 'Status da conexão', value: health.status },
        { path: 'data.healthScore', label: 'Índice de saúde da conexão', value: health.healthScore },
      ];
      if (collectiveAnomaly) {
        facts.push(
          { path: 'data.collectiveAnomaly.scope', label: 'Escopo do incidente', value: collectiveAnomaly.scope },
          {
            path: 'data.collectiveAnomaly.affectedCustomers',
            label: 'Clientes afetados pelo mesmo incidente',
            value: collectiveAnomaly.affectedCustomers,
          },
        );
      } else if (health.optical.rxDbm !== null) {
        facts.push({ path: 'data.optical.rxDbm', label: 'Sinal óptico recebido (dBm)', value: health.optical.rxDbm });
      }

      return { status: 'OK', data: health, facts };
    },
  };
}
