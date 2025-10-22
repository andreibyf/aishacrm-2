import { PerformanceLog } from '@/api/entities';

/**
 * A utility to time an async function (API call) and log its performance.
 * It does not block the UI thread for logging.
 *
 * @param {string} functionName - A descriptive name for the function being timed.
 * @param {Function} apiCall - The async function to execute and time.
 * @returns {Promise<any>} - The result of the executed apiCall.
 */
export async function timeApiCall(functionName, apiCall) {
    const startTime = performance.now();
    let status = 'success';
    let errorMessage = null;
    let result;

    try {
        result = await apiCall();
        return result; // Return immediately to not delay UI
    } catch (error) {
        status = 'error';
        errorMessage = error.message;
        throw error; // Re-throw error so the calling function can handle it
    } finally {
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        // Log performance in the background, without awaiting it.
        // This is a "fire and forget" operation to avoid blocking the UI.
        PerformanceLog.create({
            function_name: functionName,
            response_time_ms: Math.round(responseTime),
            status: status,
            error_message: errorMessage
        }).catch(logError => {
            // This might happen if user is offline or RLS prevents writing.
            // We log it to the console but don't bother the user.
            console.warn(`Failed to log performance for ${functionName}:`, logError);
        });
    }
}