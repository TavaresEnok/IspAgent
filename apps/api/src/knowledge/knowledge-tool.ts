import { z } from 'zod';
import { ToolDefinition } from '../tools/tool.types';
import { KnowledgeService } from './knowledge.service';

export function createKnowledgeSearchTool(knowledge: KnowledgeService): ToolDefinition<{ query: string }, unknown> {
  return {
    name: 'KnowledgeTool',
    action: 'knowledge.search',
    inputSchema: z.object({ query: z.string().min(1) }),
    adapter: 'postgres-fulltext',
    capability: 'search',
    mode: 'LIVE',
    execute: async (input) => {
      const results = await knowledge.search(input.query);
      if (results.length === 0) {
        return { status: 'NOT_FOUND', facts: [] };
      }
      const facts = results.map((r) => ({
        path: `data.results[${r.id}].title`,
        label: 'Documento encontrado',
        value: r.title,
      }));
      return { status: 'OK', data: { results }, facts };
    },
  };
}
