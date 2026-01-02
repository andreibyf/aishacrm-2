#!/usr/bin/env node

/**
 * Test Alignment Report Script
 * Analyzes codebase to generate comprehensive test coverage and alignment reports
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ANSI color codes for console output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Configuration
const CONFIG = {
  sourcePatterns: [
    'src/**/*.{js,jsx,ts,tsx}',
    'backend/routes/**/*.js',
    'backend/routes/*.js', // Also match files directly in routes/
    'backend/lib/**/*.js',
    'backend/modules/**/*.js',
  ],
  testPatterns: [
    'src/**/*.test.{js,jsx,ts,tsx}',
    'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    'backend/__tests__/**/*.js',
    'tests/**/*.spec.{js,ts}',
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.config.js',
    '**/*.config.ts',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/.vite/**',
  ],
  outdatedThresholdDays: 30,
  highPriorityPaths: [
    'backend/routes',
    'src/api',
    'backend/lib',
    'src/components',
  ],
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    format: 'console',
    onlyGaps: false,
    onlyOrphaned: false,
    onlyOutdated: false,
    minPriority: null,
    ci: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--format':
        options.format = args[++i];
        break;
      case '--only-gaps':
        options.onlyGaps = true;
        break;
      case '--only-orphaned':
        options.onlyOrphaned = true;
        break;
      case '--only-outdated':
        options.onlyOutdated = true;
        break;
      case '--min-priority':
        options.minPriority = args[++i];
        break;
      case '--ci':
        options.ci = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Test Alignment Report Script

Usage: node scripts/test-alignment-report.js [options]

Options:
  --format <type>       Output format: console, json, markdown (default: console)
  --only-gaps           Show only coverage gaps
  --only-orphaned       Show only orphaned tests
  --only-outdated       Show only outdated tests
  --min-priority <pri>  Filter by priority: high, medium, low
  --ci                  CI mode: exit 1 if critical issues found
  --verbose             Show detailed analysis
  --help                Show this help message

Examples:
  node scripts/test-alignment-report.js
  node scripts/test-alignment-report.js --format json > report.json
  node scripts/test-alignment-report.js --format markdown > TEST_ALIGNMENT.md
  node scripts/test-alignment-report.js --only-gaps --min-priority high
  node scripts/test-alignment-report.js --ci
  `);
}

/**
 * Recursively scan directory for files matching patterns
 */
async function scanDirectory(dir, patterns, exclude) {
  const results = [];
  
  async function scan(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(ROOT_DIR, fullPath);
        
        // Skip excluded paths (always skip node_modules)
        if (shouldExclude(relativePath, exclude) || relativePath.includes('node_modules')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          if (matchesPatterns(relativePath, patterns)) {
            results.push(relativePath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
      if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
        console.error(`Error scanning ${currentDir}:`, error.message);
      }
    }
  }
  
  await scan(dir);
  return results;
}

/**
 * Check if path should be excluded
 */
function shouldExclude(filePath, excludePatterns) {
  return excludePatterns.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
    return regex.test(filePath);
  });
}

/**
 * Check if file matches any of the patterns
 */
function matchesPatterns(filePath, patterns) {
  return patterns.some(pattern => {
    // Handle ** globstar - matches zero or more directory segments
    let regexPattern = pattern
      .replace(/\\/g, '/')  // Normalize path separators
      .replace(/\*\*\//g, '(?:.+/)?')  // **/ matches zero or more dirs
      .replace(/\/\*\*/g, '(?:/.+)?')  // /** matches optional path
      .replace(/\*/g, '[^/]*')  // * matches anything except /
      .replace(/\{([^}]+)\}/g, '($1)')  // {a,b} -> (a|b)
      .replace(/,/g, '|');  // Replace commas with |
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath.replace(/\\/g, '/'));
  });
}

/**
 * Find corresponding test file for a source file
 */
