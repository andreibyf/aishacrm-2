import { Tail } from 'tail';
import { Kafka } from 'kafkajs';
import amqplib from 'amqplib';
import fs from 'fs';
import path from 'path';
import http from 'http';

const INPUT_PATH = process.env.TELEMETRY_INPUT_PATH || '/telemetry/telemetry.ndjson';
const BUS_TYPE = (process.env.BUS_TYPE || 'kafka').toLowerCase(); // kafka | rabbit
const PRINT_EVENTS = String(process.env.PRINT_EVENTS || '').toLowerCase() === 'true';
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 4101);

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'redpanda:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'aisha.events.v1';

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://rabbitmq:5672';
const RABBIT_EXCHANGE = process.env.RABBIT_EXCHANGE || 'aisha.events.v1';
const RABBIT_ROUTING_KEY = process.env.RABBIT_ROUTING_KEY || 'events';

let status = 'starting';  // 'starting' | 'waiting_for_file' | 'tailing' | 'error'

// Simple health check HTTP server
http.createServer((req, res) => {
  if (req.url === '/health') {
    // Consider healthy once we're past initialization (even if waiting for file)
    const isHealthy = status !== 'starting' && status !== 'error';
    res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status, bus: BUS_TYPE }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(HEALTH_PORT, () => {
  process.stdout.write(`[telemetry] health server on :${HEALTH_PORT}\n`);
  status = 'waiting_for_file';
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureFileReady() {
  // Never crash-loop just because the core app hasn't written yet.
  // Create the directory and an empty file if missing.
  try {
    fs.mkdirSync(path.dirname(INPUT_PATH), { recursive: true });
  } catch (_) {}

  try {
    fs.accessSync(INPUT_PATH, fs.constants.F_OK);
    return;
  } catch (_) {
    try {
      fs.writeFileSync(INPUT_PATH, '', { flag: 'a' }); // touch
      return;
    } catch (_) {
      // If we can't create it (rare), fall back to waiting.
    }
  }

  for (let i = 0; i < 300; i++) {
    try {
      fs.accessSync(INPUT_PATH, fs.constants.F_OK);
      return;
    } catch (_) {
      await sleep(500);
    }
  }
  // Still don't exit; remain healthy but waiting.
  status = 'waiting_for_file';
  process.stderr.write(`[telemetry] warn: input file still missing: ${INPUT_PATH}\n`);
}

async function makePublisher() {
  if (BUS_TYPE === 'rabbit') {
    const conn = await amqplib.connect(RABBIT_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange(RABBIT_EXCHANGE, 'topic', { durable: true });
    return async (evt) => {
      ch.publish(RABBIT_EXCHANGE, RABBIT_ROUTING_KEY, Buffer.from(JSON.stringify(evt)), {
        contentType: 'application/json',
        persistent: true,
      });
    };
  }

  // default kafka
  const kafka = new Kafka({ clientId: 'aisha-telemetry-sidecar', brokers: KAFKA_BROKERS });
  const producer = kafka.producer();
  await producer.connect();
  return async (evt) => {
    const key = evt?.tenant_id || evt?.execution_id || 'global';
    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [{ key: String(key), value: JSON.stringify(evt) }],
    });
  };
}

function parseLine(line) {
  try {
    const evt = JSON.parse(line);
    if (!evt || evt._telemetry !== true) return null;
    return evt;
  } catch (_) {
    return null;
  }
}

async function main() {
  await ensureFileReady();
  const publish = await makePublisher();

  const tail = new Tail(INPUT_PATH, { fromBeginning: false, follow: true, useWatchFile: true });

  tail.on('line', async (line) => {
    const evt = parseLine(line);
    if (!evt) return;
    if (PRINT_EVENTS) {
      process.stdout.write(`[telemetry] ${evt.type} tenant=${evt.tenant_id || '-'} run=${evt.run_id || '-'} task=${evt.task_id || '-'} agent=${evt.agent_id || '-'}\n`);
    }
    try {
      await publish(evt);
    } catch (e) {
      process.stderr.write(`[telemetry] publish error: ${e?.message || e}\n`);
    }
  });

  tail.on('error', (err) => {
    process.stderr.write(`[telemetry] tail error: ${err?.message || err}\n`);
  });

  status = 'tailing';
  process.stdout.write(`[telemetry] sidecar started. input=${INPUT_PATH} bus=${BUS_TYPE}\n`);
}

main().catch((e) => {
  status = 'error';
  process.stderr.write(`[telemetry] fatal: ${e?.stack || e}\n`);
  process.exit(1);
});
