/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança do painel. O CSP aqui é o subconjunto que não quebra o Next (que injeta scripts
// inline): impede embutir o painel em iframe (clickjacking), <base>/<object> maliciosos e envio de
// formulários para fora. Um CSP de `script-src` estrito exigiria nonces por requisição.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@ispagent/shared'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
