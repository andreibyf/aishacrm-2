const fs = require('fs');
const path = require('path');

/**
 * Test Alignment Report Generator
 * 
 * This script analyzes the codebase to identify:
 * 1. Source files without corresponding test files
 * 2. Test files without corresponding source files
 * 3. Generates a detailed alignment report
 */

// Configuration
const config = {
  sourceExtensions: ['.js', '.ts', '.jsx', '.tsx'],
  testPatterns: ['.test.', '.spec.'],
  ignorePaths: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.git',
    'scripts',
    'public',
    'docs',
    '__mocks__'
  ],
  sourceRoots: ['src', 'lib', 'app'],
  testRoots: ['__tests__', 'src', 'lib', 'app']
};

/**
 * Check if a path should be ignored
 */
function shouldIgnore(filePath) {
  return config.ignorePaths.some(ignorePath => 
    filePath.includes(path.sep + ignorePath + path.sep) ||
    filePath.startsWith(ignorePath + path.sep) ||
    filePath === ignorePath
  );
}

/**
 * Check if a file is a test file
 */
function isTestFile(filePath) {
  return config.testPatterns.some(pattern => filePath.includes(pattern));
}

/**
 * Check if a file is a source file
 */
function isSourceFile(filePath) {
  const ext = path.extname(filePath);
  return config.sourceExtensions.includes(ext) && !isTestFile(filePath);
}

/**
 * Recursively find all files in a directory
 */
function findFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    
    if (shouldIgnore(filePath)) {
      return;
    }

    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Get the base name of a file without test suffix and extension
 */
function getBaseName(filePath) {
  let basename = path.basename(filePath);
  
  // Remove test patterns
  config.testPatterns.forEach(pattern => {
    basename = basename.replace(pattern, '.');
  });
  
  // Remove extension
  basename = basename.replace(path.extname(basename), '');
  
  return basename;
}

/**
 * Get potential test file paths for a source file
 */
function getPotentialTestPaths(sourceFile) {
  const dir = path.dirname(sourceFile);
  const basename = path.basename(sourceFile);
  const ext = path.extname(sourceFile);
  const nameWithoutExt = basename.replace(ext, '');
  
  const potentialPaths = [];
  
  // Same directory patterns
  config.testPatterns.forEach(pattern => {
    potentialPaths.push(path.join(dir, `${nameWithoutExt}${pattern}${ext}`));
  });
  
  // __tests__ directory patterns
  const testsDir = path.join(dir, '__tests__');
  config.testPatterns.forEach(pattern => {
    potentialPaths.push(path.join(testsDir, `${nameWithoutExt}${pattern}${ext}`));
  });
  
  // Parent __tests__ directory patterns (for files in subdirectories)
  const parentTestsDir = path.join(path.dirname(dir), '__tests__');
  config.testPatterns.forEach(pattern => {
    potentialPaths.push(path.join(parentTestsDir, `${nameWithoutExt}${pattern}${ext}`));
  });
  
  return potentialPaths;
}

/**
 * Get potential source file paths for a test file
 */
function getPotentialSourcePaths(testFile) {
  const dir = path.dirname(testFile);
  const basename = getBaseName(testFile);
  const ext = path.extname(testFile);
  
  const potentialPaths = [];
  
  // Same directory
  potentialPaths.push(path.join(dir, `${basename}${ext}`));
  
  // If in __tests__ directory, check parent directory
  if (dir.includes('__tests__')) {
    const parentDir = path.dirname(dir);
    potentialPaths.push(path.join(parentDir, `${basename}${ext}`));
    
    // Also check sibling directories
    if (fs.existsSync(parentDir)) {
      const siblings = fs.readdirSync(parentDir).filter(f => {
        const fullPath = path.join(parentDir, f);
        return fs.statSync(fullPath).isDirectory() && f !== '__tests__';
      });
      
      siblings.forEach(sibling => {
        potentialPaths.push(path.join(parentDir, sibling, `${basename}${ext}`));
      });
    }
  }
  
  // Check parent directory
  const parentDir = path.dirname(dir);
  potentialPaths.push(path.join(parentDir, `${basename}${ext}`));
  
  return potentialPaths;
}

