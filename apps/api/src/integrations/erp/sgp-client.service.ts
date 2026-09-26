import * as https from 'https';
import { Injectable, Logger, Optional } from '@nestjs/common';

export interface SgpConfig {
  baseUrl: string;
  token: string;
  app: string;
  timeoutMs?: number;
}

export class SgpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'SgpError';
  }
}

/**
 * Cliente HTTP para a API oficial do SGP (Sistema de Gestão de Provedores).
 * Documentação: docs/SGP-API.md e https://bookstack.sgp.net.br/books/api/page/autenticacoes-via-api
 *
 * Autenticação: `token` e `app` enviados em toda requisição (query string em GET, formulário em POST).
 */
@Injectable()
export class SgpClientService {
  private readonly logger = new Logger(SgpClientService.name);

  constructor(@Optional() private readonly transport: typeof https.request = https.request) {}

  getConfig(): SgpConfig {
    return {
      // Credenciais só por variável de ambiente (.env, fora do git) — nunca como valor padrão no código.
      baseUrl: (process.env.ISPAGENT_SGP_BASE_URL ?? '').trim().replace(/\/+$/, ''),
      token: (process.env.ISPAGENT_SGP_TOKEN ?? '').trim(),
      app: (process.env.ISPAGENT_SGP_APP ?? '').trim(),
      timeoutMs: 15_000,
    };
  }

