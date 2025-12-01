const MAX_ENTRIES = 60;
const subscribers = new Set();
const buffer = [];

const getIsDebugEnabled = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_AI_DEBUG_TELEMETRY === 'true') {
        return true;
      }
      return Boolean(import.meta.env.DEV);
    }
  } catch {
    // ignore env lookup errors
  }
  const nodeProcess = typeof globalThis !== 'undefined' ? globalThis.process : undefined;
  if (nodeProcess && nodeProcess.env) {
    if (nodeProcess.env.VITE_AI_DEBUG_TELEMETRY === 'true') {
      return true;
    }
    return nodeProcess.env.NODE_ENV !== 'production';
  }
  return false;
};

const debugEnabled = getIsDebugEnabled();

const safeString = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  if (value.length <= 80) {
    return value;
  }
  return `${value.slice(0, 77)}...`;
};

const scrubPrimitive = (value) => {
  if (value === null) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return safeString(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => scrubPrimitive(item));
  }
  if (typeof value === 'object') {
    return '[object]';
  }
  return value;
};

const scrubPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  return Object.entries(payload).reduce((acc, [key, value]) => {
    acc[key] = scrubPrimitive(value);
    return acc;
  }, {});
};

const scrubContext = (context = {}) => {
  const allowedKeys = ['tenantId', 'tenantName', 'userId', 'surface', 'route'];
  return allowedKeys.reduce((acc, key) => {
    if (context[key]) {
      acc[key] = safeString(context[key]);
    }
    return acc;
  }, {});
};

const now = () => {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
};

const emit = (entry) => {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
  subscribers.forEach((listener) => {
    try {
      listener([...buffer]);
    } catch {
      // listener errors should never break telemetry
    }
  });
  if (debugEnabled) {
    try {
      console.debug('[RealtimeTelemetry]', entry.event || entry.state, entry.payload || entry);
    } catch {
      // ignore console errors
    }
  }
};

const createEntry = (details) => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
  timestamp: now(),
  ...details,
});

export function trackRealtimeEvent({ event, payload, context, severity = 'info' }) {
  if (!event) return;
  const entry = createEntry({
    event,
    severity,
    payload: scrubPayload(payload),
    context: scrubContext(context),
  });
  emit(entry);
}

export function trackConnectionStateChange({ from, to, reason, context }) {
  const entry = createEntry({
    event: 'realtime.connection.state',
    payload: {
      from: safeString(from || 'unknown'),
      to: safeString(to || 'unknown'),
      reason: safeString(reason || null),
    },
    context: scrubContext(context),
  });
  emit(entry);
}

export function subscribeToRealtimeTelemetry(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  subscribers.add(listener);
  try {
    listener([...buffer]);
  } catch {
    // ignore subscriber init errors
  }
  return () => {
    subscribers.delete(listener);
  };
}

export function getRealtimeTelemetrySnapshot() {
  return [...buffer];
}

export function clearRealtimeTelemetry() {
  buffer.length = 0;
}