/**
 * Find matching test file for a source file
 */
function findMatchingTest(sourceFile, allTestFiles) {
  const potentialPaths = getPotentialTestPaths(sourceFile);
  
  for (const testPath of potentialPaths) {
    if (allTestFiles.some(test => path.normalize(test) === path.normalize(testPath))) {
      return testPath;
    }
  }
  
  return null;
}

/**
 * Find matching source file for a test file
 */
function findMatchingSource(testFile, allSourceFiles) {
  const potentialPaths = getPotentialSourcePaths(testFile);
  
  for (const sourcePath of potentialPaths) {
    if (allSourceFiles.some(source => path.normalize(source) === path.normalize(sourcePath))) {
      return sourcePath;
    }
  }
  
  return null;
}

/**
 * Analyze test coverage alignment
 */
function analyzeTestAlignment() {
  console.log('🔍 Analyzing test alignment...\n');
  
  // Find all files
  const allFiles = [];
  config.sourceRoots.forEach(root => {
    if (fs.existsSync(root)) {
      findFiles(root, allFiles);
    }
  });
  
  // Separate source and test files
  const sourceFiles = allFiles.filter(isSourceFile);
  const testFiles = allFiles.filter(isTestFile);
  
  console.log(`Found ${sourceFiles.length} source files`);
  console.log(`Found ${testFiles.length} test files\n`);
  
  // Find unmatched files
  const unmatchedSources = [];
  const unmatchedTests = [];
  
  sourceFiles.forEach(sourceFile => {
    const matchingTest = findMatchingTest(sourceFile, testFiles);
    if (!matchingTest) {
      unmatchedSources.push(sourceFile);
    }
  });
  
  testFiles.forEach(testFile => {
    const matchingSource = findMatchingSource(testFile, sourceFiles);
    if (!matchingSource) {
      unmatchedTests.push(testFile);
    }
  });
  
  return {
    totalSource: sourceFiles.length,
    totalTests: testFiles.length,
    unmatchedSources,
    unmatchedTests,
    matchedCount: sourceFiles.length - unmatchedSources.length
  };
}

/**
 * Generate and display report
 */
function generateReport() {
  const results = analyzeTestAlignment();
  
  console.log('📊 Test Alignment Report');
  console.log('='.repeat(80));
  console.log(`\nTotal Source Files: ${results.totalSource}`);
  console.log(`Total Test Files: ${results.totalTests}`);
  console.log(`Matched Source Files: ${results.matchedCount}`);
  console.log(`Unmatched Source Files: ${results.unmatchedSources.length}`);
  console.log(`Orphaned Test Files: ${results.unmatchedTests.length}`);
  
  const coveragePercentage = results.totalSource > 0 
    ? ((results.matchedCount / results.totalSource) * 100).toFixed(2)
    : 0;
  console.log(`\nTest Coverage Alignment: ${coveragePercentage}%`);
  
  if (results.unmatchedSources.length > 0) {
    console.log('\n❌ Source Files Without Tests:');
    console.log('-'.repeat(80));
    results.unmatchedSources.forEach(file => {
      console.log(`  ${file}`);
    });
  }
  
  if (results.unmatchedTests.length > 0) {
    console.log('\n⚠️  Test Files Without Matching Source:');
    console.log('-'.repeat(80));
    results.unmatchedTests.forEach(file => {
      console.log(`  ${file}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  
  // Write detailed report to file
  const reportPath = path.join(process.cwd(), 'test-alignment-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📝 Detailed report written to: ${reportPath}`);
  
  // Exit with error code if coverage is below threshold
  const threshold = 80;
  if (parseFloat(coveragePercentage) < threshold) {
    console.log(`\n⚠️  Warning: Test alignment (${coveragePercentage}%) is below threshold (${threshold}%)`);
    process.exit(1);
  } else {
    console.log(`\n✅ Test alignment meets threshold (${threshold}%)`);
  }
}

// Run the report
generateReport();
