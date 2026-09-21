import { ROLE_HIERARCHY, Role } from '@ispagent/shared';

/** CPF/CNPJ completo só para SUPERVISOR+; abaixo disso só os 2 últimos dígitos (minimização, LGPD). */
export function maskDocument(document: string, role: string | undefined): string {
  if (role && ROLE_HIERARCHY[role as Role] >= ROLE_HIERARCHY.SUPERVISOR) return document;
  let visibleDigits = 2;
  let out = '';
  for (let i = document.length - 1; i >= 0; i--) {
    const ch = document[i];
    if (/\d/.test(ch)) {
      out = (visibleDigits > 0 ? ch : '•') + out;
      visibleDigits--;
    } else {
      out = ch + out;
    }
  }
  return out;
}
