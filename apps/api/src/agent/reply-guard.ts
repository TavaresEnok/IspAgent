/**
 * Conferência da resposta escrita pelo LLM contra os fatos das ferramentas (a "garantia estrutural" de
 * que o modelo não inventa dado). O `ClaimValidator` prova que os fatos têm procedência; este guard prova
 * que o TEXTO enviado ao cliente não afirma nada além deles:
 *   1. todo valor numérico/data/moeda da resposta precisa vir dos fatos (ou da própria mensagem do
 *      cliente) — número solto é o jeito clássico de "inventar" preço, prazo, protocolo;
 *   2. a resposta não pode dizer que abriu chamado/agendou visita se nenhuma ferramenta fez isso.
 * Se falhar, o orquestrador descarta o texto do LLM e usa a resposta determinística (baseada em regras).
 */

export interface GuardFact {
  label: string;
  value: string | number | boolean | null;
}

export interface ReplyGuardResult {
  ok: boolean;
  violations: string[];
}

const NUMBER_TOKEN = /R\$\s*\d[\d.]*(?:,\d{1,2})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d+(?:[.,]\d+)*/g;
const ACTION_CLAIM =
  /\b(abri|criei|registrei|agendei|marquei)\b|\b(chamado|visita|atendimento)\b[^.!?\n]{0,40}\b(foi|est[aá]|ficou)\s+(aberto|criado|registrado|agendad[oa]|marcad[oa])\b/i;

function toNumber(token: string): number | null {
  const cleaned = token.replace(/R\$\s*/i, '').trim();
  if (!/^\d/.test(cleaned)) return null;
  // "1.234,56" -> 1234.56 | "89,90" -> 89.9 | "8990" -> 8990 | "1.5" -> 1.5
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** `05/09/2026`, `5/9/26` -> `5/9/2026`; `05/09` -> `5/9`. */
function normalizeDate(token: string): string {
  const parts = token.split('/').map(Number);
  if (parts.length === 3) return `${parts[0]}/${parts[1]}/${parts[2] < 100 ? 2000 + parts[2] : parts[2]}`;
  return `${parts[0]}/${parts[1]}`;
}

function addNumber(set: Set<number>, n: number | null) {
  if (n !== null) set.add(Math.round(n * 100) / 100);
}

function addDate(dates: Set<string>, numbers: Set<number>, iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return;
  const [, y, mo, d] = m;
  dates.add(`${Number(d)}/${Number(mo)}/${y}`);
  dates.add(`${Number(d)}/${Number(mo)}`);
  addNumber(numbers, Number(d));
  addNumber(numbers, Number(mo));
  addNumber(numbers, Number(y));
}

function collectAllowed(texts: string[], facts: GuardFact[]) {
  const numbers = new Set<number>();
  const dates = new Set<string>();

  for (const text of texts) {
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      if (token.includes('/')) dates.add(normalizeDate(token));
      else addNumber(numbers, toNumber(token));
    }
  }

  for (const fact of facts) {
    const values = [String(fact.label), String(fact.value ?? '')];
    for (const text of values) {
      for (const token of text.match(NUMBER_TOKEN) ?? []) addNumber(numbers, toNumber(token));
      addDate(dates, numbers, text);
    }
    if (typeof fact.value === 'number') {
      addNumber(numbers, fact.value);
      // Valores em centavos aparecem na resposta em reais.
      if (/centavos/i.test(fact.label)) {
        addNumber(numbers, fact.value / 100);
        addNumber(numbers, Math.floor(fact.value / 100));
      }
    }
  }
  return { numbers, dates };
}

export function checkReplyAgainstFacts(
  reply: string,
  facts: GuardFact[],
  context: { customerMessage?: string; history?: Array<{ content: string }> } = {},
): ReplyGuardResult {
  const violations: string[] = [];
  const contextTexts = [context.customerMessage ?? '', ...(context.history ?? []).map((h) => h.content)];
  const { numbers, dates } = collectAllowed(contextTexts, facts);

  for (const token of reply.match(NUMBER_TOKEN) ?? []) {
    if (token.includes('/')) {
      if (!dates.has(normalizeDate(token))) violations.push(`data "${token}" não vem dos fatos`);
      continue;
    }
    const n = toNumber(token);
    if (n === null) continue;
    const rounded = Math.round(n * 100) / 100;
    // Dígito solto ("1 técnico", "2 minutos de espera") não carrega dado da conta; conselho de
    // procedimento em segundos ("tire da tomada por 30 segundos") também não.
    if (Number.isInteger(rounded) && rounded < 10 && !/^R\$/i.test(token)) continue;
    const at = reply.indexOf(token);
    if (/^\s*segundos?\b/i.test(reply.slice(at + token.length, at + token.length + 12))) continue;
    if (!numbers.has(rounded)) violations.push(`valor "${token}" não vem dos fatos`);
  }

  const ticketCreated = facts.some((f) => f.label === 'Chamado criado');
  if (!ticketCreated && ACTION_CLAIM.test(reply)) {
    violations.push('afirma ter aberto/agendado algo, mas nenhuma ferramenta fez isso');
  }

  return { ok: violations.length === 0, violations };
}