function findTestFile(sourceFile, testFiles) {
  const parsed = path.parse(sourceFile);
  const nameWithoutExt = parsed.name;
  const dir = parsed.dir;
  
  // Possible test file patterns
  const possibleTests = [
    // Co-located: src/components/Button.test.jsx
    path.join(dir, `${nameWithoutExt}.test.js`),
    path.join(dir, `${nameWithoutExt}.test.jsx`),
    path.join(dir, `${nameWithoutExt}.test.ts`),
    path.join(dir, `${nameWithoutExt}.test.tsx`),
    
    // __tests__ directory: src/components/__tests__/Button.test.jsx
    path.join(dir, '__tests__', `${nameWithoutExt}.test.js`),
    path.join(dir, '__tests__', `${nameWithoutExt}.test.jsx`),
    path.join(dir, '__tests__', `${nameWithoutExt}.test.ts`),
    path.join(dir, '__tests__', `${nameWithoutExt}.test.tsx`),
    
    // Backend pattern: backend/__tests__/routes/users.route.test.js
    sourceFile.includes('backend/routes/') 
      ? `backend/__tests__/routes/${nameWithoutExt}.route.test.js`
      : null,
      
    // Spec files: tests/e2e/example.spec.js
    path.join('tests', dir, `${nameWithoutExt}.spec.js`),
    path.join('tests', dir, `${nameWithoutExt}.spec.ts`),
  ].filter(Boolean);
  
  return testFiles.find(test => possibleTests.includes(test));
}

/**
 * Find source file for a test file
 */
function findSourceFile(testFile, sourceFiles) {
  // Skip if it's in node_modules
  if (testFile.includes('node_modules')) {
    return 'node_modules'; // Special marker to indicate it's valid (third-party)
  }
  
  const testPath = testFile
    .replace(/\.test\.(js|jsx|ts|tsx)$/, '.$1')
    .replace(/\.spec\.(js|ts)$/, '.$1')
    .replace('/__tests__/', '/');
  
  // For backend route tests: backend/__tests__/routes/users.route.test.js -> backend/routes/users.js
  if (testFile.includes('backend/__tests__/routes/')) {
    const routeName = path.basename(testFile)
      .replace('.route.test.js', '.js');
    const possibleSource = `backend/routes/${routeName}`;
    if (sourceFiles.includes(possibleSource)) {
      return possibleSource;
    }
  }
  
  // For backend lib tests: backend/__tests__/lib/tenantResolver.test.js -> backend/lib/tenantResolver.js
  if (testFile.includes('backend/__tests__/lib/')) {
    const libName = path.basename(testFile).replace('.test.js', '.js');
    const possibleSource = `backend/lib/${libName}`;
    if (sourceFiles.includes(possibleSource)) {
      return possibleSource;
    }
  }
  
  // For backend middleware tests: backend/__tests__/middleware/auth.test.js -> backend/middleware/auth.js
  if (testFile.includes('backend/__tests__/middleware/')) {
    const middlewareName = path.basename(testFile).replace('.test.js', '.js');
    const possibleSource = `backend/middleware/${middlewareName}`;
    if (sourceFiles.includes(possibleSource)) {
      return possibleSource;
    }
  }
  
  // For backend AI tests - map to specific source files
  if (testFile.includes('backend/__tests__/ai/')) {
    const testBaseName = path.basename(testFile, '.test.js');
    
    // aiTriggersWorker.test.js -> backend/lib/aiTriggersWorker.js
    if (testBaseName === 'aiTriggersWorker' && sourceFiles.includes('backend/lib/aiTriggersWorker.js')) {
      return 'backend/lib/aiTriggersWorker.js';
    }
    // tenantContextDictionary.test.js -> backend/lib/tenantContextDictionary.js
    if (testBaseName === 'tenantContextDictionary' && sourceFiles.includes('backend/lib/tenantContextDictionary.js')) {
      return 'backend/lib/tenantContextDictionary.js';
    }
    // suggestions.route.test.js -> backend/routes/suggestions.js
    if (testBaseName === 'suggestions.route' && sourceFiles.includes('backend/routes/suggestions.js')) {
      return 'backend/routes/suggestions.js';
    }
    // braidScenarios.test.js, braidToolExecution.test.js -> backend/lib/braidIntegration-v2.js
    if ((testBaseName === 'braidScenarios' || testBaseName === 'braidToolExecution') && 
        sourceFiles.includes('backend/lib/braidIntegration-v2.js')) {
      return 'backend/lib/braidIntegration-v2.js';
    }
    
    // Fall back to integration test for other AI tests
    return 'integration-test';
  }
  
  // For backend braid tests: backend/__tests__/braid/braid-syntax-validation.test.js -> backend/lib/braidIntegration-v2.js
  if (testFile.includes('backend/__tests__/braid/')) {
    if (sourceFiles.includes('backend/lib/braidIntegration-v2.js')) {
      return 'backend/lib/braidIntegration-v2.js';
    }
  }
  
  // For backend system tests
  if (testFile.includes('backend/__tests__/system/')) {
    // System tests test the whole system, not specific files
    return 'system-test';
  }
  
  // For backend auth tests
  if (testFile.includes('backend/__tests__/auth/')) {
    // Auth tests test auth routes and middleware
    if (sourceFiles.some(f => f.includes('backend/routes/auth.js'))) {
      return 'backend/routes/auth.js';
    }
    // Also check for auth middleware
    if (sourceFiles.some(f => f.includes('backend/middleware/authenticate.js'))) {
      return 'backend/middleware/authenticate.js';
    }
  }
  
  // For backend integration tests - map to specific source files
  if (testFile.includes('backend/__tests__/integration/')) {
    const testBaseName = path.basename(testFile, '.test.js');
    
    // mcp.test.js -> backend/routes/mcp.js
    if (testBaseName === 'mcp' && sourceFiles.includes('backend/routes/mcp.js')) {
      return 'backend/routes/mcp.js';
    }
    
    // Fall back to integration test for others
    return 'integration-test';
  }
  
  // For backend goalRouter.test.js -> backend/middleware/routerGuard.js
  if (testFile === 'backend/__tests__/goalRouter.test.js' && 
      sourceFiles.includes('backend/middleware/routerGuard.js')) {
    return 'backend/middleware/routerGuard.js';
  }
  
  // For backend validation tests
  if (testFile.includes('backend/__tests__/validation/')) {
    // Validation tests test validation modules
    return 'validation-test';
  }
  
  // For backend phase3 tests (feature tests)
  if (testFile.includes('backend/__tests__/phase3/')) {
    return 'feature-test';
  }
  
  // For backend schema tests
  if (testFile.includes('backend/__tests__/schema/')) {
    return 'schema-test';
  }
  
  // For E2E tests in tests/e2e/ - these test the whole app
  if (testFile.includes('tests/e2e/')) {
    return 'e2e-test';
  }
  
  // For component tests
  if (testFile.includes('tests/components/')) {
    const componentName = path.basename(testFile).replace('.spec.jsx', '.jsx');
    const possibleSource = `src/components/${componentName}`;
    if (sourceFiles.some(f => f.endsWith(`/${componentName}`) || f === possibleSource)) {
      return possibleSource;
    }
  }
  
  // Direct mapping
  if (sourceFiles.includes(testPath)) {
    return testPath;
  }
  
  // Check if it's a file-specific test in src/
  if (testFile.startsWith('src/') && testFile.includes('/__tests__/')) {
    const possibleSource = testFile.replace('/__tests__/', '/').replace(/\.test\.(js|jsx|ts|tsx)$/, '.$1');
    if (sourceFiles.includes(possibleSource)) {
      return possibleSource;
    }
  }
  
  return null;
}

