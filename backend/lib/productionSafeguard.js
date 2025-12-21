// Production Safeguard Utility
// Prevents accidental data migration or destructive operations in production

/**
 * Check if current environment is production
 */
export function isProduction() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const isProdDb = supabaseUrl.includes('ehjlenywplgyiahgxkfj');
  return isProdDb;
}

/**
 * Check if current environment is development
 */
export function isDevelopment() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const isDevDb = supabaseUrl.includes('efzqxjpfewkrgpdootte');
  return isDevDb;
}

/**
 * Get environment label
 */
export function getEnvironmentLabel() {
  if (isProduction()) return 'PRODUCTION';
  if (isDevelopment()) return 'DEVELOPMENT';
  return 'UNKNOWN';
}

/**
 * Require confirmation for destructive operations
 * Throws error if not confirmed or if in production
 */
export function requireConfirmation(operation, forceConfirm = false) {
  const env = getEnvironmentLabel();
  
  if (isProduction() && !forceConfirm) {
    throw new Error(
      `🚫 BLOCKED: Cannot perform "${operation}" in PRODUCTION environment!\n` +
      `This operation is only allowed in DEVELOPMENT.\n` +
      `Current database: ${process.env.SUPABASE_URL || 'unknown'}`
    );
  }
  
  console.log('');
  console.log('⚠️  WARNING: DESTRUCTIVE OPERATION');
  console.log('========================================');
  console.log(`Operation: ${operation}`);
  console.log(`Environment: ${env}`);
  console.log(`Database: ${process.env.SUPABASE_URL || 'unknown'}`);
  console.log('========================================');
  console.log('');
  
  return true;
}

/**
 * Block production writes completely
 */
export function blockProductionWrites(operation) {
  if (isProduction()) {
    throw new Error(
      `🚫 PRODUCTION WRITE BLOCKED!\n\n` +
      `Operation: ${operation}\n` +
      `Environment: PRODUCTION\n` +
      `Database: ${process.env.SUPABASE_URL || 'unknown'}\n\n` +
      `This script can only be run against DEVELOPMENT database.\n` +
      `To protect production data, all write operations are blocked.`
    );
  }
}

/**
 * Validate we're targeting the correct database
 */
export function validateTargetDatabase(expectedEnv) {
  const current = getEnvironmentLabel();
  if (current !== expectedEnv) {
    throw new Error(
      `❌ DATABASE MISMATCH!\n\n` +
      `Expected: ${expectedEnv}\n` +
      `Actual: ${current}\n` +
      `Database URL: ${process.env.SUPABASE_URL || 'unknown'}\n\n` +
      `Please check your .env configuration.`
    );
  }
  console.log(`✓ Validated database environment: ${current}`);
}

export default {
  isProduction,
  isDevelopment,
  getEnvironmentLabel,
  requireConfirmation,
  blockProductionWrites,
  validateTargetDatabase
};
