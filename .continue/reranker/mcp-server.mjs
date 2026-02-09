#!/usr/bin/env node
/**
 * MCP Server for Continue.dev Reranker
 * Exposes the Python reranker service as Continue.dev tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const RERANKER_URL = process.env.RERANKER_URL || 'http://localhost:5001';

// Create MCP server
const server = new Server(
  {
    name: 'continue-reranker',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: Rerank documents
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'rerank_context',
        description: 'Rerank semantic search results by relevance to improve context quality. Use this after semantic search to select the most relevant code snippets.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query or user question',
            },
            documents: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of code snippets or document strings to rerank',
            },
            top_k: {
              type: 'number',
              description: 'Number of top results to return (default: 5)',
              default: 5,
            },
          },
          required: ['query', 'documents'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'rerank_context') {
    try {
      const response = await fetch(`${RERANKER_URL}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: args.query,
          documents: args.documents,
          top_k: args.top_k || 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Reranker service error: ${response.statusText}`);
      }

      const data = await response.json();
      const ranked = data.ranked_documents;

      // Format results for Continue.dev
      const result = ranked.map((doc, i) => 
        `[Rank ${i + 1}, Score: ${doc.score.toFixed(3)}]\n${doc.text}`
      ).join('\n\n---\n\n');

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}\n\nMake sure the reranker service is running: .continue/reranker/start-reranker.bat`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Continue.dev Reranker MCP Server running');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
