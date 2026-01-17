#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CONFIG = {
  sourcePatterns: [
    'src/**/*.{js,jsx,ts,tsx}',
    'backend/routes/**/*.js',
    'backend/routes/*.js',
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
};

function matchesPattern(filePath, patterns) {
  return patterns.some(pattern => {
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\./g, '\\.')
      .replace(/\{([^}]+)\}/g, '($1)')
      .replace(/,/g, '|');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath.replace(/\\/g, '/'));
  });
}

async function findFiles(patterns, excludePatterns = []) {
  const results = [];
  
  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
      
      if (excludePatterns.some(pattern => matchesPattern(relativePath, [pattern]))) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && matchesPattern(relativePath, patterns)) {
        results.push(relativePath);
      }
    }
  }
  
  await scan(ROOT_DIR);
  return results;
}

function findSourceFile(testFile, sourceFiles) {
  const basename = path.basename(testFile);
  const nameWithoutExt = basename.replace(/\.(test|spec)\.(js|jsx|ts|tsx)$/, '');
  const dir = path.dirname(testFile);
  
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
      if (sourceFiles.includes(path.relative(ROOT_DIR, sourcePath).replace(/\\/g, '/'))) {
        return sourcePath;
      }
    }
  }
  
  return null;
}

async function main() {
  const sourceFiles = await findFiles(CONFIG.sourcePatterns, CONFIG.excludePatterns);
  const testFiles = await findFiles(CONFIG.testPatterns, CONFIG.excludePatterns);
  
  const validTestMarkers = [
    'node_modules',
    'integration-test',
    'e2e-test',
    'system-test',
    'validation-test',
    'feature-test',
    'schema-test',
  ];
  
  const orphaned = [];
  
  for (const testFile of testFiles) {
    const sourceFile = findSourceFile(testFile, sourceFiles);
    
    if (!sourceFile || !validTestMarkers.includes(sourceFile)) {
      if (!sourceFile) {
        orphaned.push(testFile);
      }
    }
  }
  
  console.log(`Found ${orphaned.length} orphaned test files:`);
  orphaned.forEach(file => console.log(`- ${file}`));
}

main().catch(console.error);