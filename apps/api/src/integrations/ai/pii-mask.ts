/**
 * Minimização de dados antes de qualquer texto do cliente sair para um provedor de IA externo:
 * CPF/CNPJ, e-mail, telefone e sequências longas de dígitos viram marcadores. O modelo não precisa desses
 * valores para classificar a intenção nem para redigir a resposta (a identificação é feita por código).
 */
const RULES: Array<[RegExp, string]> = [
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]'],
  // Fronteiras de dígito nos dois lados: um número longo (cartão) não pode ser mascarado só em parte.
  [/(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[-\s]?\d{4}(?!\d)/g, '[TELEFONE]'],
  [/\b\d{9,}\b/g, '[NÚMERO]'],
];

export function maskPii(text: string): string {
  return RULES.reduce((acc, [pattern, marker]) => acc.replace(pattern, marker), text);
}

/** Só o primeiro nome vai para o modelo (basta para cumprimentar). */
export function firstName(fullName: string | null | undefined): string | null {
  const name = fullName?.trim().split(/\s+/)[0];
  return name ? name : null;
}
