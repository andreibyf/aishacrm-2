
// Deployment and Setup Documentation
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Cloud, 
  Settings, 
  Database, 
  Shield, 
  Zap,
  Code,
  Users,
  Globe
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DeploymentGuide() {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Ai-SHA CRM Deployment Guide
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="platform" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="platform">Platform Setup</TabsTrigger>
            <TabsTrigger value="middleware">Middleware Layer</TabsTrigger>
            <TabsTrigger value="customization">Customization</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="scaling">Scaling</TabsTrigger>
          </TabsList>

          <TabsContent value="platform" className="space-y-4">
            <Alert>
              <Cloud className="h-4 w-4" />
              <AlertDescription>
                Ai-SHA CRM is built on the base44 platform which handles all infrastructure, hosting, and deployment automatically.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4">
              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Database & Storage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><strong>Database:</strong> Managed PostgreSQL with automatic backups</p>
                  <p><strong>File Storage:</strong> Integrated file upload and management</p>
                  <p><strong>Scalability:</strong> Auto-scaling based on usage</p>
                  <p><strong>Security:</strong> Enterprise-grade encryption and security</p>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Authentication & Security
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><strong>Authentication:</strong> Google OAuth 2.0 (no setup required)</p>
                  <p><strong>User Roles:</strong> Admin and User roles with permissions</p>
                  <p><strong>Data Security:</strong> End-to-end encryption</p>
                  <p><strong>Access Control:</strong> Role-based access to CRM features</p>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Hosting & Domain
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><strong>Hosting:</strong> Global CDN with 99.9% uptime</p>
                  <p><strong>SSL:</strong> Automatic SSL certificate management</p>
                  <p><strong>Custom Domain:</strong> Available in platform settings</p>
                  <p><strong>Performance:</strong> Optimized for speed and reliability</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="middleware" className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <Zap className="h-4 w-4" />
              <AlertDescription>
                <strong>Middleware Architecture:</strong> Deploy an external middleware layer to connect Base44 CRM with your self-hosted backend and enable advanced AI features.
              </AlertDescription>
            </Alert>

            <div className="space-y-6">
              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Architecture Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-slate-100 p-4 rounded text-sm overflow-x-auto">
{`┌─────────────────┐    ┌───────────────────┐    ┌──────────────────┐
│   Base44 CRM    │    │   Middleware      │    │  Self-Hosted     │
│   Frontend      │◄──►│   Gateway         │◄──►│  Backend DB      │
│                 │    │                   │    │                  │
└─────────────────┘    └───────────────────┘    └──────────────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │   n8n       │
                       │ Workflows   │
                       └─────────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │   MCP       │
                       │ AI Models   │
                       └─────────────┘`}
                  </pre>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Docker Compose Setup</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Save this as <code>docker-compose.yml</code> in your middleware directory:</p>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded text-sm overflow-x-auto max-h-96">
{`version: '3.8'

services:
  # Main API Gateway
  gateway:
    build: ./gateway
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB}
      - REDIS_URL=redis://redis:6379
      - N8N_WEBHOOK_URL=http://n8n:5678
      - BASE44_API_URL=https://your-base44-app.base44.dev
    depends_on:
      - postgres
      - redis
      - mcp-server
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - crm-network

  # MCP Server for AI Integration
  mcp-server:
    build: ./mcp-server
    ports:
      - "3001:3001"
    environment:
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY}
      - REDIS_URL=redis://redis:6379
      - MCP_PORT=3001
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - crm-network

  # n8n Workflow Engine
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=\${N8N_USER}
      - N8N_BASIC_AUTH_PASSWORD=\${N8N_PASSWORD}
      - WEBHOOK_URL=http://localhost:5678/
      - DATABASE_TYPE=postgresdb
      - DATABASE_HOST=postgres
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
    restart: unless-stopped
    networks:
      - crm-network

  # PostgreSQL Database
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=\${POSTGRES_DB}
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    networks:
      - crm-network

  # Redis for Caching
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - crm-network

volumes:
  postgres_data:
  redis_data:
  n8n_data:

networks:
  crm-network:
    driver: bridge`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Environment Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Create a <code>.env</code> file with these variables:</p>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded text-sm">
{`# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=crm_database
POSTGRES_USER=crm_user
POSTGRES_PASSWORD=secure_password_here

# Base44 Integration
BASE44_API_URL=https://your-base44-app.base44.dev
BASE44_API_KEY=your_base44_api_key

# n8n Configuration
N8N_USER=admin
N8N_PASSWORD=secure_n8n_password
N8N_DB_NAME=n8n_db
N8N_WEBHOOK_URL=http://localhost:5678
N8N_API_KEY=your_n8n_api_key

# AI Model APIs
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Gateway Settings
GATEWAY_PORT=8080
GATEWAY_CORS_ORIGINS=*
GATEWAY_RATE_LIMIT=1000
MIDDLEWARE_TOKEN_SECRET=your-jwt-secret-here`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Gateway Server Code</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Create <code>gateway/src/index.js</code> with this Express.js server:</p>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded text-sm overflow-x-auto max-h-96">
{`const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const port = process.env.GATEWAY_PORT || 8080;

// Security and middleware
app.use(helmet());
app.use(cors({
  origin: process.env.GATEWAY_CORS_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.GATEWAY_RATE_LIMIT) || 1000
});
app.use('/api', limiter);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Redis connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Contact endpoints
app.get('/api/v1/contacts', async (req, res) => {
  try {
    const { limit = 50, offset = 0, ...filters } = req.query;
    
    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (value && key !== 'limit' && key !== 'offset') {
        paramCount++;
        query += \` AND \${key} ILIKE $\${paramCount}\`;
        params.push(\`%\${value}%\`);
      }
    }
    
    query += \` ORDER BY updated_date DESC LIMIT $\${++paramCount} OFFSET $\${++paramCount}\`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    res.json({
      data: result.rows,
      total: result.rowCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/contacts', async (req, res) => {
  try {
    const contactData = req.body;
    
    const fields = Object.keys(contactData);
    const values = Object.values(contactData);
    const placeholders = values.map((_, i) => \`$\${i + 1}\`);
    
    const query = \`
      INSERT INTO contacts (\${fields.join(', ')}, id, created_date, updated_date)
      VALUES (\${placeholders.join(', ')}, gen_random_uuid(), NOW(), NOW())
      RETURNING *
    \`;
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MCP AI Chat endpoint
app.post('/api/v1/mcp/chat/completions', async (req, res) => {
  try {
    const { messages, model = 'openai-gpt4', context = {}, stream = false } = req.body;
    
    // Forward to MCP server
    const mcpResponse = await fetch('http://mcp-server:3001/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model, context, stream })
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');
      mcpResponse.body.pipe(res);
    } else {
      const data = await mcpResponse.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Error in MCP chat:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(\`Gateway server running on port \${port}\`);
});`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">MCP Server Implementation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Create <code>mcp-server/src/server.js</code> for AI model integration:</p>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded text-sm overflow-x-auto max-h-96">
{`const express = require('express');
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.MCP_PORT || 3001;

app.use(express.json());

// Initialize AI clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// MCP Chat Completions endpoint
app.post('/chat/completions', async (req, res) => {
  try {
    const { messages, model, context, stream = false } = req.body;
    
    // Add context to system message if provided
    let enhancedMessages = [...messages];
    if (context && Object.keys(context).length > 0) {
      const contextMessage = {
        role: 'system',
        content: \`Context from CRM: \${JSON.stringify(context, null, 2)}\`
      };
      enhancedMessages.unshift(contextMessage);
    }
    
    if (model.startsWith('openai')) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: enhancedMessages,
        stream,
        max_tokens: 1000
      });
      
      if (stream) {
        res.setHeader('Content-Type', 'text/plain');
        for await (const chunk of completion) {
          res.write(\`data: \${JSON.stringify(chunk)}\\n\\n\`);
        }
        res.write('data: [DONE]\\n\\n');
        res.end();
      } else {
        res.json(completion);
      }
    } else if (model.startsWith('anthropic')) {
      const message = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: enhancedMessages.filter(m => m.role !== 'system'),
        system: enhancedMessages.find(m => m.role === 'system')?.content
      });
      
      res.json({
        choices: [{
          message: {
            role: 'assistant',
            content: message.content[0].text
          }
        }]
      });
    } else {
      res.status(400).json({ error: 'Unsupported model' });
    }
  } catch (error) {
    console.error('MCP Error:', error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(\`MCP server running on port \${port}\`);
});`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Deployment Commands</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-slate-100 p-4 rounded">
                      <h4 className="font-semibold mb-2">1. Create project structure:</h4>
                      <pre className="text-sm">
{`mkdir aisha-middleware
cd aisha-middleware
mkdir -p gateway/src mcp-server/src`}
                      </pre>
                    </div>
                    
                    <div className="bg-slate-100 p-4 rounded">
                      <h4 className="font-semibold mb-2">2. Deploy the stack:</h4>
                      <pre className="text-sm">
{`# Copy all code files to respective directories
# Configure your .env file with actual values
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f gateway`}
                      </pre>
                    </div>
                    
                    <div className="bg-slate-100 p-4 rounded">
                      <h4 className="font-semibold mb-2">3. Configure Base44 CRM:</h4>
                      <pre className="text-sm">
{`# Add to your Base44 app environment:
MIDDLEWARE_URL=http://your-server-ip:8080/api/v1

# Test connection from Base44:
const client = new MiddlewareClient();
client.getContacts().then(console.log);`}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customization" className="space-y-4">
            <div className="space-y-4">
              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Branding Customization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <strong>Company Name:</strong>
                    <p className="text-slate-600">Change from "Ai-SHA CRM" to your company name in Settings → Branding</p>
                  </div>
                  <div>
                    <strong>Logo Upload:</strong>
                    <p className="text-slate-600">Upload your company logo to replace default branding</p>
                  </div>
                  <div>
                    <strong>Color Scheme:</strong>
                    <p className="text-slate-600">Customize primary and accent colors to match your brand</p>
                  </div>
                  <div>
                    <strong>Layout Customization:</strong>
                    <p className="text-slate-600">Modify the Layout.js component for custom navigation and styling</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Feature Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <strong>Entity Customization:</strong>
                    <p className="text-slate-600">Modify entity schemas to add custom fields and validation</p>
                  </div>
                  <div>
                    <strong>UI Components:</strong>
                    <p className="text-slate-600">Customize forms, tables, and dashboards in the components/ directory</p>
                  </div>
                  <div>
                    <strong>Workflow Customization:</strong>
                    <p className="text-slate-600">Modify page logic and business rules in the pages/ directory</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-4">
            <Alert>
              <Zap className="h-4 w-4" />
              <AlertDescription>
                Advanced integrations require enabling backend functions through Dashboard → Settings → Enable Backend Functions
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Available Integrations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <strong>Email Integration:</strong>
                    <p className="text-slate-600">Gmail API integration for email tracking and automation</p>
                  </div>
                  <div>
                    <strong>Calendar Sync:</strong>
                    <p className="text-slate-600">Google Calendar integration for meeting management</p>
                  </div>
                  <div>
                    <strong>Webhook Support:</strong>
                    <p className="text-slate-600">Zapier, Pabbly Connect, and custom webhook endpoints</p>
                  </div>
                  <div>
                    <strong>AI Services:</strong>
                    <p className="text-slate-600">Custom AI microservice integration for automated data entry</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg">Integration Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>1. Enable backend functions in platform dashboard</p>
                  <p>2. Configure API credentials for external services</p>
                  <p>3. Set up webhook endpoints for data synchronization</p>
                  <p>4. Test integration functionality and error handling</p>
                  <p>5. Monitor integration performance and logs</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="scaling" className="space-y-4">
            <div className="space-y-4">
              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Multi-User Setup
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <strong>User Invitation:</strong>
                    <p className="text-slate-600">Invite team members through Dashboard → Users</p>
                  </div>
                  <div>
                    <strong>Role Assignment:</strong>
                    <p className="text-slate-600">Assign admin or user roles based on responsibilities</p>
                  </div>
                  <div>
                    <strong>Permission Management:</strong>
                    <p className="text-slate-600">Control access to different CRM modules and features</p>
                  </div>
                  <div>
                    <strong>Team Collaboration:</strong>
                    <p className="text-slate-600">Share contacts, opportunities, and activities across teams</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code className="w-5 h-5" />
                    Custom Development
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <strong>Adding New Entities:</strong>
                    <p className="text-slate-600">Create new JSON schema files in entities/ directory</p>
                  </div>
                  <div>
                    <strong>Custom Pages:</strong>
                    <p className="text-slate-600">Add new React components in pages/ directory</p>
                  </div>
                  <div>
                    <strong>Reusable Components:</strong>
                    <p className="text-slate-600">Build modular UI components in components/ directory</p>
                  </div>
                  <div>
                    <strong>API Extensions:</strong>
                    <p className="text-slate-600">Extend functionality with backend functions and custom endpoints</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
