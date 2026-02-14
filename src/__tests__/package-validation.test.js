/**
 * Package.json Validation Tests
 * 
 * Ensures frontend package.json doesn't include backend-specific dependencies
 */

import { describe, it, expect } from 'vitest';
import packageJson from '../../package.json';

describe('package.json validation', () => {
  describe('backend dependencies should not be in frontend', () => {
    const backendOnlyPackages = [
      'bull',           // Redis queue manager
      'pg',             // PostgreSQL driver
      'postgres',       // PostgreSQL client
      // NOTE: dotenv is intentionally allowed in root devDeps — used by Playwright, scripts, orchestra
      'express',        // Web server framework
      'cors',           // CORS middleware
      'helmet',         // Security middleware
      'morgan',         // HTTP logger
      'compression',    // Compression middleware
      'cookie-parser',  // Cookie parsing
      'multer',         // File upload
      'nodemailer',     // Email sending
      'redis',          // Redis client
      'puppeteer',      // Browser automation
      'jsonwebtoken',   // JWT library (backend only)
    ];

    backendOnlyPackages.forEach(pkg => {
      it(`should not include ${pkg} in dependencies`, () => {
        expect(packageJson.dependencies).not.toHaveProperty(pkg);
      });

      it(`should not include ${pkg} in devDependencies`, () => {
        expect(packageJson.devDependencies).not.toHaveProperty(pkg);
      });
    });
  });

  describe('frontend dependencies should be present', () => {
    const requiredFrontendPackages = [
      'react',
      'react-dom',
      'vite',
      '@supabase/supabase-js',
    ];

    requiredFrontendPackages.forEach(pkg => {
      it(`should include ${pkg}`, () => {
        const hasDep = packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg];
        expect(hasDep).toBeTruthy();
      });
    });
  });

  it('should have a reasonable number of dependencies', () => {
    const depCount = Object.keys(packageJson.dependencies || {}).length;
    expect(depCount).toBeLessThan(70); // Alert if we exceed 70 deps
  });
});
