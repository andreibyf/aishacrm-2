import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const AI_ROUTES_DIR = path.join(process.cwd(), 'routes', 'ai');

describe('AI Module Structure Tests', () => {
  describe('File Structure', () => {
    test('should have all expected AI module files', () => {
      const expectedFiles = [
        'index.js',
        'speech.js', 
        'chat.js',
        'conversations.js',
        'tools.js',
        'summarization.js'
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(AI_ROUTES_DIR, file);
        assert.ok(fs.existsSync(filePath), `${file} should exist in routes/ai/`);
      }
    });

    test('should not have the original monolithic ai.js', () => {
      const originalAiPath = path.join(process.cwd(), 'routes', 'ai.js');
      assert.ok(!fs.existsSync(originalAiPath), 'Original ai.js should be moved or renamed');
    });

    test('should have ai.js.backup for safety', () => {
      const backupPath = path.join(process.cwd(), 'routes', 'ai.js.backup');
      assert.ok(fs.existsSync(backupPath), 'ai.js.backup should exist for safety');
    });
  });

  describe('Module Exports', () => {
    test('index.js should be a valid ES module', async () => {
      const indexPath = path.join(AI_ROUTES_DIR, 'index.js');
      const content = fs.readFileSync(indexPath, 'utf8');
      
      // Should have import statements for sub-modules
      assert.ok(content.includes('import'), 'Should have import statements');
      assert.ok(content.includes('export default'), 'Should export a default router');
    });

    test('all module files should be valid JavaScript', () => {
      const moduleFiles = ['speech.js', 'chat.js', 'conversations.js', 'tools.js', 'summarization.js'];
      
      for (const file of moduleFiles) {
        const filePath = path.join(AI_ROUTES_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Basic syntax checks
        assert.ok(content.includes('import'), `${file} should have imports`);
        assert.ok(content.includes('export default'), `${file} should export default router`);
        assert.ok(content.includes('router.'), `${file} should define routes`);
      }
    });

    test('modules should have reasonable size reduction from original', () => {
      const backupPath = path.join(process.cwd(), 'routes', 'ai.js.backup');
      const originalSize = fs.statSync(backupPath).size;
      
      const moduleFiles = ['index.js', 'speech.js', 'chat.js', 'conversations.js', 'tools.js', 'summarization.js'];
      let totalModulesSize = 0;
      
      for (const file of moduleFiles) {
        const filePath = path.join(AI_ROUTES_DIR, file);
        totalModulesSize += fs.statSync(filePath).size;
      }
      
      // Modular approach should be more concise
      assert.ok(totalModulesSize < originalSize, 
        `Modular total (${totalModulesSize} bytes) should be smaller than original (${originalSize} bytes)`);
      
      // But not suspiciously small (should have meaningful content)
      assert.ok(totalModulesSize > originalSize * 0.1, 
        'Modular total should not be suspiciously small (indicating missing functionality)');
    });
  });

  describe('Content Distribution', () => {
    test('speech.js should contain TTS and STT routes', () => {
      const speechPath = path.join(AI_ROUTES_DIR, 'speech.js');
      const content = fs.readFileSync(speechPath, 'utf8');
      
      assert.ok(content.includes('tts') || content.includes('text-to-speech'), 'Should handle TTS');
      assert.ok(content.includes('stt') || content.includes('speech-to-text'), 'Should handle STT');
    });

    test('chat.js should contain chat-related routes', () => {
      const chatPath = path.join(AI_ROUTES_DIR, 'chat.js');
      const content = fs.readFileSync(chatPath, 'utf8');
      
      assert.ok(content.includes('chat'), 'Should handle chat');
    });

    test('conversations.js should contain conversation CRUD', () => {
      const conversationsPath = path.join(AI_ROUTES_DIR, 'conversations.js');
      const content = fs.readFileSync(conversationsPath, 'utf8');
      
      assert.ok(content.includes('conversations'), 'Should handle conversations');
    });

    test('tools.js should contain Braid/MCP integration', () => {
      const toolsPath = path.join(AI_ROUTES_DIR, 'tools.js');
      const content = fs.readFileSync(toolsPath, 'utf8');
      
      assert.ok(content.includes('brain-test') || content.includes('braid') || content.includes('mcp'), 
        'Should handle AI tools/brain functionality');
    });

    test('summarization.js should contain summarization logic', () => {
      const summarizationPath = path.join(AI_ROUTES_DIR, 'summarization.js');
      const content = fs.readFileSync(summarizationPath, 'utf8');
      
      assert.ok(content.includes('summarize'), 'Should handle summarization');
    });
  });

  describe('Integration Points', () => {
    test('server.js should import from routes/ai/index.js', () => {
      const serverPath = path.join(process.cwd(), 'server.js');
      const content = fs.readFileSync(serverPath, 'utf8');
      
      assert.ok(content.includes('./routes/ai/index.js') || content.includes('./routes/ai'), 
        'server.js should import from modular AI routes');
    });

    test('no orphaned route files should exist', () => {
      const routesDir = path.join(process.cwd(), 'routes');
      const files = fs.readdirSync(routesDir);
      
      // Should not have stray ai-related files
      const problematicFiles = files.filter(file => 
        file.startsWith('ai-') || file.includes('ai_') || file === 'ai.temp.js'
      );
      
      assert.equal(problematicFiles.length, 0, 
        `Should not have orphaned files: ${problematicFiles.join(', ')}`);
    });
  });

  describe('Module Independence', () => {
    test('modules should have focused responsibilities', () => {
      const moduleFiles = {
        'speech.js': ['tts', 'speech-to-text', 'audio'],
        'chat.js': ['chat', 'message'],
        'conversations.js': ['conversations', 'history'],
        'tools.js': ['brain-test', 'tools', 'braid', 'mcp'],
        'summarization.js': ['summarize', 'summary']
      };

      for (const [file, expectedKeywords] of Object.entries(moduleFiles)) {
        const filePath = path.join(AI_ROUTES_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
        
        let keywordCount = 0;
        for (const keyword of expectedKeywords) {
          if (content.includes(keyword.toLowerCase())) {
            keywordCount++;
          }
        }
        
        assert.ok(keywordCount > 0, 
          `${file} should contain at least one of its expected keywords: ${expectedKeywords.join(', ')}`);
      }
    });
  });
});