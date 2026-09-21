import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isProduction } from './security-config';

export class UnsafeOutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeOutboundUrlError';
  }
}

const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', 'instance-data']);

function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

/** IPv4 dentro de IPv6 (`::ffff:10.0.0.1`) vira o IPv4 puro para ser classificado. */
function unwrap(ip: string): string {
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:') && ipv4Parts(lower.slice(7))) return lower.slice(7);
  // `new URL('https://[::ffff:10.0.0.5]/')` normaliza para a forma hexadecimal `::ffff:a00:5`.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return lower;
}

/** Endereços que nenhum tenant tem motivo legítimo para alcançar (metadata de nuvem, link-local). */
function isAlwaysBlocked(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) return v4[0] === 169 && v4[1] === 254 || v4[0] === 0 || v4[0] >= 224;
  return ip.startsWith('fe80') || ip === '::' || ip.startsWith('ff');
}

/** Endereços internos: bloqueados em produção, a menos que o host esteja na allowlist. */
function isInternal(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) {
    const [a, b] = v4;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd');
}

function allowedHosts(): Set<string> {
  return new Set(
    (process.env.ISPAGENT_OUTBOUND_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Valida uma URL configurável por tenant antes de o servidor fazer requisição a ela (SSRF).
 * Sempre bloqueia metadata de nuvem e link-local. Em produção exige https, resolve o DNS e bloqueia
 * endereços internos (salvo `ISPAGENT_OUTBOUND_ALLOWED_HOSTS`).
 */
export async function assertSafeOutboundUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeOutboundUrlError('URL inválida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeOutboundUrlError('Só http/https são permitidos.');
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError('A URL não pode conter usuário/senha.');
  }

  const production = isProduction();
  if (production && url.protocol !== 'https:') {
    throw new UnsafeOutboundUrlError('Em produção a URL precisa usar https.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (METADATA_HOSTS.has(host)) throw new UnsafeOutboundUrlError('Host de metadata bloqueado.');
  const allowlisted = allowedHosts().has(host);

  const literal = isIP(host) ? [host] : [];
  const addresses = literal.length > 0 || !production ? literal : await resolveAll(host);

  for (const address of addresses.map(unwrap)) {
    if (isAlwaysBlocked(address)) throw new UnsafeOutboundUrlError('Endereço bloqueado (link-local/metadata).');
    if (production && !allowlisted && isInternal(address)) {
      throw new UnsafeOutboundUrlError('Endereço interno bloqueado em produção (use ISPAGENT_OUTBOUND_ALLOWED_HOSTS).');
    }
  }
  if (production && !allowlisted && (host === 'localhost' || host.endsWith('.localhost'))) {
    throw new UnsafeOutboundUrlError('localhost bloqueado em produção.');
  }
  return url;
}

async function resolveAll(host: string): Promise<string[]> {
  try {
    return (await lookup(host, { all: true })).map((r) => r.address);
  } catch {
    throw new UnsafeOutboundUrlError(`Não consegui resolver o host "${host}".`);
  }
}
