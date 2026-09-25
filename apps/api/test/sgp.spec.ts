import { EventEmitter } from 'node:events';
import { SGPAdapter } from '../src/integrations/erp/sgp.adapter';
import { SgpClientService, SgpError } from '../src/integrations/erp/sgp-client.service';
import { runWithTenant } from '../src/common/tenant-context';

// Transporte falso: nenhum teste deste arquivo pode alcançar o SGP real. Sem resposta programada, falha alto.
function fakeTransport(reply?: { status: number; body: unknown }) {
  return ((_opts: unknown, onResponse: (res: EventEmitter & { statusCode: number }) => void) => {
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: () => void };
    req.write = () => undefined;
    req.destroy = () => undefined;
    req.end = () => {
      if (!reply) {
        req.emit('error', new Error('teste tentou chamar o SGP real'));
        return;
      }
      const res = Object.assign(new EventEmitter(), { statusCode: reply.status });
      onResponse(res);
      res.emit('data', JSON.stringify(reply.body));
      res.emit('end');
    };
    return req;
  }) as any;
}

describe('SGPAdapter & SgpClientService', () => {
  const savedEnv = { ...process.env };
  beforeAll(() => {
    process.env.ISPAGENT_SGP_BASE_URL = 'https://sgp.invalid';
    process.env.ISPAGENT_SGP_TOKEN = 'token-de-teste';
    process.env.ISPAGENT_SGP_APP = 'app-de-teste';
  });
  afterAll(() => {
    process.env = savedEnv;
  });

  let mockDb: any;
  let sgpClient: SgpClientService;
  let adapter: SGPAdapter;

  beforeEach(() => {
    mockDb = {
      client: {
        customer: {
          upsert: jest.fn().mockResolvedValue({}),
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        plan: {
          upsert: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
        },
        contract: {
          upsert: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue({ id: 'sgp_5678', status: 'ACTIVE' }),
        },
        invoice: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        supportTicket: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({}),
        },
      },
    };

    sgpClient = new SgpClientService(fakeTransport());
    adapter = new SGPAdapter(sgpClient, mockDb);
  });

  describe('SgpClientService', () => {
    it('isConfigured retorna true quando variáveis estão preenchidas', () => {
      expect(sgpClient.isConfigured()).toBe(true);
      const cfg = sgpClient.getConfig();
      expect(cfg.baseUrl).toBeDefined();
      expect(cfg.token).toBeDefined();
      expect(cfg.app).toBeDefined();
    });

    it('request lança SgpError com instrução clara de IP em caso de 403', async () => {
      sgpClient = new SgpClientService(fakeTransport({ status: 403, body: { detail: 'Credenciais de autenticação incorretas.' } }));

      await expect(sgpClient.consultarPlanos()).rejects.toThrow(/Hosts Permitidos/);
      jest.restoreAllMocks();
    });
  });

  describe('SGPAdapter Mappings', () => {
    it('findCustomer mapeia cliente do SGP e persiste no Prisma', async () => {
      const mockSgpCustomer = {
        id: 1234,
        nome: 'João da Silva',
        cpfcnpj: '12345678900',
        telefone: '81987654321',
        email: 'joao@example.com',
        contratos: [
          {
            id: 5678,
            status: 'Ativo',
            plano: { id: 10, descricao: 'FIBRA 500 MEGA' },
            endereco: { logradouro: 'Rua das Flores', numero: 100 },
          },
        ],
      };

      jest.spyOn(sgpClient, 'consultarCliente').mockResolvedValueOnce({
        clientes: [mockSgpCustomer],
      });

      const customer = await runWithTenant('tnt_vibe', () =>
        adapter.findCustomer({ document: '123.456.789-00' }),
      );

      expect(customer).not.toBeNull();
      expect(customer?.name).toBe('João da Silva');
      expect(customer?.document).toBe('12345678900');
      expect(customer?.phones).toContain('81987654321');
      expect(customer?.email).toBe('joao@example.com');
      expect(mockDb.client.customer.upsert).toHaveBeenCalled();
      expect(mockDb.client.contract.upsert).toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it('getPlans mapeia catálogo de planos e velocidade a partir da descrição', async () => {
      jest.spyOn(sgpClient, 'consultarPlanos').mockResolvedValueOnce({
        planos: [
          { id: 1, descricao: 'VIBE FIBRA 300 MEGA', preco: 79.9, download: 300000 },
          { id: 2, descricao: 'VIBE GIGA 1 GIGA', preco: 149.9, download: 1000000 },
          { id: 3, descricao: 'PLANO CORPORATIVO 600', preco: 199.9 },
        ],
      });

      const plans = await runWithTenant('tnt_vibe', () => adapter.getPlans());
      expect(plans.length).toBeGreaterThanOrEqual(3);

      const p300 = plans.find((p) => p.name.includes('300 MEGA'));
      expect(p300?.downloadMbps).toBe(300);
      expect(p300?.priceCents).toBe(7990);

      const p1g = plans.find((p) => p.name.includes('1 GIGA'));
      expect(p1g?.downloadMbps).toBe(1000);

      const pCorp = plans.find((p) => p.name.includes('600'));
      expect(pCorp?.downloadMbps).toBe(600);
      jest.restoreAllMocks();
    });

    it('getInvoices classifica faturas como OPEN, OVERDUE ou PAID', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      jest.spyOn(sgpClient, 'listarTitulos').mockResolvedValueOnce({
        titulos: [
          {
            id: 101,
            dataVencimento: yesterday,
            valor: '89.90',
            status: 'aberto',
            linha_digitavel: '34191.79001 01043.510047 91020.150008 8 90000000008990',
          },
          {
            id: 102,
            dataVencimento: nextWeek,
            valor: '89.90',
            status: 'aberto',
          },
          {
            id: 103,
            dataVencimento: '2026-08-10',
            dataPagamento: '2026-08-09',
            valor: '89.90',
            status: 'liquidado',
          },
        ],
      });

      jest.spyOn(sgpClient, 'segundaViaFatura').mockImplementation(async (_contrato: unknown, titulo: unknown) =>
        titulo === '102' ? ({ links: [{ codigopix: '00020126580014br.gov.bcb.pix...' }] } as any) : ({ links: [] } as any),
      );

      const invoices = await runWithTenant('tnt_vibe', () => adapter.getInvoices('sgp_5678'));
      expect(invoices).toHaveLength(3);

      const overdue = invoices.find((i) => i.id === '101');
      expect(overdue?.status).toBe('OVERDUE');
      expect(overdue?.amountCents).toBe(8990);
      expect(overdue?.barcodeUrl).toContain('34191');

      const open = invoices.find((i) => i.id === '102');
      expect(open?.status).toBe('OPEN');
      expect(open?.barcodeUrl).toContain('00020126580014br.gov.bcb.pix');

      const paid = invoices.find((i) => i.id === '103');
      expect(paid?.status).toBe('PAID');
      jest.restoreAllMocks();
    });

    it('getSupportTickets e createSupportTicket integram com ocorrências', async () => {
      jest.spyOn(sgpClient, 'listarOcorrencias').mockResolvedValueOnce({
        ocorrencias: [
          {
            id: 888,
            tipo: 'SEM CONEXAO',
            conteudo: 'Cliente relata led LOS vermelho no modem',
            status: 'Em andamento',
            data_cadastro: '2026-09-22 10:00:00',
          },
        ],
      });

      const tickets = await runWithTenant('tnt_vibe', () => adapter.getSupportTickets('sgp_5678'));
      expect(tickets).toHaveLength(1);
      expect(tickets[0].status).toBe('IN_PROGRESS');
      expect(tickets[0].category).toBe('SEM CONEXAO');

      jest.spyOn(sgpClient, 'criarChamado').mockResolvedValueOnce({
        id: 999,
        os_id: 999,
        mensagem: 'Ordem de serviço criada com sucesso',
      });

      const created = await runWithTenant('tnt_vibe', () =>
        adapter.createSupportTicket({
          contractId: 'sgp_5678',
          category: 'LENTIDAO',
          description: 'Quedas frequentes e lentidão na conexão',
          idempotencyKey: 'idem_test_123',
        }),
      );

      expect(created.id).toBe('999');
      expect(created.status).toBe('OPEN');
      jest.restoreAllMocks();
    });

    it('getServiceStatus detecta se cliente está conectado via radius', async () => {
      jest.spyOn(sgpClient, 'consultarCliente').mockResolvedValueOnce({
        id: 1234,
        conectado: 1,
        radius: { online: true, ip: '100.64.10.55' },
        servicos: [
          { tipo: 'Internet', status: 'Ativo', conectado: 1, ultimo_login: '2026-09-22 08:00:00' },
        ],
      });

      const svc = await runWithTenant('tnt_vibe', () => adapter.getServiceStatus('sgp_5678'));
      expect(svc?.online).toBe(true);
      jest.restoreAllMocks();
    });
  });
});
