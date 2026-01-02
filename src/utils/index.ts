


export function createPageUrl(pageName: string) {
    // Defensive: handle undefined/null or non-string inputs gracefully
    if (!pageName || typeof pageName !== 'string') {
        try {
            if (import.meta.env?.DEV) {
                // eslint-disable-next-line no-console
                console.warn('[createPageUrl] called with invalid pageName:', pageName);
            }
        } catch (_error) {
            // Ignore import.meta errors in non-Vite environments
        }
        return '#';
    }
    return '/' + pageName.toLowerCase().replace(/ /g, '-');
}

export {
    trackRealtimeEvent,
    trackConnectionStateChange,
    subscribeToRealtimeTelemetry,
    getRealtimeTelemetrySnapshot,
    clearRealtimeTelemetry
} from './realtimeTelemetry.js';