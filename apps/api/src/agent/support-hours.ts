/**
 * Lê o "horário de atendimento" livre da persona (ex.: "Segunda a Sexta, 08h às 18h; Sábado, 8h às 12h")
 * e diz se a equipe humana está trabalhando agora. Texto não reconhecido => null (tratado como sempre
 * aberto: melhor não avisar do que avisar errado).
 */

const DAY_NAMES: Array<[RegExp, number]> = [
  [/^dom/, 0],
  [/^seg/, 1],
  [/^ter/, 2],
  [/^qua/, 3],
  [/^qui/, 4],
  [/^sex/, 5],
  [/^s[aá]b/, 6],
];

export interface SupportWindow {
  days: number[];
  startMin: number;
  endMin: number;
}

function dayIndex(word: string): number | null {
  const w = word.toLowerCase().trim();
  for (const [re, idx] of DAY_NAMES) if (re.test(w)) return idx;
  return null;
}

function toMinutes(h: string, m?: string): number {
  return Number(h) * 60 + (m ? Number(m) : 0);
}

function parseSegment(segment: string): SupportWindow | null {
  const text = segment.toLowerCase();
  const hours = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:h)?\s*(?:às|as|a|-|até|ate)\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?/.exec(text);
  const allDay = /24\s*h|24 horas/.test(text);
  if (!hours && !allDay) return null;
  const startMin = allDay ? 0 : toMinutes(hours![1], hours![2]);
  const endMin = allDay ? 24 * 60 : toMinutes(hours![3], hours![4]);

  let days: number[] = [];
  if (/todos os dias|diariamente|todo dia/.test(text)) {
    days = [0, 1, 2, 3, 4, 5, 6];
  } else {
    const range = /(dom\w*|seg\w*|ter\w*|qua\w*|qui\w*|sex\w*|s[aá]b\w*)\s*(?:a|à|-|até|ate)\s*(dom\w*|seg\w*|ter\w*|qua\w*|qui\w*|sex\w*|s[aá]b\w*)/.exec(text);
    if (range) {
      const from = dayIndex(range[1]);
      const to = dayIndex(range[2]);
      if (from === null || to === null) return null;
      for (let d = from; ; d = (d + 1) % 7) {
        days.push(d);
        if (d === to) break;
      }
    } else {
      const single = /(dom\w*|seg\w*|ter\w*|qua\w*|qui\w*|sex\w*|s[aá]b\w*)/g;
      for (const m of text.matchAll(single)) {
        const d = dayIndex(m[1]);
        if (d !== null && !days.includes(d)) days.push(d);
      }
    }
    if (days.length === 0) days = [0, 1, 2, 3, 4, 5, 6];
  }
  return { days, startMin, endMin };
}

export function parseSupportHours(text: string | null | undefined): SupportWindow[] | null {
  if (!text?.trim()) return null;
  const windows = text
    .split(/;|\||\n/)
    .map((s) => parseSegment(s))
    .filter((w): w is SupportWindow => w !== null);
  return windows.length ? windows : null;
}

/** Dia da semana e minuto do dia no fuso do provedor (padrão: horário de Brasília). */
function localTime(now: Date, timeZone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** true/false quando o texto foi entendido; null quando não dá para saber. */
export function isWithinSupportHours(text: string | null | undefined, now = new Date(), timeZone = 'America/Sao_Paulo'): boolean | null {
  const windows = parseSupportHours(text);
  if (!windows) return null;
  const { day, minute } = localTime(now, timeZone);
  return windows.some((w) => w.days.includes(day) && minute >= w.startMin && minute < w.endMin);
}

export function offHoursNotice(supportHours: string): string {
  return `Nossa equipe de atendimento funciona ${supportHours.trim()}. O seu caso já está registrado na fila e um atendente responde por aqui assim que o expediente começar.`;
}
