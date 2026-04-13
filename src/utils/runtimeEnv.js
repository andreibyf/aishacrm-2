const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

export function getRuntimeEnv(key) {
  const runtimeEnv = typeof window !== 'undefined' ? window._env_ : undefined;
  if (runtimeEnv && Object.prototype.hasOwnProperty.call(runtimeEnv, key)) {
    return runtimeEnv[key];
  }
  return viteEnv?.[key];
}

export function isLocalhostHttp(locationObj = typeof window !== 'undefined' ? window.location : undefined) {
  if (!locationObj) {
    return false;
  }

  return (
    locationObj.protocol === 'http:' &&
    (locationObj.hostname === 'localhost' || locationObj.hostname === '127.0.0.1')
  );
}

export function shouldDisableSecureMode({
  isDev = Boolean(viteEnv?.DEV),
  location = typeof window !== 'undefined' ? window.location : undefined,
} = {}) {
  return Boolean(isDev || isLocalhostHttp(location));
}
