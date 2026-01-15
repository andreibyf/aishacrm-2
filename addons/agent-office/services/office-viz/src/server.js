import express from 'express';
import { Kafka } from 'kafkajs';
import amqplib from 'amqplib';

const app = express();
const PORT = Number(process.env.PORT || 4010);
const BUS_TYPE = (process.env.BUS_TYPE || 'kafka').toLowerCase();
const MAX_EVENTS = Number(process.env.MAX_EVENTS_IN_MEMORY || 5000);

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'redpanda:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'aisha.telemetry';

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://rabbitmq:5672';
const RABBIT_EXCHANGE = process.env.RABBIT_EXCHANGE || 'aisha.telemetry';
const RABBIT_BINDING_KEY = process.env.RABBIT_BINDING_KEY || 'events';

const events = [];
const sseClients = new Set();

function pushEvent(evt) {
  events.push(evt);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  const line = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); } catch (_) {}
  }
}

async function startConsumer() {
  if (BUS_TYPE === 'rabbit') {
    const conn = await amqplib.connect(RABBIT_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange(RABBIT_EXCHANGE, 'topic', { durable: true });
    const q = await ch.assertQueue('', { exclusive: true });
    await ch.bindQueue(q.queue, RABBIT_EXCHANGE, RABBIT_BINDING_KEY);
    await ch.consume(q.queue, (msg) => {
      if (!msg) return;
      try {
        const evt = JSON.parse(msg.content.toString('utf-8'));
        pushEvent(evt);
      } catch (_) {}
      ch.ack(msg);
    });
    return;
  }

  // kafka default
  const kafka = new Kafka({ clientId: 'aisha-office-viz', brokers: KAFKA_BROKERS });
  const consumer = kafka.consumer({ groupId: 'aisha-office-viz' });
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const evt = JSON.parse(message.value.toString('utf-8'));
        pushEvent(evt);
      } catch (_) {}
    }
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', events: events.length, clients: sseClients.size });
});

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>AiSHA Office Viz (MVP)</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 20px; }
    #log { white-space: pre; background: #111; color: #0f0; padding: 12px; border-radius: 8px; height: 70vh; overflow: auto; }
  </style>
</head>
<body>
  <h1>AiSHA Office Viz (MVP)</h1>
  <p>This is a minimal event tap. The animated "office workers" UI can be built on top of the same SSE stream.</p>
  <div id="log"></div>
  <script>
    const log = document.getElementById('log');
    const es = new EventSource('/sse');
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      log.textContent += JSON.stringify(evt) + "\n";
      log.scrollTop = log.scrollHeight;
    };
  </script>
</body>
</html>`);
});

app.get('/events', (req, res) => {
  res.json({ count: events.length, events });
});

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  // replay current buffer
  for (const evt of events.slice(-500)) {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
});

startConsumer().then(() => {
  app.listen(PORT, () => {
    console.log(`[office-viz] listening on :${PORT} bus=${BUS_TYPE}`);
  });
}).catch((e) => {
  console.error('[office-viz] consumer fatal', e);
  process.exit(1);
});
