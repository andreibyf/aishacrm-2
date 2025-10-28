/**
 * A utility to time an async function (API call) and log its performance.
 * Performance logging is now handled server-side via the performanceLogger middleware.
 * This function now only times the call for potential client-side metrics.
 *
 * @param {string} functionName - A descriptive name for the function being timed.
 * @param {Function} apiCall - The async function to execute and time.
 * @returns {Promise<any>} - The result of the executed apiCall.
 */
export async function timeApiCall(functionName, apiCall) {
    const startTime = performance.now();

    try {
        return await apiCall();
    } finally {
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        // Performance logging is now handled server-side via middleware
        // Only log to console in development mode for debugging slow calls
        if (import.meta.env.DEV && responseTime > 1000) {
            console.warn(`Slow API call: ${functionName} took ${Math.round(responseTime)}ms`);
        }
    }
}