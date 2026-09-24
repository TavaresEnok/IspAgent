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
      // Título E conteúdo: só com o conteúdo como fato o modelo pode usar a orientação (e o reply-guard
      // aceita os números dela, ex.: "30 segundos").
      const facts = results.slice(0, 3).flatMap((r) => [
        { path: `data.results[${r.id}].title`, label: 'Documento encontrado', value: r.title },
        { path: `data.results[${r.id}].content`, label: 'Orientação da base de conhecimento', value: r.content.slice(0, 800) },
      ]);
      return { status: 'OK', data: { results }, facts };
    },
  };
}
