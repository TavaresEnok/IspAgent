'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FLOW_HANDLE_LABEL, FLOW_NODE_LABEL, flowNodeHandles, flowRequiredHandles } from '@ispagent/shared';
import { BLOCK_STYLE, blockPreview, type BlockNode } from './model';

function BlockNodeView({ data, selected }: NodeProps<BlockNode>) {
  const node = data.flow;
  const style = BLOCK_STYLE[node.type];
  const outputs = flowNodeHandles(node);
  const required = new Set(flowRequiredHandles(node));
  const hasError = data.errors.length > 0;

  const border = hasError
    ? 'border-red-500/80 shadow-red-500/20'
    : data.waiting
      ? 'border-emerald-400 shadow-emerald-400/30'
      : selected
        ? 'border-cyan-400 shadow-cyan-400/20'
        : style.ring;

  const label = (h: string) =>
    node.type === 'menu' ? (node.data.options.find((o) => o.id === h)?.label ?? FLOW_HANDLE_LABEL[h] ?? h) : (FLOW_HANDLE_LABEL[h] ?? h);

  return (
    <div
      className={`w-64 rounded-xl border bg-slate-900/95 text-left shadow-lg backdrop-blur transition-shadow ${border} ${
        data.visited ? 'ring-2 ring-emerald-400/40' : ''
      }`}
    >
      {node.type !== 'start' && (
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-slate-900 !bg-slate-300" />
      )}

      <div className={`flex items-center gap-2 rounded-t-xl bg-gradient-to-r ${style.accent} to-transparent px-3 py-2`}>
        <span className="text-base">{style.icon}</span>
        <span className="flex-1 truncate text-xs font-semibold text-slate-100">{FLOW_NODE_LABEL[node.type]}</span>
        {hasError && (
          <span title={data.errors.join('\n')} className="rounded-full bg-red-500/20 px-1.5 text-[10px] font-bold text-red-300">
            {data.errors.length}
          </span>
        )}
        {!hasError && data.warnings.length > 0 && (
          <span title={data.warnings.join('\n')} className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300">
            !
          </span>
        )}
        {data.waiting && <span className="rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-300">aguardando</span>}
      </div>

      <p className="line-clamp-3 whitespace-pre-line px-3 py-2 text-[11px] leading-snug text-slate-300">{blockPreview(node)}</p>

      {outputs.length > 0 && (
        <div className="border-t border-slate-800 py-1">
          {outputs.map((h) => (
            <div key={h} className="relative flex items-center justify-end px-3 py-1">
              <span className={`truncate text-[10px] ${required.has(h) ? 'text-slate-300' : 'text-slate-500 italic'}`}>{label(h)}</span>
              <Handle
                id={h}
                type="source"
                position={Position.Right}
                isConnectable={!data.readOnly}
                className={`!h-3 !w-3 !border-2 !border-slate-900 ${
                  h === 'fallback' || h === 'invalid' || h === 'error' || h === 'not_found' || h === 'false' ? '!bg-amber-400' : '!bg-cyan-400'
                }`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(BlockNodeView);
