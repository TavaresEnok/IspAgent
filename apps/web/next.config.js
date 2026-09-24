/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança. O CSP aqui é o subconjunto que não quebra o Next (que injeta scripts inline):
// impede <base>/<object> maliciosos e envio de formulários para fora. Um CSP de `script-src` estrito
// exigiria nonces por requisição.
//
// Painel de staff: nunca embutível em iframe (clickjacking) e sem acesso a câmera/microfone.
// Web Chat (/webchat): pode ser embutido pelo widget.js nos sites listados em
// ISPAGENT_WEBCHAT_FRAME_ANCESTORS (lido no BUILD; ex.: "https://www.vibetelecom.com.br") e pode usar o
// microfone (mensagem de voz). Sem a variável, só a própria origem pode embutir.
const frameAncestors = (process.env.ISPAGENT_WEBCHAT_FRAME_ANCESTORS || '').trim() || "'self'";

const common = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const staffHeaders = [
  ...common,
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const webchatHeaders = [
  ...common,
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: `frame-ancestors ${frameAncestors}; base-uri 'self'; object-src 'none'; form-action 'self'`,
  },
];

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@ispagent/shared'],
  async headers() {
    return [
      { source: '/((?!webchat).*)', headers: staffHeaders },
      { source: '/webchat', headers: webchatHeaders },
    ];
  },
};

module.exports = nextConfig;
