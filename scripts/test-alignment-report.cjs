#!/usr/bin/env node

/**
 * Test Alignment Report Script
 * 
 * Analyzes test coverage and alignment across the repository.
 * Generates reports in JSON and Markdown formats.
 * 
 * Usage:
 *   node scripts/test-alignment-report.js --format json
 *   node scripts/test-alignment-report.js --format markdown
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const formatIndex = args.indexOf('--format');
const format = formatIndex !== -1 ? args[formatIndex + 1] : 'json';

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIRS = [
  'src',
  'backend',
];
const TEST_PATTERNS = [
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.js',
  '**/*.spec.ts',
];
const OUTDATED_THRESHOLD_DAYS = 30;

/**
 * Find all source files (non-test files)
 */
function findSourceFiles() {
  const files = [];
  
  SOURCE_DIRS.forEach((dir) => {
    const fullPath = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(fullPath)) return;
    
    function walk(dirPath) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullEntryPath = path.join(dirPath, entry.name);
        
        // Skip node_modules, dist, coverage, etc.
        if (entry.name === 'node_modules' || entry.name === 'dist' || 
            entry.name === 'coverage' || entry.name === '__tests__' ||
            entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          walk(fullEntryPath);
        } else if (entry.isFile()) {
          // Only include JS/JSX/TS/TSX files
          if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            files.push(fullEntryPath);
          }
        }
      }
    }
    
    walk(fullPath);
  });
  
  return files;
}

/**
 * Find all test files
 */
function findTestFiles() {
  const files = [];
  
  function walk(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Skip node_modules, dist, etc.
      if (entry.name === 'node_modules' || entry.name === 'dist' || 
          entry.name === 'coverage' || entry.name.startsWith('.')) {
        continue;
      }
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walk(ROOT_DIR);
  return files;
}

/**
 * Get file modification time
 */
function getFileModTime(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch (error) {
    return null;
  }
}

/**
 * Find corresponding test file for a source file
 */
function findTestForSource(sourceFile) {
  const relativePath = path.relative(ROOT_DIR, sourceFile);
  const dir = path.dirname(sourceFile);
  const basename = path.basename(sourceFile);
  const nameWithoutExt = basename.replace(/\.(js|jsx|ts|tsx)$/, '');
  
  // Possible test file patterns
  const testPatterns = [
    path.join(dir, `${nameWithoutExt}.test.js`),
    path.join(dir, `${nameWithoutExt}.test.jsx`),
    path.join(dir, `${nameWithoutExt}.test.ts`),
    path.join(dir, `${nameWithoutExt}.test.tsx`),
    path.join(dir, '__tests__', `${nameWithoutExt}.test.js`),
    path.join(dir, '__tests__', `${nameWithoutExt}.test.jsx`),
    path.join(dir, '__tests__', `${nameWithoutExt}.test.ts`),
    path.join(dir, '__tests__', `${nameWithoutExt}.test.tsx`),
  ];
  
  for (const testPath of testPatterns) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }
  
  return null;
}

/**
 * Find corresponding source file for a test file
 */
