import { logError } from './devLogger';

function readErrorMessage(payload, fallbackMessage) {
  if (!payload || typeof payload !== 'object') return fallbackMessage;
  return (
    payload.error ||
    payload.message ||
    payload.details ||
    payload.reason ||
    payload.statusText ||
    fallbackMessage
  );
}

async function parseResponseError(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  let payload = null;

  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      const text = await response.text();
      if (text) payload = { message: text };
    } catch {
      payload = null;
    }
  }

  const message = readErrorMessage(
    payload,
    fallbackMessage || `Request failed (${response.status})`,
  );
  const error = new Error(message);
  error.name = 'ApiRequestError';
  error.status = response.status;
  error.payload = payload;
  return error;
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

export function getErrorMessage(error, fallback = 'Unexpected error') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

export function logApiError(context, error, meta = {}) {
  logError('[API Error]', {
    context,
    message: getErrorMessage(error),
    name: error?.name,
    status: error?.status,
    payload: error?.payload,
    ...meta,
  });
}

export async function fetchJsonWithHandling(url, options = {}, meta = {}) {
  const fallbackMessage = meta.fallbackMessage || 'Request failed';
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    if (isAbortError(error)) throw error;
    const wrapped = new Error(getErrorMessage(error, fallbackMessage));
    wrapped.name = 'NetworkRequestError';
    wrapped.cause = error;
    throw wrapped;
  }

  if (!response.ok) {
    throw await parseResponseError(response, fallbackMessage);
  }

  const text = await response.text();
  let parsedPayload = null;

  if (text) {
    try {
      parsedPayload = JSON.parse(text);
    } catch (error) {
      const parseError = new Error(meta.parseErrorMessage || 'Invalid server response');
      parseError.name = 'ResponseParseError';
      parseError.cause = error;
      throw parseError;
    }
  }

  if (meta.includeResponseMeta) {
    return {
      data: parsedPayload,
      status: response.status,
      ok: response.ok,
    };
  }

  return parsedPayload;
}
