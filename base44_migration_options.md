# Migration Options for Replacing Base44 SDK

## Option 1: Migrate to Public Packages (Full Stack Replacement)

### Setup Required Packages
```bash
npm install prisma @prisma/client
npm install next-auth
npm install openai
npm install @aws-sdk/client-s3
npm install nodemailer
npm install axios
npm install @tanstack/react-query
```

### 1. Database Layer (Replace Entity CRUD)

#### Prisma Schema (`prisma/schema.prisma`)
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Contact {
  id            String   @id @default(uuid())
  created_date  DateTime @default(now())
  updated_date  DateTime @updatedAt
  created_by    String
  tenant_id     String
  assigned_to   String?
  first_name    String
  last_name     String
  email         String?
  phone         String?
  mobile        String?
  job_title     String?
  department    String?
  account_id    String?
  account       Account? @relation(fields: [account_id], references: [id])
  status        String   @default("prospect")
  is_test_data  Boolean  @default(false)
  activities    Activity[]
  opportunities Opportunity[]
  @@index([tenant_id])
  @@index([assigned_to])
  @@index([created_by])
}
```

#### Prisma Client Wrapper (`lib/prisma.js`)
```javascript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;

export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const createEntityWrapper = (modelName) => ({
  async list(sort = '-created_date', limit = 100) {
    const [field, direction] = sort.startsWith('-') ? [sort.slice(1), 'desc'] : [sort, 'asc'];
    return await prisma[modelName].findMany({ orderBy: { [field]: direction }, take: limit });
  },
  async filter(where, sort = '-created_date', limit = 100) {
    const [field, direction] = sort.startsWith('-') ? [sort.slice(1), 'desc'] : [sort, 'asc'];
    return await prisma[modelName].findMany({ where, orderBy: { [field]: direction }, take: limit });
  },
  async get(id) { return await prisma[modelName].findUnique({ where: { id } }); },
  async create(data) {
    return await prisma[modelName].create({ data: { ...data, created_date: new Date(), updated_date: new Date() } });
  },
  async update(id, data) {
    return await prisma[modelName].update({ where: { id }, data: { ...data, updated_date: new Date() } });
  },
  async delete(id) { return await prisma[modelName].delete({ where: { id } }); },
  schema() { return prisma[modelName].fields; }
});

export const Contact = createEntityWrapper('contact');
export const Account = createEntityWrapper('account');
export const Lead = createEntityWrapper('lead');
export const Opportunity = createEntityWrapper('opportunity');
export const Activity = createEntityWrapper('activity');
export const User = createEntityWrapper('user');
```

### 2. Authentication Layer (Replace base44.auth)
#### NextAuth Configuration (`pages/api/auth/[...nextauth].js`)
```javascript
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';

export default NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (user && await bcrypt.compare(credentials.password, user.password)) {
          return {
            id: user.id,
            email: user.email,
            name: user.full_name,
            role: user.role,
            tenant_id: user.tenant_id,
            employee_role: user.employee_role
          };
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenant_id = user.tenant_id;
        token.employee_role = user.employee_role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.tenant_id = token.tenant_id;
      session.user.employee_role = token.employee_role;
      return session;
    }
  },
  pages: { signIn: '/login', error: '/auth/error' }
});
```

### 3. Integrations Layer
#### OpenAI Integration (`lib/integrations/openai.js`)
```javascript
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const invokeLLM = async ({ prompt, add_context_from_internet = false, response_json_schema = null }) => {
  const messages = [{ role: 'user', content: prompt }];
  if (response_json_schema) messages.unshift({ role: 'system', content: `Return JSON: ${JSON.stringify(response_json_schema)}` });
  const response = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages });
  const content = response.choices[0].message.content;
  return response_json_schema ? JSON.parse(content) : content;
};
```

### 4. Unified Client Wrapper (`lib/apiClient.js`)
```javascript
import { Contact, Account, Lead } from './prisma';
import { auth } from './auth';
import { invokeLLM } from './integrations/openai';
import axios from 'axios';

export const apiClient = {
  entities: { Contact, Account, Lead },
  auth,
  integrations: { Core: { InvokeLLM: invokeLLM } },
  functions: { async invoke(fn, params) { return axios.post(`/api/functions/${fn}`, params); } }
};

export const base44 = apiClient;
```

### 5. Update Component Usage
Example (pages/Contacts.js):
```javascript
import { Contact } from "@/lib/prisma";
import { base44 } from "@/lib/apiClient";
import { useSession } from "next-auth/react";

export default function ContactsPage() {
  const { data: session } = useSession();
  const user = session?.user;
}
```

## Option 2: Create Custom Wrapper (Mimics base44 API)

### Main Client (`api/customClient.js`)
```javascript
import axios from 'axios';
class CustomBase44Client {
  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || '/api';
    this.entities = this._createEntityProxies();
  }
  _createEntityProxies() {
    const names = ['Contact', 'Account'];
    const entities = {};
    names.forEach(name => {
      entities[name] = {
        list: async () => (await axios.get(`${this.baseURL}/entities/${name}`)).data,
        create: async (data) => (await axios.post(`${this.baseURL}/entities/${name}`, data)).data
      };
    });
    return entities;
  }
}
export const base44 = new CustomBase44Client();
```

### Summary Comparison
| Aspect | Option 1: Full Migration | Option 2: Custom Wrapper |
|---------|---------------------------|---------------------------|
| Code Changes | Moderate | Minimal |
| Control | Full stack control | API only |
| Complexity | Higher | Lower |
| Flexibility | Maximum | High |
| Migration Time | 2–3 weeks | 3–5 days |
| Maintenance | More code | Less code |
| Cost | Cloud resources | Hosting costs |

**Recommendation:** Start with **Option 2** (Custom Wrapper) for a faster transition, then adopt **Option 1** later if you need deeper control.
