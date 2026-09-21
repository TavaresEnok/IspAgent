import 'reflect-metadata';
import http from 'node:http';
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Processo do container ispagent-worker. Compartilha o código-fonte de @ispagent/api (ver
 * DECISIONS.md, 2026-09-14) mas roda um entrypoint próprio sem HTTP de domínio — só um healthcheck
 * simples — e inicializa os workers BullMQ. As filas de negócio (ingestão de KB, webhook, analytics,
 * follow-up) são registradas conforme cada fase que as implementa entra em operação; nesta fase
 * (Fundação) só a fila `system` existe, para provar conectividade real com Redis via BullMQ.
 */

const redisUrl = process.env.ISPAGENT_REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

let ready = false;

const systemQueue = new Queue('system', { connection });

const systemWorker = new Worker(
  'system',
  async (job) => {
    // eslint-disable-next-line no-console
    console.log(`[ispagent-worker] processed job ${job.id} (${job.name})`);
  },
  { connection },
);

systemWorker.on('ready', () => {
  ready = true;
  // eslint-disable-next-line no-console
  console.log('[ispagent-worker] BullMQ worker ready, connected to Redis');
});

systemWorker.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[ispagent-worker] worker error', err);
});

const healthPort = Number(process.env.ISPAGENT_WORKER_HEALTH_PORT ?? 3002);
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: ready ? 'ok' : 'starting', service: 'ispagent-worker' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(healthPort, () => {
  // eslint-disable-next-line no-console
  console.log(`[ispagent-worker] health endpoint on :${healthPort}/health`);
});

process.on('SIGTERM', async () => {
  await systemWorker.close();
  await systemQueue.close();
  server.close();
  process.exit(0);
});
