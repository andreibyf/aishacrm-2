import http from 'node:http';

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    normalized[key] = value;
  }
  return normalized;
}

function buildResponse(res, raw) {
  const headers = new Map();
  for (const [key, value] of Object.entries(res.headers || {})) {
    headers.set(key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value);
  }

  return {
    ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
    status: res.statusCode || 0,
    statusCode: res.statusCode || 0,
    headers: {
      get(name) {
        return headers.get(String(name).toLowerCase()) ?? null;
      },
      entries() {
        return headers.entries();
      },
    },
    async text() {
      return raw;
    },
    async json() {
      return raw ? JSON.parse(raw) : null;
    },
  };
}

export function requestLocal({ port, path, method = 'GET', headers = {}, body, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const normalizedHeaders = normalizeHeaders({
      connection: 'close',
      ...headers,
    });

    let payload = body;
    if (payload && typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
      payload = JSON.stringify(payload);
      if (!normalizedHeaders['Content-Type'] && !normalizedHeaders['content-type']) {
        normalizedHeaders['Content-Type'] = 'application/json';
      }
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: normalizedHeaders,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve(buildResponse(res, raw));
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);

    if (payload !== undefined && payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}
