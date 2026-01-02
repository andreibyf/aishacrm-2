/**
 * CHUNKER MODULE FOR AI MEMORY
 * Splits long text into chunks suitable for embedding and retrieval
 * Max chunk size: 3500 chars (fits within most embedding model limits)
 */

/**
 * Default chunk configuration
 */
export const DEFAULT_CHUNK_CONFIG = {
  maxChars: 3500, // Max characters per chunk
  overlap: 200, // Character overlap between chunks for continuity
  minChunkSize: 100 // Minimum chunk size (skip chunks smaller than this)
};

/**
 * Split text into chunks of max size with overlap
 * Attempts to split on sentence boundaries where possible
 * @param {string} text - Text to chunk
 * @param {object} options - Chunking options
 * @param {number} options.maxChars - Maximum characters per chunk
 * @param {number} options.overlap - Overlap between chunks
 * @param {number} options.minChunkSize - Minimum chunk size
 * @returns {string[]} - Array of text chunks
 */
export function chunkText(text, options = {}) {
  const config = { ...DEFAULT_CHUNK_CONFIG, ...options };
  const { maxChars, overlap, minChunkSize } = config;
  
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // If text is already small enough, return as single chunk
  if (text.length <= maxChars) {
    return text.length >= minChunkSize ? [text] : [];
  }
  
  const chunks = [];
  let position = 0;
  
  while (position < text.length) {
    // Calculate chunk end position
    let chunkEnd = Math.min(position + maxChars, text.length);
    
    // If not at end of text, try to split on sentence boundary
    if (chunkEnd < text.length) {
      // Look for sentence endings within last 200 chars of chunk
      const searchStart = Math.max(chunkEnd - 200, position);
      const substring = text.substring(searchStart, chunkEnd);
      
      // Find last sentence boundary (., !, ?, or newline)
      const sentenceEnds = [
        substring.lastIndexOf('. '),
        substring.lastIndexOf('! '),
        substring.lastIndexOf('? '),
        substring.lastIndexOf('\n')
      ];
      
      const lastSentenceEnd = Math.max(...sentenceEnds);
      
      // If found sentence boundary, use it
      if (lastSentenceEnd > 0) {
        chunkEnd = searchStart + lastSentenceEnd + 1;
      }
    }
    
    // Extract chunk
    const chunk = text.substring(position, chunkEnd).trim();
    
    // Only add chunk if it meets minimum size
    if (chunk.length >= minChunkSize) {
      chunks.push(chunk);
    }
    
    // Move position forward (with overlap if not at end)
    if (chunkEnd < text.length) {
      position = chunkEnd - overlap;
    } else {
      position = text.length; // End of text
    }
  }
  
  return chunks;
}

/**
 * Estimate number of chunks text will be split into
 * Useful for cost estimation before chunking
 * @param {string} text - Text to estimate
 * @param {object} options - Chunking options
 * @returns {number} - Estimated chunk count
 */
export function estimateChunkCount(text, options = {}) {
  const config = { ...DEFAULT_CHUNK_CONFIG, ...options };
  const { maxChars, overlap } = config;
  
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  if (text.length <= maxChars) {
    return 1;
  }
  
  // Rough estimate: text length divided by (chunk size - overlap)
  const effectiveChunkSize = maxChars - overlap;
  return Math.ceil(text.length / effectiveChunkSize);
}

/**
 * Calculate total characters across all chunks (accounting for overlap)
 * @param {string} text - Original text
 * @param {object} options - Chunking options
 * @returns {number} - Total characters in all chunks combined
 */
export function calculateChunkedSize(text, options = {}) {
  const chunks = chunkText(text, options);
  return chunks.reduce((total, chunk) => total + chunk.length, 0);
}