function findSourceForTest(testFile) {
  const relativePath = path.relative(ROOT_DIR, testFile);
  const basename = path.basename(testFile);
  const nameWithoutExt = basename.replace(/\.(test|spec)\.(js|jsx|ts|tsx)$/, '');
  const dir = path.dirname(testFile);
  
  // For backend route tests: backend/__tests__/routes/users.route.test.js -> backend/routes/users.js
  if (relativePath.includes('backend/__tests__/routes/')) {
    const routeName = basename.replace('.route.test.js', '.js');
    const possibleSource = path.join(ROOT_DIR, 'backend', 'routes', routeName);
    if (fs.existsSync(possibleSource)) {
      return possibleSource;
    }
  }
  
  // For backend lib tests: backend/__tests__/lib/tenantResolver.test.js -> backend/lib/tenantResolver.js
  if (relativePath.includes('backend/__tests__/lib/')) {
    const libName = basename.replace('.test.js', '.js');
    const possibleSource = path.join(ROOT_DIR, 'backend', 'lib', libName);
    if (fs.existsSync(possibleSource)) {
      return possibleSource;
    }
  }
  
  // For backend middleware tests
  if (relativePath.includes('backend/__tests__/middleware/')) {
    const middlewareName = basename.replace('.test.js', '.js');
    const possibleSource = path.join(ROOT_DIR, 'backend', 'middleware', middlewareName);
    if (fs.existsSync(possibleSource)) {
      return possibleSource;
    }
  }
  
  // For backend AI tests - map to specific source files
  if (relativePath.includes('backend/__tests__/ai/')) {
    const testBaseName = basename.replace('.test.js', '');
    
    // aiTriggersWorker.test.js -> backend/lib/aiTriggersWorker.js
    if (testBaseName === 'aiTriggersWorker') {
      const source = path.join(ROOT_DIR, 'backend', 'lib', 'aiTriggersWorker.js');
      if (fs.existsSync(source)) return source;
    }
    // tenantContextDictionary.test.js -> backend/lib/tenantContextDictionary.js
    if (testBaseName === 'tenantContextDictionary') {
      const source = path.join(ROOT_DIR, 'backend', 'lib', 'tenantContextDictionary.js');
      if (fs.existsSync(source)) return source;
    }
    // suggestions.route.test.js -> backend/routes/suggestions.js
    if (testBaseName === 'suggestions.route') {
      const source = path.join(ROOT_DIR, 'backend', 'routes', 'suggestions.js');
      if (fs.existsSync(source)) return source;
    }
    // braidScenarios.test.js, braidToolExecution.test.js -> backend/lib/braidIntegration-v2.js
    if (testBaseName === 'braidScenarios' || testBaseName === 'braidToolExecution') {
      const source = path.join(ROOT_DIR, 'backend', 'lib', 'braidIntegration-v2.js');
      if (fs.existsSync(source)) return source;
    }
    
    // These are integration tests
    return 'integration-test';
  }
  
  // For backend braid tests
  if (relativePath.includes('backend/__tests__/braid/')) {
    const source = path.join(ROOT_DIR, 'backend', 'lib', 'braidIntegration-v2.js');
    if (fs.existsSync(source)) return source;
  }
  
  // For backend auth tests
  if (relativePath.includes('backend/__tests__/auth/')) {
    const authRoute = path.join(ROOT_DIR, 'backend', 'routes', 'auth.js');
    if (fs.existsSync(authRoute)) return authRoute;
    const authMiddleware = path.join(ROOT_DIR, 'backend', 'middleware', 'authenticate.js');
    if (fs.existsSync(authMiddleware)) return authMiddleware;
  }
  
  // For backend integration tests
  if (relativePath.includes('backend/__tests__/integration/')) {
    const testBaseName = basename.replace('.test.js', '');
    
    // mcp.test.js -> backend/routes/mcp.js
    if (testBaseName === 'mcp') {
      const source = path.join(ROOT_DIR, 'backend', 'routes', 'mcp.js');
      if (fs.existsSync(source)) return source;
    }
    
    return 'integration-test';
  }
  
  // For backend goalRouter.test.js -> backend/middleware/routerGuard.js
  if (basename === 'goalRouter.test.js') {
    const source = path.join(ROOT_DIR, 'backend', 'middleware', 'routerGuard.js');
    if (fs.existsSync(source)) return source;
  }
  
  // For backend system tests (test the whole system)
  if (relativePath.includes('backend/__tests__/system/')) {
    return 'system-test';
  }
  
  // For backend validation tests
  if (relativePath.includes('backend/__tests__/validation/')) {
    return 'validation-test';
  }
  
  // For backend phase3 tests (feature tests)
  if (relativePath.includes('backend/__tests__/phase3/')) {
    return 'feature-test';
  }
  
  // For backend schema tests
  if (relativePath.includes('backend/__tests__/schema/')) {
    return 'schema-test';
  }
  
  // If test is in __tests__ directory, look in parent
  const searchDirs = dir.includes('__tests__') 
    ? [dir, path.join(dir, '..')] 
    : [dir];
  
  for (const searchDir of searchDirs) {
    const patterns = [
      path.join(searchDir, `${nameWithoutExt}.js`),
      path.join(searchDir, `${nameWithoutExt}.jsx`),
      path.join(searchDir, `${nameWithoutExt}.ts`),
      path.join(searchDir, `${nameWithoutExt}.tsx`),
    ];
    
    for (const sourcePath of patterns) {
      if (fs.existsSync(sourcePath)) {
        return sourcePath;
      }
    }
  }
  
  return null;
}

/**
 * Check if test file has assertions
 */