/**
 * Get file priority based on path
 */
function getFilePriority(filePath) {
  for (const priorityPath of CONFIG.highPriorityPaths) {
    if (filePath.startsWith(priorityPath)) {
      return 'high';
    }
  }
  
  // Config files are low priority
  if (filePath.includes('.config.') || filePath.includes('vite.config')) {
    return 'low';
  }
  
  return 'medium';
}

/**
 * Get file stats including last modified date
 */
async function getFileStats(filePath) {
  try {
    const fullPath = path.join(ROOT_DIR, filePath);
    const stats = await fs.stat(fullPath);
    return {
      lastModified: stats.mtime,
      size: stats.size,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate days difference between two dates
 */
function daysBetween(date1, date2) {
  const diffTime = Math.abs(date2 - date1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Read file content
 */
async function readFile(filePath) {
  try {
    const fullPath = path.join(ROOT_DIR, filePath);
    return await fs.readFile(fullPath, 'utf-8');
  } catch (error) {
    return null;
  }
}

/**
 * Check if test file has assertions
 */
function hasAssertions(content) {
  const assertionPatterns = [
    /expect\(/,
    /assert\./,
    /assert\(/,
    /should\./,
    /\.toBe\(/,
    /\.toEqual\(/,
    /\.toContain\(/,
    /\.toMatch\(/,
    /\.toHaveBeenCalled/,
  ];
  
  return assertionPatterns.some(pattern => pattern.test(content));
}

/**
 * Find tests without assertions
 */
function findTestsWithoutAssertions(content, filePath) {
  const issues = [];
  const lines = content.split('\n');
  
  // Find test blocks
  const testBlockRegex = /(test|it)\s*\(['"`]([^'"`]+)['"`]/g;
  let match;
  
  while ((match = testBlockRegex.exec(content)) !== null) {
    const testName = match[2];
    const startIndex = match.index;
    const lineNumber = content.substring(0, startIndex).split('\n').length;
    
    // Extract test block (simplified - looks for next test or describe)
    const afterTest = content.substring(startIndex);
    const nextTestMatch = afterTest.substring(10).search(/(test|it|describe)\s*\(/);
    const testBlock = nextTestMatch > 0 
      ? afterTest.substring(0, nextTestMatch + 10)
      : afterTest.substring(0, 500); // Limit to 500 chars
    
    // Check for assertions in this block
    if (!hasAssertions(testBlock)) {
      // Check if it's a skip or todo
      const isSkipped = /\.(skip|todo)\s*\(/.test(testBlock);
      
      issues.push({
        testFile: filePath,
        testName,
        line: lineNumber,
        reason: isSkipped ? 'Skipped test' : 'No assertions found',
      });
    }
  }
  
  return issues;
}

/**
 * Extract imports from file
 */
function extractImports(content) {
  const imports = [];
  
  // ESM imports: import X from 'Y'
  const esmRegex = /import\s+(?:.+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = esmRegex.exec(content)) !== null) {
    imports.push({ path: match[1], line: content.substring(0, match.index).split('\n').length });
  }
  
  // CommonJS requires: require('X')
  const cjsRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    imports.push({ path: match[1], line: content.substring(0, match.index).split('\n').length });
  }
  
  return imports;
}

/**
 * Check if import path is broken
 */
async function checkImport(importPath, fromFile) {
  // Skip external modules
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }
  
  const fromDir = path.dirname(path.join(ROOT_DIR, fromFile));
  let resolvedPath = path.resolve(fromDir, importPath);
  
  // Try with common extensions
  const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
  
  for (const ext of extensions) {
    const testPath = resolvedPath + ext;
    try {
      await fs.access(testPath);
      return null; // File exists
    } catch {
      continue;
    }
  }
  
  return `Module not found: ${importPath}`;
}

/**
 * Analyze coverage gaps
 */
async function analyzeCoverageGaps(sourceFiles, testFiles, options) {
  const gaps = [];
  
  for (const sourceFile of sourceFiles) {
    // Skip test files themselves
    if (sourceFile.includes('.test.') || sourceFile.includes('.spec.') || sourceFile.includes('__tests__')) {
      continue;
    }
    
    const testFile = findTestFile(sourceFile, testFiles);
    if (!testFile) {
      const stats = await getFileStats(sourceFile);
      const priority = getFilePriority(sourceFile);
      
      // Apply priority filter
      if (options.minPriority === 'high' && priority !== 'high') {
        continue;
      }
      
      gaps.push({
        file: sourceFile,
        path: sourceFile,
        type: getFileType(sourceFile),
        priority,
        lastModified: stats?.lastModified?.toISOString().split('T')[0],
        suggestedTestPath: getSuggestedTestPath(sourceFile),
      });
    }
  }
  
  return gaps;
}

/**
 * Get file type based on path
 */
function getFileType(filePath) {
  if (filePath.includes('/routes/')) return 'route';
  if (filePath.includes('/components/')) return 'component';
  if (filePath.includes('/lib/')) return 'library';
  if (filePath.includes('/api/')) return 'api';
  if (filePath.includes('/hooks/')) return 'hook';
  if (filePath.includes('/utils/')) return 'utility';
  return 'other';
}

/**
 * Get suggested test path for a source file
 */
function getSuggestedTestPath(sourceFile) {
  const parsed = path.parse(sourceFile);
  
  if (sourceFile.includes('backend/routes/')) {
    return `backend/__tests__/routes/${parsed.name}.route.test.js`;
  }
  
  if (sourceFile.includes('src/')) {
    return path.join(parsed.dir, '__tests__', `${parsed.name}.test${parsed.ext}`);
  }
  
  return path.join(parsed.dir, `${parsed.name}.test${parsed.ext}`);
}

/**
 * Analyze orphaned tests
 */
async function analyzeOrphanedTests(sourceFiles, testFiles) {
  const orphaned = [];
  
  for (const testFile of testFiles) {
    const sourceFile = findSourceFile(testFile, sourceFiles);
    
    // Skip if it's a valid test type (integration, e2e, etc.)
    const validTestMarkers = [
      'node_modules',
      'integration-test',
      'e2e-test',
      'system-test',
      'validation-test',
      'feature-test',
      'schema-test',
    ];
    
    if (!sourceFile || !validTestMarkers.includes(sourceFile)) {
      // Only report as orphaned if we couldn't find a source file
      if (!sourceFile) {
        orphaned.push({
          testFile,
          missingSource: testFile
            .replace(/\.test\.(js|jsx|ts|tsx)$/, '.$1')
            .replace(/\.spec\.(js|ts)$/, '.$1')
            .replace('/__tests__/', '/')
            .replace('backend/__tests__/routes/', 'backend/routes/')
            .replace('.route.test.js', '.js'),
          reason: 'Source file not found',
        });
      }
    }
  }
  
  return orphaned;
}

/**
 * Analyze outdated tests
 */
async function analyzeOutdatedTests(sourceFiles, testFiles) {
  const outdated = [];
  
  for (const testFile of testFiles) {
    const sourceFile = findSourceFile(testFile, sourceFiles);
    if (sourceFile) {
      const testStats = await getFileStats(testFile);
      const sourceStats = await getFileStats(sourceFile);
      
      if (testStats && sourceStats) {
        const daysDiff = daysBetween(testStats.lastModified, sourceStats.lastModified);
        
        if (daysDiff > CONFIG.outdatedThresholdDays && sourceStats.lastModified > testStats.lastModified) {
          outdated.push({
            testFile,
            sourceFile,
            testLastModified: testStats.lastModified.toISOString().split('T')[0],
            sourceLastModified: sourceStats.lastModified.toISOString().split('T')[0],
            daysBehind: daysDiff,
          });
        }
      }
    }
  }
  
  return outdated.sort((a, b) => b.daysBehind - a.daysBehind);
}

/**
 * Analyze missing assertions
 */
async function analyzeMissingAssertions(testFiles) {
  const missing = [];
  
  for (const testFile of testFiles) {
    const content = await readFile(testFile);
    if (content) {
      const issues = findTestsWithoutAssertions(content, testFile);
      missing.push(...issues);
    }
  }
  
  return missing;
}

/**
 * Analyze broken dependencies
 */
async function analyzeBrokenDependencies(testFiles) {
  const broken = [];
  
  for (const testFile of testFiles) {
    const content = await readFile(testFile);
    if (content) {
      const imports = extractImports(content);
      
      for (const imp of imports) {
        const error = await checkImport(imp.path, testFile);
        if (error) {
          broken.push({
            testFile,
            line: imp.line,
            import: imp.path,
            error,
          });
        }
      }
    }
  }
  
  return broken;
}

/**
 * Generate JSON report
 */
function generateJsonReport(results) {
  return JSON.stringify(results, null, 2);
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(results) {
  const { summary, coverageGaps, orphanedTests, outdatedTests, missingAssertions, brokenDependencies } = results;
  
  let md = `# Test Alignment Report\n\n`;
  md += `**Generated:** ${results.timestamp}\n\n`;
  
  // Summary table
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Source Files | ${summary.totalSourceFiles} |\n`;
  md += `| Total Test Files | ${summary.totalTestFiles} |\n`;
  md += `| Coverage | ${summary.coveragePercentage}% |\n`;
  md += `| Orphaned Tests | ${summary.orphanedTests} |\n`;
  md += `| Outdated Tests | ${summary.outdatedTests} |\n`;
  md += `| Missing Assertions | ${summary.missingAssertions} |\n`;
  md += `| Broken Dependencies | ${summary.brokenDependencies} |\n\n`;
  
  // Coverage gaps by priority
  if (coverageGaps.length > 0) {
    const highPriority = coverageGaps.filter(g => g.priority === 'high');
    const mediumPriority = coverageGaps.filter(g => g.priority === 'medium');
    
    md += `## Coverage Gaps\n\n`;
    
    if (highPriority.length > 0) {
      md += `### High Priority\n\n`;
      highPriority.forEach(gap => {
        md += `- ❌ \`${gap.file}\` (${gap.type}) - No test file\n`;
      });
      md += `\n`;
    }
    
    if (mediumPriority.length > 0 && mediumPriority.length <= 20) {
      md += `### Medium Priority\n\n`;
      mediumPriority.slice(0, 20).forEach(gap => {
        md += `- ⚠️  \`${gap.file}\` (${gap.type}) - No test file\n`;
      });
      if (mediumPriority.length > 20) {
        md += `\n_...and ${mediumPriority.length - 20} more_\n`;
      }
      md += `\n`;
    }
  }
  
  // Outdated tests
  if (outdatedTests.length > 0) {
    md += `## Outdated Tests (>30 days behind)\n\n`;
    outdatedTests.slice(0, 20).forEach(test => {
      md += `- ⏰ \`${test.testFile}\` - ${test.daysBehind} days behind \`${test.sourceFile}\`\n`;
    });
    if (outdatedTests.length > 20) {
      md += `\n_...and ${outdatedTests.length - 20} more_\n`;
    }
    md += `\n`;
  }
  
  // Orphaned tests
  if (orphanedTests.length > 0) {
    md += `## Orphaned Tests\n\n`;
    orphanedTests.forEach(test => {
      md += `- 🗑️  \`${test.testFile}\` - Source \`${test.missingSource}\` not found\n`;
    });
    md += `\n`;
  }
  
  // Missing assertions
  if (missingAssertions.length > 0) {
    md += `## Tests Without Assertions\n\n`;
    missingAssertions.forEach(test => {
      md += `- ⚠️  \`${test.testFile}\`:${test.line} - "${test.testName}" (${test.reason})\n`;
    });
    md += `\n`;
  }
  
  // Broken dependencies
  if (brokenDependencies.length > 0) {
    md += `## Broken Dependencies\n\n`;
    brokenDependencies.forEach(dep => {
      md += `- ❌ \`${dep.testFile}\`:${dep.line} - \`${dep.import}\` (${dep.error})\n`;
    });
    md += `\n`;
  }
  
  // Recommendations
  md += `## Recommendations\n\n`;
  const highPriorityGaps = coverageGaps.filter(g => g.priority === 'high').length;
  if (highPriorityGaps > 0) {
    md += `1. Add tests for ${highPriorityGaps} high-priority files\n`;
  }
  if (outdatedTests.length > 0) {
    md += `${highPriorityGaps > 0 ? '2' : '1'}. Update ${outdatedTests.length} outdated test files\n`;
  }
  if (orphanedTests.length > 0) {
    md += `${highPriorityGaps > 0 || outdatedTests.length > 0 ? '3' : '1'}. Remove or fix ${orphanedTests.length} orphaned tests\n`;
  }
  if (brokenDependencies.length > 0) {
    md += `${highPriorityGaps > 0 || outdatedTests.length > 0 || orphanedTests.length > 0 ? '4' : '1'}. Fix ${brokenDependencies.length} broken import statements\n`;
  }
  
  return md;
}

/**
 * Generate console report
 */
function generateConsoleReport(results, options) {
  const { summary, coverageGaps, orphanedTests, outdatedTests, missingAssertions, brokenDependencies } = results;
  const c = COLORS;
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`${c.bright}  Test Alignment Report${c.reset}`);
  console.log(`${'═'.repeat(50)}\n`);
  
  // Summary
  console.log(`${c.bright}📊 Summary:${c.reset}`);
  console.log(`  Coverage:           ${summary.coveragePercentage >= 50 ? c.green : c.yellow}${summary.coveragePercentage}%${c.reset} (${summary.totalTestFiles}/${summary.totalSourceFiles} files)`);
  console.log(`  Orphaned Tests:     ${orphanedTests.length > 0 ? c.yellow : c.green}${summary.orphanedTests}${c.reset}`);
  console.log(`  Outdated Tests:     ${outdatedTests.length > 0 ? c.yellow : c.green}${summary.outdatedTests}${c.reset}`);
  console.log(`  Missing Assertions: ${missingAssertions.length > 0 ? c.yellow : c.green}${summary.missingAssertions}${c.reset}`);
  console.log(`  Broken Dependencies: ${brokenDependencies.length > 0 ? c.red : c.green}${summary.brokenDependencies}${c.reset}`);
  console.log();
  
  // Coverage gaps (high priority)
  const highPriorityGaps = coverageGaps.filter(g => g.priority === 'high');
  if (highPriorityGaps.length > 0) {
    console.log(`${c.red}❌ Coverage Gaps (High Priority):${c.reset}`);
    const limit = options.verbose ? highPriorityGaps.length : Math.min(10, highPriorityGaps.length);
    highPriorityGaps.slice(0, limit).forEach(gap => {
      console.log(`  ${c.dim}•${c.reset} ${gap.file} ${c.dim}(${gap.type})${c.reset}`);
    });
    if (!options.verbose && highPriorityGaps.length > limit) {
      console.log(`  ${c.dim}...and ${highPriorityGaps.length - limit} more${c.reset}`);
    }
    console.log();
  }
  
  // Outdated tests
  if (outdatedTests.length > 0) {
    console.log(`${c.yellow}⚠️  Outdated Tests (>30 days behind):${c.reset}`);
    const limit = options.verbose ? outdatedTests.length : Math.min(10, outdatedTests.length);
    outdatedTests.slice(0, limit).forEach(test => {
      console.log(`  ${c.dim}•${c.reset} ${test.testFile} ${c.dim}(${test.daysBehind} days behind)${c.reset}`);
    });
    if (!options.verbose && outdatedTests.length > limit) {
      console.log(`  ${c.dim}...and ${outdatedTests.length - limit} more${c.reset}`);
    }
    console.log();
  }
  
  // Orphaned tests
  if (orphanedTests.length > 0) {
    console.log(`${c.yellow}🗑️  Orphaned Tests:${c.reset}`);
    orphanedTests.forEach(test => {
      console.log(`  ${c.dim}•${c.reset} ${test.testFile} ${c.dim}(source deleted)${c.reset}`);
    });
    console.log();
  }
  
  // Missing assertions
  if (missingAssertions.length > 0 && options.verbose) {
    console.log(`${c.yellow}⚠️  Tests Without Assertions:${c.reset}`);
    missingAssertions.slice(0, 10).forEach(test => {
      console.log(`  ${c.dim}•${c.reset} ${test.testFile}:${test.line} - "${test.testName}"`);
    });
    if (missingAssertions.length > 10) {
      console.log(`  ${c.dim}...and ${missingAssertions.length - 10} more${c.reset}`);
    }
    console.log();
  }
  
  // Broken dependencies
  if (brokenDependencies.length > 0) {
    console.log(`${c.red}💥 Broken Dependencies:${c.reset}`);
    brokenDependencies.forEach(dep => {
      console.log(`  ${c.dim}•${c.reset} ${dep.testFile}:${dep.line} - ${c.red}${dep.import}${c.reset}`);
    });
    console.log();
  }
  
  // Recommendations
  console.log(`${c.bright}💡 Recommendations:${c.reset}`);
  let recNum = 1;
  if (highPriorityGaps.length > 0) {
    console.log(`  ${recNum++}. Add tests for ${c.bright}${highPriorityGaps.length}${c.reset} high-priority files`);
  }
  if (outdatedTests.length > 0) {
    console.log(`  ${recNum++}. Update ${c.bright}${outdatedTests.length}${c.reset} outdated test files`);
  }
  if (orphanedTests.length > 0) {
    console.log(`  ${recNum++}. Remove ${c.bright}${orphanedTests.length}${c.reset} orphaned tests`);
  }
  if (brokenDependencies.length > 0) {
    console.log(`  ${recNum++}. Fix ${c.bright}${brokenDependencies.length}${c.reset} broken import statements`);
  }
  if (missingAssertions.length > 0 && options.verbose) {
    console.log(`  ${recNum++}. Add assertions to ${c.bright}${missingAssertions.length}${c.reset} tests`);
  }
  console.log();
  
  if (!options.verbose) {
    console.log(`${c.dim}Run with --verbose for detailed file-by-file analysis${c.reset}\n`);
  }
}

/**
 * Main analysis function
 */
async function analyze(options) {
  const startTime = Date.now();
  
  if (options.format === 'console') {
    console.log(`${COLORS.cyan}🔍 Scanning codebase for test alignment issues...${COLORS.reset}\n`);
  }
  
  // Scan for source files
  const sourceFiles = await scanDirectory(ROOT_DIR, CONFIG.sourcePatterns, CONFIG.excludePatterns);
  if (options.format === 'console') {
    console.log(`${COLORS.green}✓${COLORS.reset} Scanned ${sourceFiles.length} source files`);
  }
  
  // Scan for test files
  const testFiles = await scanDirectory(ROOT_DIR, CONFIG.testPatterns, CONFIG.excludePatterns);
  if (options.format === 'console') {
    console.log(`${COLORS.green}✓${COLORS.reset} Scanned ${testFiles.length} test files`);
  }
  
  // Run analyses based on options
  let coverageGaps = [];
  let orphanedTests = [];
  let outdatedTests = [];
  let missingAssertions = [];
  let brokenDependencies = [];
  
  if (!options.onlyOrphaned && !options.onlyOutdated) {
    coverageGaps = await analyzeCoverageGaps(sourceFiles, testFiles, options);
  }
  
  if (!options.onlyGaps && !options.onlyOutdated) {
    orphanedTests = await analyzeOrphanedTests(sourceFiles, testFiles);
  }
  
  if (!options.onlyGaps && !options.onlyOrphaned) {
    outdatedTests = await analyzeOutdatedTests(sourceFiles, testFiles);
  }
  
  if (!options.onlyGaps && !options.onlyOrphaned && !options.onlyOutdated) {
    missingAssertions = await analyzeMissingAssertions(testFiles);
    brokenDependencies = await analyzeBrokenDependencies(testFiles);
  }
  
  if (options.format === 'console') {
    console.log(`${COLORS.green}✓${COLORS.reset} Analyzed imports and dependencies\n`);
  }
  
  // Calculate coverage percentage
  const filesWithTests = sourceFiles.filter(sf => {
    if (sf.includes('.test.') || sf.includes('.spec.') || sf.includes('__tests__')) {
      return false;
    }
    return findTestFile(sf, testFiles) !== undefined;
  }).length;
  
  const totalSourceFilesExcludingTests = sourceFiles.filter(sf => 
    !sf.includes('.test.') && !sf.includes('.spec.') && !sf.includes('__tests__')
  ).length;
  
  const coveragePercentage = totalSourceFilesExcludingTests > 0
    ? Math.round((filesWithTests / totalSourceFilesExcludingTests) * 100)
    : 0;
  
  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      totalSourceFiles: totalSourceFilesExcludingTests,
      totalTestFiles: testFiles.length,
      coveragePercentage,
      orphanedTests: orphanedTests.length,
      outdatedTests: outdatedTests.length,
      missingAssertions: missingAssertions.length,
      brokenDependencies: brokenDependencies.length,
    },
    coverageGaps: coverageGaps.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    orphanedTests,
    outdatedTests,
    missingAssertions,
    brokenDependencies,
  };
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (options.format === 'console' && options.verbose) {
    console.log(`${COLORS.dim}Analysis completed in ${duration}s${COLORS.reset}\n`);
  }
  
  return results;
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();
  
  try {
    const results = await analyze(options);
    
    // Generate output based on format
    switch (options.format) {
      case 'json':
        console.log(generateJsonReport(results));
        break;
      case 'markdown':
        console.log(generateMarkdownReport(results));
        break;
      case 'console':
      default:
        generateConsoleReport(results, options);
        break;
    }
    
    // CI mode: exit with error if critical issues found
    if (options.ci) {
      const highPriorityGaps = results.coverageGaps.filter(g => g.priority === 'high').length;
      const criticalIssues = highPriorityGaps + results.brokenDependencies.length;
      
      if (criticalIssues > 0) {
        console.error(`\n${COLORS.red}CI check failed: ${criticalIssues} critical issues found${COLORS.reset}`);
        process.exit(1);
      } else {
        console.log(`\n${COLORS.green}✓ CI check passed${COLORS.reset}`);
        process.exit(0);
      }
    }
    
  } catch (error) {
    console.error(`${COLORS.red}Error:${COLORS.reset}`, error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { analyze, parseArgs };