  isConfigured(): boolean {
    const cfg = this.getConfig();
    return Boolean(cfg.baseUrl && cfg.token && cfg.app);
  }

  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string | number | boolean | null | undefined> = {},
  ): Promise<T> {
    const cfg = this.getConfig();
    if (!cfg.baseUrl || !cfg.token || !cfg.app) {
      throw new SgpError('SGP não configurado: defina ISPAGENT_SGP_BASE_URL, ISPAGENT_SGP_TOKEN e ISPAGENT_SGP_APP.');
    }

    const cleanParams: Record<string, string> = {
      token: cfg.token,
      app: cfg.app,
    };

    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        cleanParams[k] = String(v);
      }
    }

    const postData = new URLSearchParams(cleanParams).toString();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const urlObj = new URL(`${cfg.baseUrl}${normalizedPath}`);

    return new Promise<T>((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: method === 'GET' ? `${urlObj.pathname}?${postData}` : urlObj.pathname,
        method,
        family: 4, // Força IPv4 explicitamente para autenticação no SGP
        timeout: cfg.timeoutMs || 15_000,
        headers: {
          'User-Agent': 'ISPAgent-Vibe/1.0',
          ...(method === 'POST'
            ? {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
              }
            : {}),
        },
      };

      const req = this.transport(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body: any = null;
          try {
            body = data ? JSON.parse(data) : null;
          } catch {
            body = data;
          }

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body as T);
          } else {
            if (res.statusCode === 403) {
              reject(
                new SgpError(
                  'Acesso recusado pelo SGP (HTTP 403). Verifique se o token é válido, se está ativo e se o IP do servidor está autorizado na lista de Hosts Permitidos do SGP (Painel Admin -> Tokens).',
                  403,
                  'FORBIDDEN',
                ),
              );
              return;
            }
            if (res.statusCode === 404) {
              reject(new SgpError('Recurso não encontrado no SGP (HTTP 404).', 404, 'NOT_FOUND'));
              return;
            }

            const errMsg =
              body?.detail || body?.erro || body?.error || body?.message || data || `HTTP ${res.statusCode}`;
            reject(new SgpError(`SGP erro ${res.statusCode}: ${errMsg}`, res.statusCode));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new SgpError(`Timeout ao contatar o SGP em ${cfg.baseUrl}`, undefined, 'TIMEOUT'));
      });

      req.on('error', (err) => {
        reject(
          new SgpError(
            `Erro de rede ao conectar no SGP (${cfg.baseUrl}): ${err.message}`,
            undefined,
            'NETWORK_ERROR',
          ),
        );
      });

      if (method === 'POST') {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Consulta cliente por CPF/CNPJ, telefone, contrato, login ou nome.
   * Endpoint: `POST /api/ura/consultacliente/`
   */
  async consultarCliente(filter: {
    cpfcnpj?: string;
    telefone?: string;
    contrato?: string | number;
    login?: string;
    nome?: string;
  }): Promise<any> {
    try {
      const res = await this.request('POST', '/api/ura/clientes/', {
        cpfcnpj: filter.cpfcnpj,
        contrato: filter.contrato,
        telefone: filter.telefone,
        servicos_dados: '1',
        radius: '1',
        incluir_unificados: '1',
      });
      if (res && ((res as any).clientes?.length > 0 || (res as any).id || (res as any).nome)) {
        return res;
      }
    } catch (e) {
      this.logger.debug(`Rota /api/ura/clientes/ falhou, tentando /api/ura/consultacliente/: ${e}`);
    }

    return this.request('POST', '/api/ura/consultacliente/', {
      ...filter,
      servicos_dados: '1',
      radius: '1',
      incluir_unificados: '1',
    });
  }

  /**
   * Consulta catálogo de planos.
   * Endpoint: `GET /api/ura/consultaplano/` (com fallback POST se necessário)
   */
  async consultarPlanos(): Promise<any> {
    try {
      return await this.request('GET', '/api/ura/consultaplano/');
    } catch (err) {
      if (err instanceof SgpError && err.status === 405) {
        return this.request('POST', '/api/ura/consultaplano/');
      }
      throw err;
    }
  }

  /**
   * Lista títulos/faturas por contrato ou CPF.
   * Endpoint: `POST /api/ura/titulos/`
   */
  async listarTitulos(filter: {
    contrato?: string | number;
    cpfcnpj?: string;
    cliente_id?: string | number;
    status?: string;
    limit?: number;
  }): Promise<any> {
    return this.request('POST', '/api/ura/titulos/', {
      ...filter,
      limit: filter.limit || 50,
      link_pdf: '1',
    });
  }

  /**
   * Gera código Copia e Cola e QR Code do PIX para uma fatura.
   * Endpoint: `POST /api/ura/pagamento/pix/{fatura}`
   */
  async gerarPix(faturaId: string | number): Promise<any> {
    return this.request('POST', `/api/ura/pagamento/pix/${encodeURIComponent(String(faturaId))}`);
  }

  /**
   * Obtém link ou PDF de 2ª via da fatura.
   * Endpoint: `POST /api/ura/fatura2via/`
   */
  async segundaViaFatura(contratoId: string | number, faturaId?: string | number): Promise<any> {
    return this.request('POST', '/api/ura/fatura2via/', {
      contrato: contratoId,
      fatura: faturaId,
    });
  }

  /**
   * Lista chamados/ocorrências de suporte do contrato ou cliente.
   * Endpoint: `POST /api/ura/ocorrencia/list/`
   */
  async listarOcorrencias(filter: { contrato?: string | number; cliente?: string | number; limit?: number }): Promise<any> {
    return this.request('POST', '/api/ura/ocorrencia/list/', {
      ...filter,
      limit: filter.limit || 20,
    });
  }

  /**
   * Cria ocorrência / ordem de serviço na fila de suporte do SGP.
   * Endpoint: `POST /api/ura/chamado/`
   */
  async criarChamado(input: {
    contrato: string | number;
    conteudo: string;
    contato?: string;
    contato_numero?: string;
    ocorrenciatipo?: number | string;
    prioridade?: number;
  }): Promise<any> {
    return this.request('POST', '/api/ura/chamado/', {
      contrato: input.contrato,
      conteudo: input.conteudo,
      contato: input.contato || 'Cliente WebChat',
      contato_numero: input.contato_numero || '',
      ocorrenciatipo: input.ocorrenciatipo || 1,
      os_prioridade: input.prioridade || 2,
    });
  }

  /**
   * Executa liberação em promessa de pagamento (desbloqueio em confiança de 48h).
   * Endpoint: `POST /api/ura/liberacaopromessa/`
   */
  async liberarPromessa(contrato: string | number, cpfcnpj?: string): Promise<any> {
    return this.request('POST', '/api/ura/liberacaopromessa/', {
      contrato,
      ...(cpfcnpj ? { cpfcnpj } : {}),
    });
  }

  /**
   * Consulta sinal óptico da ONU do contrato (potência RX/TX em dBm).
   * Endpoint: `GET /api/fttx/onu/list/` com signal=1
   */
  async consultarSinalOnu(contrato: string | number): Promise<any> {
    try {
      return await this.request('GET', '/api/fttx/onu/list/', {
        contrato,
        signal: 1,
      });
    } catch (err) {
      this.logger.warn(`Erro ao consultar sinal de ONU no SGP: ${err}`);
      return null;
    }
  }

  /**
   * Adiciona anexo (ex: comprovante de pagamento) na ocorrência/chamado do cliente.
   * Endpoint: `POST /api/central/chamado/{os_id}/anexo/add/`
   */
  async adicionarAnexoChamado(osId: string | number, fileB64: string, filename: string, descricao?: string): Promise<any> {
    return this.request('POST', `/api/central/chamado/${encodeURIComponent(String(osId))}/anexo/add/`, {
      file_b64: fileB64,
      filename,
      descricao: descricao || 'Comprovante anexado pelo cliente via Chat',
    });
  }
}