function hasAssertions(testFile) {
  try {
    const content = fs.readFileSync(testFile, 'utf8');
    // Look for common assertion patterns
    return /\b(expect|assert|should)\s*\(/.test(content);
  } catch (error) {
    return false;
  }
}

/**
 * Check for broken imports in test file
 */
function checkBrokenImports(testFile) {
  try {
    const content = fs.readFileSync(testFile, 'utf8');
    const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
    const broken = [];
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Skip node modules
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        continue;
      }
      
      // Resolve the import path
      const dir = path.dirname(testFile);
      let resolvedPath = path.resolve(dir, importPath);
      
      // Try adding extensions if not found
      if (!fs.existsSync(resolvedPath)) {
        const extensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
        let found = false;
        
        for (const ext of extensions) {
          if (fs.existsSync(resolvedPath + ext)) {
            found = true;
            break;
          }
        }
        
        if (!found) {
          broken.push(importPath);
        }
      }
    }
    
    return broken;
  } catch (error) {
    return [];
  }
}

/**
 * Analyze test alignment
 */
function analyzeTestAlignment() {
  const sourceFiles = findSourceFiles();
  const testFiles = findTestFiles();
  
  const coverageGaps = [];
  const orphanedTests = [];
  const outdatedTests = [];
  const missingAssertions = [];
  const brokenDependencies = [];
  
  // Check for coverage gaps
  sourceFiles.forEach((sourceFile) => {
    const testFile = findTestForSource(sourceFile);
    if (!testFile) {
      const relativePath = path.relative(ROOT_DIR, sourceFile);
      const modTime = getFileModTime(sourceFile);
      const daysSinceModified = modTime 
        ? Math.floor((Date.now() - modTime.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      
      coverageGaps.push({
        sourceFile: relativePath,
        reason: 'No test file found',
        lastModified: modTime ? modTime.toISOString() : null,
        daysSinceModified,
        priority: daysSinceModified !== null && daysSinceModified < 7 ? 'high' : 'medium',
      });
    }
  });
  
  // Check for orphaned tests and outdated tests
  testFiles.forEach((testFile) => {
    const sourceFile = findSourceForTest(testFile);
    const relativePath = path.relative(ROOT_DIR, testFile);
    
    if (!sourceFile) {
      orphanedTests.push({
        testFile: relativePath,
        reason: 'Source file not found',
      });
    } else {
      // Check if test is outdated
      const sourceModTime = getFileModTime(sourceFile);
      const testModTime = getFileModTime(testFile);
      
      if (sourceModTime && testModTime) {
        const daysBehind = Math.floor((sourceModTime.getTime() - testModTime.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysBehind > OUTDATED_THRESHOLD_DAYS) {
          outdatedTests.push({
            testFile: relativePath,
            sourceFile: path.relative(ROOT_DIR, sourceFile),
            daysBehind,
            lastTestModified: testModTime.toISOString(),
            lastSourceModified: sourceModTime.toISOString(),
          });
        }
      }
    }
    
    // Check for missing assertions
    if (!hasAssertions(testFile)) {
      missingAssertions.push({
        testFile: relativePath,
        reason: 'No expect() or assert() found',
      });
    }
    
    // Check for broken imports
    const broken = checkBrokenImports(testFile);
    if (broken.length > 0) {
      brokenDependencies.push({
        testFile: relativePath,
        brokenImports: broken,
      });
    }
  });
  
  // Calculate coverage percentage
  const totalSourceFiles = sourceFiles.length;
  const testedSourceFiles = totalSourceFiles - coverageGaps.length;
  const coveragePercentage = totalSourceFiles > 0 
    ? Math.round((testedSourceFiles / totalSourceFiles) * 100) 
    : 0;
  
  return {
    summary: {
      totalSourceFiles,
      testedSourceFiles,
      coveragePercentage,
      coverageGaps: coverageGaps.length,
      orphanedTests: orphanedTests.length,
      outdatedTests: outdatedTests.length,
      missingAssertions: missingAssertions.length,
      brokenDependencies: brokenDependencies.length,
    },
    details: {
      coverageGaps,
      orphanedTests,
      outdatedTests,
      missingAssertions,
      brokenDependencies,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate JSON report
 */
function generateJsonReport(analysis) {
  return JSON.stringify(analysis, null, 2);
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(analysis) {
  const { summary, details } = analysis;
  
  const lines = [];
  
  lines.push('# Test Alignment Report\n');
  lines.push(`**Generated:** ${new Date(analysis.generatedAt).toLocaleString()}\n`);
  
  // Summary table
  lines.push('## Summary\n');
  lines.push('| Metric | Count | Status |');
  lines.push('|--------|-------|--------|');
  lines.push(`| Total Source Files | ${summary.totalSourceFiles} | - |`);
  lines.push(`| Tested Source Files | ${summary.testedSourceFiles} | - |`);
  lines.push(`| Coverage | ${summary.coveragePercentage}% | ${summary.coveragePercentage >= 80 ? '✅ Good' : summary.coveragePercentage >= 60 ? '⚠️ Fair' : '❌ Poor'} |`);
  lines.push(`| Coverage Gaps | ${summary.coverageGaps} | ${summary.coverageGaps === 0 ? '✅' : '⚠️'} |`);
  lines.push(`| Orphaned Tests | ${summary.orphanedTests} | ${summary.orphanedTests === 0 ? '✅' : '⚠️'} |`);
  lines.push(`| Outdated Tests | ${summary.outdatedTests} | ${summary.outdatedTests === 0 ? '✅' : summary.outdatedTests > 10 ? '❌' : '⚠️'} |`);
  lines.push(`| Missing Assertions | ${summary.missingAssertions} | ${summary.missingAssertions === 0 ? '✅' : '⚠️'} |`);
  lines.push(`| Broken Dependencies | ${summary.brokenDependencies} | ${summary.brokenDependencies === 0 ? '✅' : '❌ Critical'} |`);
  lines.push('');
  
  // Coverage Gaps
  if (details.coverageGaps.length > 0) {
    lines.push('## Coverage Gaps\n');
    lines.push(`Found ${details.coverageGaps.length} source files without tests:\n`);
    
    // Group by priority
    const highPriority = details.coverageGaps.filter(g => g.priority === 'high');
    const mediumPriority = details.coverageGaps.filter(g => g.priority === 'medium');
    
    if (highPriority.length > 0) {
      lines.push('### High Priority (Recently Modified)\n');
      highPriority.slice(0, 10).forEach((gap) => {
        lines.push(`- ❌ \`${gap.sourceFile}\``);
        lines.push(`  - Last modified: ${gap.daysSinceModified} days ago`);
      });
      lines.push('');
    }
    
    if (mediumPriority.length > 0) {
      lines.push('### Medium Priority\n');
      mediumPriority.slice(0, 10).forEach((gap) => {
        lines.push(`- ⚠️ \`${gap.sourceFile}\``);
      });
      lines.push('');
    }
  }
  
  // Orphaned Tests
  if (details.orphanedTests.length > 0) {
    lines.push('## Orphaned Tests\n');
    lines.push(`Found ${details.orphanedTests.length} test files without corresponding source:\n`);
    details.orphanedTests.slice(0, 10).forEach((orphan) => {
      lines.push(`- 🗑️ \`${orphan.testFile}\``);
      lines.push(`  - Reason: ${orphan.reason}`);
    });
    lines.push('');
  }
  
  // Outdated Tests
  if (details.outdatedTests.length > 0) {
    lines.push('## Outdated Tests\n');
    lines.push(`Found ${details.outdatedTests.length} tests that haven't been updated recently:\n`);
    details.outdatedTests.slice(0, 10).forEach((outdated) => {
      lines.push(`- ⏰ \`${outdated.testFile}\``);
      lines.push(`  - Source: \`${outdated.sourceFile}\``);
      lines.push(`  - Gap: ${outdated.daysBehind} days behind source`);
    });
    lines.push('');
  }
  
  // Missing Assertions
  if (details.missingAssertions.length > 0) {
    lines.push('## Missing Assertions\n');
    lines.push(`Found ${details.missingAssertions.length} tests without assertions:\n`);
    details.missingAssertions.slice(0, 10).forEach((missing) => {
      lines.push(`- ❌ \`${missing.testFile}\``);
      lines.push(`  - Reason: ${missing.reason}`);
    });
    lines.push('');
  }
  
  // Broken Dependencies
  if (details.brokenDependencies.length > 0) {
    lines.push('## Broken Dependencies\n');
    lines.push(`Found ${details.brokenDependencies.length} tests with broken imports:\n`);
    details.brokenDependencies.slice(0, 10).forEach((broken) => {
      lines.push(`- 🔗 \`${broken.testFile}\``);
      lines.push(`  - Broken imports: ${broken.brokenImports.join(', ')}`);
    });
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Main execution
 */
function main() {
  try {
    const analysis = analyzeTestAlignment();
    
    if (format === 'json') {
      console.log(generateJsonReport(analysis));
    } else if (format === 'markdown') {
      console.log(generateMarkdownReport(analysis));
    } else {
      console.error(`Unknown format: ${format}`);
      console.error('Usage: node test-alignment-report.js --format [json|markdown]');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error generating test alignment report:', error.message);
    process.exit(1);
  }
}

main();
