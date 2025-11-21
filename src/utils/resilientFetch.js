// Resilient fetch wrapper with timeout, limited retries, and error classification
// Usage: resilientFetch(url, { method, headers, body, timeoutMs, maxRetries })
// Returns: { ok, status, data, response, errorType, attempts }
// errorType: 'timeout' | 'network' | 'http' | 'parse'
export async function resilientFetch(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 6000,
    maxRetries = 2,
    retryOnHttp = [502, 503, 504],
    parseJson = true,
  } = options;

  const attempts = [];
  let lastErrorType = null;
  let lastStatus = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let errorType = null;
    let status = null;
    let data = null;
    try {
      response = await fetch(url, { method, headers, body, signal: controller.signal });
      status = response.status;
      if (!response.ok) {
        errorType = 'http';
        // Retry only selected transient HTTP codes
        if (attempt < maxRetries && retryOnHttp.includes(response.status)) {
          attempts.push({ attempt, status, errorType });
          await delay(backoffDelay(attempt));
          continue;
        }
        // Consume body text for context (but still classify as http)
        try { await response.text(); } catch { /* ignore */ }
      } else if (parseJson) {
        try {
          const text = await response.text();
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          errorType = 'parse';
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        errorType = 'timeout';
      } else {
        errorType = 'network';
      }
    } finally {
      clearTimeout(timer);
    }

    attempts.push({ attempt, status, errorType });
    lastErrorType = errorType;
    lastStatus = status;

    // Success path
    if (response && response.ok && (!errorType || errorType === null)) {
      return { ok: true, status, data, response, errorType: null, attempts };
    }

    // Retry logic for timeout / network
    if (attempt < maxRetries && (errorType === 'timeout' || errorType === 'network')) {
      await delay(backoffDelay(attempt));
      continue;
    }

    // No further retries - return failure snapshot
    break;
  }

  return { ok: false, status: lastStatus, data: null, response: null, errorType: lastErrorType, attempts };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function backoffDelay(attempt) { return 250 * (attempt + 1) + jitter(); }
function jitter() { return Math.floor(Math.random() * 150); }
