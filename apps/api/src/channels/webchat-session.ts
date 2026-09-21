import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de sessão do Web Chat (usado em produção): prova que quem chama conhece o segredo emitido pelo
 * servidor quando a conversa foi criada — saber o `channelUserId` sozinho não dá acesso ao histórico nem
 * permite falar "como" aquela conversa. É um HMAC do par (tenant, channelUserId); não fica guardado.
 */
export function issueWebchatToken(tenantId: string, channelUserId: string): string {
  const secret = process.env.ISPAGENT_JWT_SECRET;
  if (!secret) throw new Error('[webchat] ISPAGENT_JWT_SECRET não definida.');
  return createHmac('sha256', secret).update(`webchat|${tenantId}|${channelUserId}`).digest('base64url');
}

export function isValidWebchatToken(tenantId: string, channelUserId: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const expected = Buffer.from(issueWebchatToken(tenantId, channelUserId));
  const actual = Buffer.from(presented);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
