# Aisha CRM System Administrator Guide

**Version 2.0** | **Updated: November 2025**

---

## 📖 Table of Contents

### Chapter 1: Administration Overview

- [1.1 Administrator Role](#11-administrator-role)
- [1.2 System Architecture](#12-system-architecture)
- [1.3 Access Requirements](#13-access-requirements)
- [1.4 Document Conventions](#14-document-conventions)

### Chapter 2: Initial Setup and Installation

- [2.1 Pre-Installation Checklist](#21-pre-installation-checklist)
- [2.2 Docker Installation](#22-docker-installation)
- [2.3 Environment Configuration](#23-environment-configuration)
- [2.4 Database Setup](#24-database-setup)
- [2.5 First-Time Configuration](#25-first-time-configuration)

### Chapter 3: User Management

- [3.1 Creating Users](#31-creating-users)
- [3.2 User Roles and Permissions](#32-user-roles-and-permissions)
- [3.3 Employee Management](#33-employee-management)
- [3.4 Access Control](#34-access-control)

### Chapter 4: Tenant Management

- [4.1 Multi-Tenant Architecture](#41-multi-tenant-architecture)
- [4.2 Creating Tenants](#42-creating-tenants)
- [4.3 Tenant Isolation](#43-tenant-isolation)
- [4.4 Tenant Configuration](#44-tenant-configuration)

### Chapter 5: Security Administration

- [5.1 Authentication Configuration](#51-authentication-configuration)
- [5.2 Row-Level Security (RLS)](#52-row-level-security-rls)
- [5.3 API Security](#53-api-security)
- [5.4 Audit Logging](#54-audit-logging)
- [5.5 Security Best Practices](#55-security-best-practices)

### Chapter 6: System Configuration

- [6.1 General Settings](#61-general-settings)
- [6.2 Email Configuration](#62-email-configuration)
- [6.3 Integration Settings](#63-integration-settings)
- [6.4 Module Configuration](#64-module-configuration)
- [6.5 Custom Fields](#65-custom-fields)
- [6.6 Entity Label Customization](#66-entity-label-customization)

### Chapter 7: Performance Monitoring

- [7.1 System Health Dashboard](#71-system-health-dashboard)
- [7.2 Performance Metrics](#72-performance-metrics)
- [7.3 Query Performance](#73-query-performance)
- [7.4 Optimization Techniques](#74-optimization-techniques)

### Chapter 8: Backup and Recovery

- [8.1 Backup Strategy](#81-backup-strategy)
- [8.2 Database Backups](#82-database-backups)
- [8.3 Disaster Recovery](#83-disaster-recovery)
- [8.4 Testing Recovery Procedures](#84-testing-recovery-procedures)

### Chapter 9: Maintenance Operations

- [9.1 System Updates](#91-system-updates)
- [9.2 Database Maintenance](#92-database-maintenance)
- [9.3 Log Management](#93-log-management)
- [9.4 Cleanup Operations](#94-cleanup-operations)
- [9.5 Campaign Worker Management](#95-campaign-worker-management)
- [9.6 Call Flow System](#96-call-flow-system)
- [9.7 Braid MCP Server](#97-braid-mcp-server)

### Chapter 10: Troubleshooting

- [10.1 Common Issues](#101-common-issues)
- [10.2 Diagnostic Tools](#102-diagnostic-tools)
- [10.3 Log Analysis](#103-log-analysis)
- [10.4 Emergency Procedures](#104-emergency-procedures)

### Chapter 11: Production Deployment

- [11.1 Pre-Deployment Checklist](#111-pre-deployment-checklist)
- [11.2 Deployment Process](#112-deployment-process)
- [11.3 Post-Deployment Verification](#113-post-deployment-verification)
- [11.4 Rollback Procedures](#114-rollback-procedures)

### Chapter 12: Monitoring and Alerting

- [12.1 Monitoring Setup](#121-monitoring-setup)
- [12.2 Alert Configuration](#122-alert-configuration)
- [12.3 Incident Response](#123-incident-response)
- [12.4 Reporting](#124-reporting)

### Chapter 13: C.A.R.E. v1 - Autonomous Relationship Management

- [13.1 C.A.R.E. Overview](#131-care-overview)
- [13.2 Kill Switch Configuration](#132-kill-switch-configuration)
- [13.3 State Engine and Transitions](#133-state-engine-and-transitions)
- [13.4 Escalation Detection](#134-escalation-detection)
- [13.5 Policy Gate System](#135-policy-gate-system)
- [13.6 Workflow Webhook Triggers](#136-workflow-webhook-triggers)
- [13.7 Audit Logging and Monitoring](#137-audit-logging-and-monitoring)
- [13.8 Configuration Reference](#138-configuration-reference)
- [13.9 Troubleshooting C.A.R.E.](#139-troubleshooting-care)

### Appendices

- [Appendix A: Environment Variables](#appendix-a-environment-variables)
- [Appendix B: API Endpoints](#appendix-b-api-endpoints)
- [Appendix C: Database Schema](#appendix-c-database-schema)
- [Appendix D: Troubleshooting Flowcharts](#appendix-d-troubleshooting-flowcharts)

---

# Chapter 1: Administration Overview

## 1.1 Administrator Role

The System Administrator is responsible for the installation, configuration, maintenance, and security of the Aisha CRM platform.

### Key Responsibilities

```mermaid
mindmap
  root((System Admin))
    Installation
      Infrastructure Setup
      Docker Configuration
      Database Setup
    Security
      User Management
      Access Control
      Audit Compliance
    Operations
      Performance Monitoring
      Backup & Recovery
      System Updates
    Support
      User Training
      Troubleshooting
      Documentation
```

### Administrator Types

| Role           | Access Level        | Primary Duties                               |
| -------------- | ------------------- | -------------------------------------------- |
| **Superadmin** | Full system access  | Infrastructure, security, all tenants        |
| **Admin**      | Tenant-level access | User management, configuration within tenant |
| **Manager**    | Department access   | Team oversight, reporting                    |
| **Support**    | Read access         | User assistance, troubleshooting             |

## 1.2 System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        A[Web Browser] --> B[React Frontend]
    end

    subgraph "Application Layer"
        B --> C[Docker Container: Frontend]
        B --> D[Docker Container: Backend]
    end

    subgraph "Service Layer"
        D --> E[Express API Server]
        E --> F[Swagger API Docs]
    end

    subgraph "Data Layer"
        E --> G[(PostgreSQL/Supabase)]
        E --> H[(File Storage)]
    end

    subgraph "Integration Layer"
        E --> I[Email Service]
        E --> J[Calendar Sync]
        E --> K[Braid AI SDK]
    end

    style C fill:#4F46E5,color:#fff
    style D fill:#10B981,color:#fff
    style G fill:#F59E0B,color:#000
```

### Technology Stack

| Layer                | Technology                | Purpose              |
| -------------------- | ------------------------- | -------------------- |
| **Frontend**         | React 18 + Vite           | User interface       |
| **Backend**          | Node.js 22 + Express      | API server           |
| **Database**         | PostgreSQL 15+ / Supabase | Data storage         |
| **Containerization** | Docker + Docker Compose   | Deployment           |
| **AI Framework**     | Braid SDK                 | Intelligent features |
| **Cache**            | In-memory + File system   | Performance          |
| **Storage**          | Supabase Storage          | File management      |

### Port Configuration

> **🚨 CRITICAL: Docker Port Configuration**
>
> This project runs in Docker containers with fixed port mappings. **Never modify these ports** without updating all related configuration.

```
┌─────────────────────────────────────────┐
│  Docker Port Mapping                    │
├─────────────────────────────────────────┤
│  Frontend Container:                    │
│  • Internal: 5173 (Vite default)        │
│  • External: 4000 (host access)         │
│                                         │
│  Backend Container:                     │
│  • Internal: 3001 (Express default)     │
│  • External: 4001 (host access)         │
│                                         │
│  ⚠️ Users access via:                   │
│  • Frontend: http://localhost:4000      │
│  • Backend:  http://localhost:4001      │
└─────────────────────────────────────────┘
```

## 1.3 Access Requirements

### Administrator Workstation Requirements

**Hardware:**

- CPU: 4+ cores recommended
- RAM: 8GB minimum, 16GB recommended
- Disk: 50GB+ free space
- Network: Stable 10+ Mbps connection

**Software:**

- Docker Desktop 20.10+ or Docker Engine + Docker Compose
- Modern web browser (Chrome, Firefox, Edge)
- SSH client (for remote management)
- Database client (DBeaver, pgAdmin, etc.)
- Text editor (VS Code recommended)

### Network Access

Required ports must be accessible:

- **4000**: Frontend (HTTP)
- **4001**: Backend API (HTTP)
- **5432**: PostgreSQL (if direct access needed)
- **22**: SSH (for remote administration)

> **⚠️ WARNING**
>
> In production, ports 4000/4001 should be behind a reverse proxy (nginx, Apache) with HTTPS enabled.

## 1.4 Document Conventions

This guide uses standard notation conventions:

| Symbol | Meaning                                |
| ------ | -------------------------------------- |
| 💡     | Best practice or helpful tip           |
| ⚠️     | Important warning or caution           |
| 🚨     | Critical information - must read!      |
| ✅     | Verification step or success indicator |
| ❌     | Incorrect action or error              |
| 📝     | Additional information or note         |
| 🔒     | Security-related information           |
| 🐳     | Docker-specific information            |

**Command Notation:**

```powershell
# PowerShell commands shown with PS prompt
PS C:\> Get-Location

# Bash commands shown with $ prompt
$ docker ps

# SQL commands shown in SQL blocks
```

---

# Chapter 2: Initial Setup and Installation

## 2.1 Pre-Installation Checklist

### System Requirements

Before beginning installation, verify:

```
Prerequisites Checklist:
☐ Docker Desktop installed (Windows/Mac) OR
  Docker Engine + Docker Compose (Linux)
☐ 8GB+ RAM available
☐ 50GB+ free disk space
☐ Ports 4000, 4001 available
☐ PostgreSQL database provisioned (Supabase or self-hosted)
☐ Administrative access to server/workstation
☐ Backup strategy planned
☐ Network connectivity stable
☐ SSL certificates ready (for production)
```

### Information Gathering

Collect these details before starting:

| Item              | Example                               | Notes                  |
| ----------------- | ------------------------------------- | ---------------------- |
| **Database URL**  | `postgresql://user:pass@host:5432/db` | Connection string      |
| **Supabase URL**  | `https://xxx.supabase.co`             | If using Supabase      |
| **Supabase Keys** | Service role key                      | For backend operations |
| **Frontend URL**  | `https://crm.example.com`             | Production domain      |
| **Email SMTP**    | `smtp.gmail.com:587`                  | For notifications      |
| **Admin Email**   | `admin@example.com`                   | First superadmin       |

## 2.2 Docker Installation

### Verifying Docker

```powershell
# Check Docker is installed
PS C:\> docker --version
Docker version 24.0.6, build ed223bc

# Check Docker Compose
PS C:\> docker-compose --version
Docker Compose version v2.21.0

# Verify Docker is running
PS C:\> docker ps
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

> **💡 TIP**
>
> If Docker commands fail, ensure Docker Desktop is running (Windows/Mac) or the Docker daemon is started (Linux).

### Project Setup

1. **Clone or extract project:**

   ```powershell
   PS C:\> cd C:\Projects
   PS C:\Projects> git clone <repository-url> aishacrm
   PS C:\Projects> cd aishacrm
   ```

2. **Verify project structure:**
   ```
   aishacrm/
   ├── docker-compose.yml      ← Docker orchestration
   ├── Dockerfile              ← Frontend container
   ├── backend/
   │   ├── Dockerfile          ← Backend container
   │   ├── server.js
   │   └── .env.example
   ├── src/                    ← Frontend source
   └── .env.example            ← Root environment
   ```

## 2.3 Environment Configuration

### Root Environment File (.env)

Create `.env` in project root:

```bash
# Copy example file
cp .env.example .env
```

**Essential Configuration:**

```ini
# =============================================
# FRONTEND CONFIGURATION
# =============================================

# Backend API URL (Docker container port)
# 🚨 CRITICAL: Must use port 4001 for Docker
VITE_AISHACRM_BACKEND_URL=http://localhost:4001

# Base44 (for migration/legacy only)
VITE_BASE44_APP_ID=your_app_id_here

# =============================================
# FEATURE FLAGS
# =============================================

# Enable AI features
VITE_ENABLE_AI=true

# Enable document processing
VITE_ENABLE_DOCS=true

# Enable analytics
VITE_ENABLE_ANALYTICS=true

# =============================================
# ENVIRONMENT
# =============================================

# Environment: development, staging, production
NODE_ENV=production
```

> **📝 NOTE**
>
> In Docker, frontend connects to backend via `http://localhost:4001`. The Docker internal network uses different ports, but external access is via 4001.

### Backend Environment File (backend/.env)

Create `backend/.env`:

```ini
# =============================================
# SERVER CONFIGURATION
# =============================================

# Server port (internal Docker port)
PORT=3001

# External frontend URL for CORS
# 🚨 Must match actual frontend access URL
FRONTEND_URL=http://localhost:4000

# Allowed origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:4000,http://localhost:5173

# =============================================
# DATABASE CONFIGURATION
# =============================================

# Option 1: Supabase (Recommended)
USE_SUPABASE_PROD=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Option 2: Direct PostgreSQL
# DATABASE_URL=postgresql://user:password@host:5432/database

# =============================================
# SECURITY CONFIGURATION
# =============================================

# JWT secret for session management
JWT_SECRET=your-secure-random-string-here

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120

# API key for webhook validation (optional)
API_KEY=your-api-key-here

# =============================================
# PRODUCTION SAFETY
# =============================================

# Block mutations in production (safety toggle)
# Set to false to enable write operations
PRODUCTION_READONLY=false

# =============================================
# INTEGRATION SETTINGS (Optional)
# =============================================

# Email service (SendGrid, Mailgun, etc.)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# n8n workflow automation
N8N_HOST=http://n8n:5678
N8N_API_KEY=your-n8n-api-key

# =============================================
# LOGGING & MONITORING
# =============================================

# Log level: error, warn, info, debug
LOG_LEVEL=info

# Enable performance logging
ENABLE_PERFORMANCE_LOGGING=true
```

> **🔒 SECURITY WARNING**
>
> **Never commit .env files to version control!** Use .env.example as a template. Add `.env` to `.gitignore`.

### Environment Variable Validation

Before starting containers, validate configuration:

```powershell
# Check if required variables are set
PS C:\> docker-compose config

# Should show resolved configuration without errors
# If errors appear, fix .env files before proceeding
```

## 2.4 Database Setup

### Option A: Supabase (Recommended)

#### Creating Supabase Project

1. **Sign up at** [supabase.com](https://supabase.com)
2. **Create new project**:
   - Project name: "Aisha CRM"
   - Database password: (generate strong password)
   - Region: (closest to your users)
3. **Copy connection details**:
   - Project URL: `https://xxx.supabase.co`
   - Service role key: (Settings → API)

#### Running Migrations

```powershell
# Navigate to backend
PS C:\> cd backend

# Copy migrations to Supabase
# Option 1: Use Supabase SQL Editor (web interface)
# - Open project in Supabase Dashboard
# - Go to SQL Editor
# - Run migration files in order (001, 002, etc.)

# Option 2: Use migration script
PS C:\backend> node run-migrations.js
```

#### Verifying Database

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected tables:
-- accounts, contacts, leads, opportunities, activities,
-- employees, tenants, users, workflows, etc.
```

### Option B: Self-Hosted PostgreSQL

#### Install PostgreSQL

```powershell
# Windows: Download from postgresql.org
# OR use Docker:
PS C:\> docker run -d `
  --name postgres `
  -e POSTGRES_PASSWORD=yourpassword `
  -e POSTGRES_DB=aishacrm `
  -p 5432:5432 `
  postgres:15-alpine
```

#### Create Database

```sql
-- Connect as postgres user
CREATE DATABASE aishacrm;

-- Create application user
CREATE USER aishacrm_user WITH PASSWORD 'secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE aishacrm TO aishacrm_user;
```

#### Update backend/.env

```ini
USE_SUPABASE_PROD=false
DATABASE_URL=postgresql://aishacrm_user:secure_password@localhost:5432/aishacrm
```

## 2.5 First-Time Configuration

### Building and Starting Containers

> **🚨 CRITICAL: Terminal Location**
>
> **Always verify you're in the project root before running Docker commands!**

```powershell
# 1. VERIFY LOCATION (MANDATORY)
PS C:\> Get-Location
# Should show: C:\path\to\aishacrm

# 2. Navigate if needed
PS C:\> cd C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53

# 3. Build and start containers
PS C:\> docker-compose up -d --build

# Expected output:
# [+] Building 27.5s
# [+] Running 2/2
#  ✔ Container aishacrm-backend   Started
#  ✔ Container aishacrm-frontend  Started
```

### Verifying Installation

```powershell
# Check containers are running
PS C:\> docker ps

# Should show:
# CONTAINER ID   IMAGE                    STATUS         PORTS
# abc123...      aishacrm-backend        Up 2 minutes   0.0.0.0:4001->3001/tcp
# def456...      aishacrm-frontend       Up 2 minutes   0.0.0.0:4000->5173/tcp

# Test backend health
PS C:\> curl http://localhost:4001/health
# {"status":"ok","timestamp":"..."}

# Test frontend (open in browser)
# http://localhost:4000
```

### Container Logs

```powershell
# View backend logs
PS C:\> docker logs aishacrm-backend

# View frontend logs
PS C:\> docker logs aishacrm-frontend

# Follow logs in real-time
PS C:\> docker logs -f aishacrm-backend

# View last 100 lines
PS C:\> docker logs --tail 100 aishacrm-backend
```

### Creating First Superadmin

```powershell
# Option 1: Use creation script
PS C:\> node backend/create-superadmin.js

# Follow prompts:
# Email: admin@example.com
# Password: [enter secure password]
# First Name: System
# Last Name: Administrator

# Option 2: Via API (after backend is running)
PS C:\> Invoke-RestMethod -Uri http://localhost:4001/api/users `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@example.com","password":"SecurePass123!","role":"superadmin"}'
```

✅ **Installation Complete!**

You can now access:

- Frontend: http://localhost:4000
- Backend API: http://localhost:4001
- API Documentation: http://localhost:4001/api-docs

---

# Chapter 3: User Management

## 3.1 Creating Users

### User Creation Methods

#### Method 1: Web Interface

1. Log in as administrator
2. Navigate to **Settings → User Management**
3. Click **Add User**
4. Fill form:
   - Email\* (required, must be unique)
   - First Name\* (required)
   - Last Name\* (required)
   - Role\* (required)
   - Tenant Assignment
5. Click **Send Invitation** or **Create & Set Password**

#### Method 2: API

```powershell
# Create user via API
PS C:\> $body = @{
    email = "john.doe@example.com"
    first_name = "John"
    last_name = "Doe"
    role = "employee"
    tenant_id = "550e8400-e29b-41d4-a716-446655440000"
    send_invitation = $true
} | ConvertTo-Json

PS C:\> Invoke-RestMethod -Uri http://localhost:4001/api/users `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -Headers @{Authorization="Bearer $token"}
```

#### Method 3: Bulk Import

```powershell
# Prepare CSV file (users.csv):
# email,first_name,last_name,role,tenant_id
# user1@example.com,Jane,Smith,employee,uuid-here
# user2@example.com,Bob,Jones,manager,uuid-here

# Import via API
PS C:\> Invoke-RestMethod -Uri http://localhost:4001/api/users/bulk-import `
  -Method POST `
  -InFile "users.csv" `
  -ContentType "multipart/form-data"
```

### User Invitation Flow

```mermaid
sequenceDiagram
    participant Admin
    participant System
    participant Email
    participant NewUser

    Admin->>System: Create user + Send invitation
    System->>Email: Send invitation email
    Email->>NewUser: Deliver invitation
    NewUser->>System: Click invitation link
    System->>NewUser: Show password setup page
    NewUser->>System: Set password
    System->>NewUser: Login successful

    Note over System,NewUser: Invitation expires in 7 days
```

> **📝 NOTE**
>
> Invitation links expire after 7 days. After expiration, resend invitation or manually set password.

## 3.2 User Roles and Permissions

### Role Hierarchy

```
┌─────────────────────────────────────────┐
│  Superadmin (System-wide)               │
│  ✓ All permissions                      │
│  ✓ All tenants                          │
│  ✓ System configuration                 │
└─────────────────────────────────────────┘
           ↓ delegates to
┌─────────────────────────────────────────┐
│  Admin (Tenant-level)                   │
│  ✓ Tenant configuration                 │
│  ✓ User management (within tenant)      │
│  ✓ All CRUD operations                  │
└─────────────────────────────────────────┘
           ↓ delegates to
┌─────────────────────────────────────────┐
│  Manager (Department-level)             │
│  ✓ View all dept records                │
│  ✓ Edit team records                    │
│  ✓ Basic reporting                      │
└─────────────────────────────────────────┘
           ↓ delegates to
┌─────────────────────────────────────────┐
│  Employee (Individual-level)            │
│  ✓ View assigned records                │
│  ✓ Edit own records                     │
│  ✓ Create new records                   │
└─────────────────────────────────────────┘
```

### Permission Matrix

| Action                | Superadmin | Admin | Manager | Employee |
| --------------------- | ---------- | ----- | ------- | -------- |
| **System Config**     | ✅         | ❌    | ❌      | ❌       |
| **Tenant Management** | ✅         | ❌    | ❌      | ❌       |
| **User Management**   | ✅         | ✅\*  | ❌      | ❌       |
| **View All Records**  | ✅         | ✅    | ✅\*\*  | ❌       |
| **Edit All Records**  | ✅         | ✅    | ❌      | ❌       |
| **Edit Team Records** | ✅         | ✅    | ✅      | ❌       |
| **Edit Own Records**  | ✅         | ✅    | ✅      | ✅       |
| **Delete Records**    | ✅         | ✅    | ❌      | ❌       |
| **Export Data**       | ✅         | ✅    | ✅      | ❌       |
| **Advanced Reports**  | ✅         | ✅    | ✅      | ❌       |
| **API Access**        | ✅         | ✅    | ✅      | ✅\*\*\* |

\*Within their tenant only  
**Department records only  
\***Read-only API access

### Custom Permissions

Create fine-grained permissions for specific needs:

```sql
-- Example: Create custom permission
INSERT INTO permissions (name, description, resource, action)
VALUES
  ('view_sensitive_data', 'View financial information', 'accounts', 'read'),
  ('bulk_delete', 'Perform bulk delete operations', '*', 'delete');

-- Assign to role
INSERT INTO role_permissions (role, permission_id)
SELECT 'financial_manager', id
FROM permissions
WHERE name = 'view_sensitive_data';
```

## 3.3 Employee Management

### Employee vs User

**Understanding the Distinction:**

| Aspect          | User                  | Employee                    |
| --------------- | --------------------- | --------------------------- |
| **Scope**       | Global (system-wide)  | Tenant-specific             |
| **Purpose**     | Authentication        | CRM entity                  |
| **Permissions** | Role-based            | Data scope                  |
| **Assignment**  | Records owned by user | Records visible to employee |

```mermaid
graph LR
    A[User Account] -->|Authenticated as| B[Email/Password]
    A -->|Has role| C[Admin/Manager/Employee]
    A -->|Mapped to| D[Employee Record]
    D -->|Belongs to| E[Tenant]
    D -->|Sees records| F[Data Scope]

    style A fill:#4F46E5,color:#fff
    style D fill:#10B981,color:#fff
```

### Creating Employee Records

```powershell
# Create employee (linked to existing user)
$employee = @{
    tenant_id = "550e8400-e29b-41d4-a716-446655440000"
    user_email = "john.doe@example.com"  # Links to user
    first_name = "John"
    last_name = "Doe"
    department = "Sales"
    title = "Account Executive"
    phone = "+1-555-0123"
    status = "active"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:4001/api/employees `
  -Method POST `
  -ContentType "application/json" `
  -Body $employee
```

### Employee Data Scope

Control what data employees can see:

```sql
-- Example: Employee can only see their own records
-- Implemented via Row-Level Security (RLS)

CREATE POLICY employee_own_records ON contacts
FOR SELECT
USING (
  owner_id = current_user_id() OR
  assigned_to = current_user_id()
);

-- Manager sees team records
CREATE POLICY manager_team_records ON contacts
FOR SELECT
USING (
  department = current_user_department() AND
  current_user_role() = 'manager'
);
```

## 3.4 Access Control

### Row-Level Security (RLS)

RLS ensures users only see data they're authorized to access.

#### RLS Architecture

```
Request → Authentication → Role Check → RLS Policies → Data Filter → Response
   ↓            ↓              ↓             ↓             ↓           ↓
  User      JWT Token    Superadmin?   tenant_id =    Only matching   JSON
           Valid?        Admin?         user's          rows
                        Manager?        tenant?         returned
```

#### Enabling RLS

```sql
-- Enable RLS on table
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create policy for tenants
CREATE POLICY tenant_isolation ON contacts
FOR ALL
USING (tenant_id = current_tenant_id());

-- Policy for employees (own records only)
CREATE POLICY employee_access ON contacts
FOR SELECT
USING (
  owner_id = auth.uid() OR
  assigned_to = auth.uid()
);

-- Policy for admins (all tenant records)
CREATE POLICY admin_access ON contacts
FOR ALL
USING (
  tenant_id = current_tenant_id() AND
  is_admin()
);
```

> **🔒 SECURITY BEST PRACTICE**
>
> Always enable RLS on tables containing sensitive data. Test policies thoroughly before production deployment.

### API Access Control

#### API Key Authentication

```powershell
# Generate API key for integration
PS C:\> $apiKey = New-Guid
PS C:\> Write-Output $apiKey

# Store in database
INSERT INTO api_keys (key, tenant_id, name, permissions, expires_at)
VALUES ('550e8400-...', 'tenant-uuid', 'Integration Key', '["read:contacts"]', '2026-01-01');

# Use in requests
Invoke-RestMethod -Uri http://localhost:4001/api/contacts `
  -Headers @{"X-API-Key"="550e8400-..."}
```

#### JWT Token Authentication

```powershell
# Login to get JWT token
$login = @{
    email = "admin@example.com"
    password = "SecurePassword123!"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri http://localhost:4001/api/auth/login `
  -Method POST `
  -ContentType "application/json" `
  -Body $login

$token = $response.token

# Use token in subsequent requests
Invoke-RestMethod -Uri http://localhost:4001/api/contacts `
  -Headers @{Authorization="Bearer $token"}
```

### Rate Limiting

Protect API from abuse:

```ini
# backend/.env
RATE_LIMIT_WINDOW_MS=60000  # 1 minute window
RATE_LIMIT_MAX=120          # 120 requests per minute
AUTH_RATE_LIMIT_MAX=5       # 5 login attempts per minute
```

**Rate Limit Response:**

```json
{
  "status": "error",
  "message": "Too many requests, please try again later.",
  "retryAfter": 60
}
```

---

# Chapter 4: Tenant Management

## 4.1 Multi-Tenant Architecture

### Tenant Isolation Strategy

Aisha CRM uses **schema-based isolation** for complete tenant separation:

```mermaid
graph TB
    subgraph "Application Layer"
        A[Request] --> B[Authentication]
        B --> C[Tenant Resolution]
    end

    subgraph "Database Layer"
        C --> D{Tenant ID}
        D -->|Tenant A| E[Data A]
        D -->|Tenant B| F[Data B]
        D -->|Tenant C| G[Data C]
    end

    subgraph "Security Layer"
        E --> H[RLS Policies]
        F --> H
        G --> H
        H --> I[Filtered Results]
    end

    style C fill:#4F46E5,color:#fff
    style H fill:#EF4444,color:#fff
```

### Tenant Scoping Rules

> **🚨 CRITICAL: UUID-First Tenant Identification**
>
> **Always use tenant UUID for all database operations!** Never use slug or legacy tenant_id.

```
✅ CORRECT: WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'
❌ WRONG:   WHERE tenant_id = 'acme-corp' (slug)
```

**Why UUID-First:**

- UUIDs are globally unique
- Slugs can be changed by users
- UUIDs prevent tenant data leakage
- RLS policies use UUIDs

## 4.2 Creating Tenants

### Tenant Creation Process

```powershell
# Create new tenant
$tenant = @{
    name = "Acme Corporation"
    slug = "acme-corp"          # Auto-generated from name
    status = "active"
    settings = @{
        timezone = "America/New_York"
        currency = "USD"
        date_format = "MM/DD/YYYY"
    }
    metadata = @{
        industry = "Technology"
        company_size = "50-200"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:4001/api/tenants `
  -Method POST `
  -ContentType "application/json" `
  -Body $tenant `
  -Headers @{Authorization="Bearer $superadminToken"}
```

### Tenant Setup Workflow

```mermaid
sequenceDiagram
    participant Admin
    participant System
    participant Database
    participant FirstUser

    Admin->>System: Create tenant
    System->>Database: INSERT tenant record
    System->>Database: Apply RLS policies
    System->>Database: Create default settings
    System->>Admin: Return tenant UUID

    Admin->>System: Create first admin user
    System->>Database: INSERT user + employee
    System->>Database: Assign admin role
    System->>FirstUser: Send invitation email

    FirstUser->>System: Accept invitation
    System->>FirstUser: Grant access
```

### Post-Creation Setup

After creating a tenant:

1. **Create tenant administrator**
2. **Configure settings** (timezone, currency, etc.)
3. **Set up integrations** (email, calendar, etc.)
4. **Import initial data** (if migrating)
5. **Configure modules** (enable/disable features)
6. **Train users**

## 4.3 Tenant Isolation

### Database-Level Isolation

Every query automatically filtered by tenant:

```sql
-- User query (what developer writes)
SELECT * FROM contacts WHERE email LIKE '%@acme.com';

-- Actual query (after RLS applied)
SELECT * FROM contacts
WHERE email LIKE '%@acme.com'
  AND tenant_id = '550e8400-...'  -- ← Automatically added
  AND (                            -- ← Permission check
    owner_id = current_user() OR
    is_admin()
  );
```

### Application-Level Checks

Backend middleware enforces tenant isolation:

```javascript
// backend/middleware/validateTenant.js
export function validateTenantAccess(req, res, next) {
  const { tenant_id } = req.query || req.body;
  const userTenantId = req.user.tenant_id;

  // Superadmin can access any tenant
  if (req.user.role === 'superadmin') {
    return next();
  }

  // Others must match tenant
  if (tenant_id !== userTenantId) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied: Invalid tenant',
    });
  }

  next();
}
```

### Data Segregation Verification

Test tenant isolation:

```sql
-- Verify no cross-tenant data leakage
-- This should return 0 rows
SELECT c1.id as contact_a, c2.id as contact_b
FROM contacts c1
JOIN contacts c2 ON c1.id = c2.id
WHERE c1.tenant_id != c2.tenant_id;

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
-- Should return empty for all tenant-scoped tables
```

> **⚠️ WARNING**
>
> If the above query returns any tables with `rowsecurity = false`, enable RLS immediately:
>
> ```sql
> ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
> ```

## 4.4 Tenant Configuration

### Module Settings

Enable/disable modules per tenant:

```sql
-- Module settings table
INSERT INTO module_settings (tenant_id, module_name, is_enabled, settings)
VALUES
  ('tenant-uuid', 'opportunities', true, '{"stages":["prospect","qualified","proposal","negotiation","closed"]}'),
  ('tenant-uuid', 'workflows', true, '{"max_workflows":50}'),
  ('tenant-uuid', 'document_processing', false, NULL),
  ('tenant-uuid', 'realtime_voice', true, '{"ptt_enabled":true,"auto_play_responses":true}');
```

### Realtime Voice Module

The Realtime Voice module enables AI voice interaction features:

| Setting               | Type    | Default | Description                             |
| --------------------- | ------- | ------- | --------------------------------------- |
| `is_enabled`          | boolean | true    | Enables voice mode toggle in AI sidebar |
| `ptt_enabled`         | boolean | true    | Enables push-to-talk via spacebar       |
| `auto_play_responses` | boolean | true    | Auto-plays TTS for AI responses         |

> **⚠️ NOTE**
>
> Disabling Realtime Voice shows "Realtime Voice disabled by administrator" in the AI sidebar.

### Custom Fields

Add tenant-specific fields:

```sql
-- Custom field definitions
INSERT INTO custom_fields (tenant_id, entity, field_name, field_type, options)
VALUES
  ('tenant-uuid', 'contact', 'referral_source', 'select', '["Website","Referral","Event","Other"]'),
  ('tenant-uuid', 'account', 'annual_contract_value', 'currency', NULL),
  ('tenant-uuid', 'lead', 'qualification_score', 'number', NULL);
```

### Tenant Settings API

```powershell
# Get tenant settings
Invoke-RestMethod -Uri "http://localhost:4001/api/tenants/tenant-uuid"

# Update settings
$settings = @{
    timezone = "America/Los_Angeles"
    currency = "USD"
    date_format = "MM/DD/YYYY"
    modules = @{
        opportunities = $true
        workflows = $true
        document_processing = $false
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4001/api/tenants/tenant-uuid" `
  -Method PUT `
  -ContentType "application/json" `
  -Body $settings
```

### Entity Label Customization

Administrators can rename navigation items (entities) for each tenant. This allows customizing terminology to match business vocabulary (e.g., "Accounts" → "Clients").

#### Accessing Entity Labels

1. Navigate to **Settings → Entity Labels**
2. Select the entity you want to rename (Accounts, Contacts, Leads, Opportunities, Activities)
3. Enter the custom **Plural** and **Singular** labels
4. Click **Save**

#### Per-Tenant Isolation

Each tenant has independent entity labels stored in the `entity_labels` table:

```sql
-- Example: Rename "Accounts" to "Clients" for a specific tenant
INSERT INTO entity_labels (tenant_id, entity_key, custom_label, custom_label_singular)
VALUES ('a11dfb63-4b18-4eb8-872e-747af2e37c46', 'accounts', 'Clients', 'Client');
```

> **Important:** Entity labels are isolated per tenant. Changes to one tenant's labels do not affect other tenants.

#### AI Integration

Custom labels are automatically injected into AI prompts, so the AI Assistant recognizes custom terminology:

- User renames "Accounts" → "Clients"
- User asks: "Show me all my clients"
- AI automatically maps "clients" → accounts → responds using "clients" terminology

See `docs/ENTITY_LABEL_AI_INTEGRATION.md` for technical implementation details.

---

# Chapter 9: Maintenance Operations

## 9.5 Campaign Worker Management

### Overview

The Campaign Worker is a background job processor that executes scheduled AI campaigns (email and call outreach). It runs within the backend process and uses Postgres advisory locks for safe multi-instance deployment.

### Architecture

```mermaid
graph TD
    A[Campaign Worker] -->|Poll every 30s| B[Find Scheduled Campaigns]
    B --> C{Advisory Lock Acquired?}
    C -->|Yes| D[Mark Running]
    C -->|No| E[Skip - Another Worker Processing]
    D --> F[Load Tenant Integration]
    F --> G[Process Contacts]
    G --> H{Campaign Type?}
    H -->|Email| I[Send Emails]
    H -->|Call| J[Trigger AI Calls]
    I --> K[Update Progress]
    J --> K
    K --> L{More Contacts?}
    L -->|Yes| G
    L -->|No| M[Mark Completed/Failed]
    M --> N[Emit Final Webhook]
    N --> O[Release Lock]
```

### Key Features

- **Advisory Locking**: Prevents duplicate processing when scaling horizontally (multiple backend pods/containers)
- **Tenant-Safe**: Validates integration ownership server-side before execution
- **Progress Tracking**: Real-time updates in `metadata.progress`
- **Webhook Emissions**: Optional lifecycle events for n8n/automation
- **Error Resilience**: Failed campaigns don't crash the worker

### Configuration

#### Environment Variables

Add to `backend/.env`:

```env
# Campaign Worker (optional background job execution)
# Enable with true to process scheduled campaigns automatically
CAMPAIGN_WORKER_ENABLED=false
CAMPAIGN_WORKER_INTERVAL_MS=30000

# Webhooks (optional lifecycle event emissions)
# Enable with true to emit webhook calls for campaign/entity events
WEBHOOKS_ENABLED=false
```

**Variable Reference:**

| Variable                      | Default | Description                                           |
| ----------------------------- | ------- | ----------------------------------------------------- |
| `CAMPAIGN_WORKER_ENABLED`     | `false` | Set to `true` to enable background campaign execution |
| `CAMPAIGN_WORKER_INTERVAL_MS` | `30000` | Polling interval in milliseconds (30 seconds)         |
| `WEBHOOKS_ENABLED`            | `false` | Enable webhook emissions for lifecycle events         |

### Enabling the Worker

#### Development/Testing

```powershell
# Edit backend/.env
CAMPAIGN_WORKER_ENABLED=true
WEBHOOKS_ENABLED=true  # Optional for event tracking

# Restart backend container
docker-compose up -d --build backend

# Or for local development
cd backend
npm run dev
```

#### Production Deployment

```powershell
# Set in production environment
export CAMPAIGN_WORKER_ENABLED=true
export CAMPAIGN_WORKER_INTERVAL_MS=30000

# Deploy
docker-compose -f docker-compose.prod.yml up -d backend
```

### Monitoring

#### Log Output

Worker logs include `[CampaignWorker]` prefix:

```
[CampaignWorker] Starting with 30000ms interval
[CampaignWorker] Found 3 pending campaign(s)
[CampaignWorker] Processing campaign abc-123 (Q4 Email Nurture)
[CampaignWorker] Campaign abc-123 finished: completed
```

#### Check Worker Status

```powershell
# View backend logs
docker logs aishacrm-backend --tail 100 --follow | Select-String "CampaignWorker"

# Check for processing errors
docker logs aishacrm-backend 2>&1 | Select-String "CampaignWorker.*error"
```

#### Campaign Progress

Monitor via the Campaign Monitor UI or API:

```powershell
# Get campaign details with progress
$campaign = Invoke-RestMethod -Uri "http://localhost:4001/api/aicampaigns/abc-123?tenant_id=uuid"

# Check progress
$campaign.metadata.progress
# Output: { total: 100, processed: 45, success: 42, failed: 3 }
```

### Execution Flow

#### 1. Polling Phase

Every `CAMPAIGN_WORKER_INTERVAL_MS`:

- Query for campaigns with `status='scheduled'`
- Limit to 10 campaigns per poll
- Order by `created_at ASC` (FIFO)

#### 2. Locking Phase

For each campaign:

- Hash campaign UUID to 32-bit integer
- Acquire Postgres advisory lock: `pg_try_advisory_lock(lock_id)`
- If lock fails, another worker is processing - skip

#### 3. Execution Phase

**Email Campaigns:**

1. Load `ai_email_config.sending_profile_id` from campaign metadata
2. Fetch tenant integration credentials from `tenant_integrations`
3. Validate tenant ownership (reject cross-tenant references)
4. Personalize email template with contact data (`{{first_name}}`, etc.)
5. Send via provider (Gmail/Outlook/Webhook)
6. Update contact status and progress counters

**Call Campaigns:**

1. Load `ai_call_integration_id` from campaign metadata
2. Fetch tenant integration credentials (CallFluent/Thoughtly)
3. Validate tenant ownership
4. Trigger AI call with configured agent/prompt
5. Track call initiation (outcome tracked via provider webhook)

#### 4. Progress Updates

- Emit webhook every 10 contacts: `aicampaign.progress`
- Update `metadata.progress`:
  ```json
  {
    "total": 100,
    "processed": 45,
    "success": 42,
    "failed": 3
  }
  ```

#### 5. Completion Phase

- Set final status: `completed` or `failed`
- Stamp lifecycle: `metadata.lifecycle.completed_at` or `failed_at`
- Emit final webhook: `aicampaign.completed` or `aicampaign.failed`
- Release advisory lock: `pg_advisory_unlock(lock_id)`

### Webhook Events

When `WEBHOOKS_ENABLED=true`, the worker emits:

| Event                  | When                  | Payload                                                           |
| ---------------------- | --------------------- | ----------------------------------------------------------------- |
| `aicampaign.progress`  | Every 10 contacts     | `{ id, status, progress: { total, processed, success, failed } }` |
| `aicampaign.completed` | Successful completion | `{ id, status: 'completed', progress, details }`                  |
| `aicampaign.failed`    | Execution failure     | `{ id, status: 'failed', progress, details: { error } }`          |

Webhooks are read from `webhook` table (tenant-scoped, active, subscribed to event or `*`).

### Troubleshooting

#### Worker Not Starting

**Check configuration:**

```powershell
# Verify env vars
docker exec aishacrm-backend env | Select-String "CAMPAIGN"

# Expected output:
# CAMPAIGN_WORKER_ENABLED=true
# CAMPAIGN_WORKER_INTERVAL_MS=30000
```

**Check logs:**

```powershell
docker logs aishacrm-backend | Select-String "CampaignWorker"

# Should see:
# [CampaignWorker] Starting with 30000ms interval
# [CampaignWorker] Started
```

#### Campaigns Stuck in "Scheduled"

**Possible causes:**

1. **Worker disabled** - Check `CAMPAIGN_WORKER_ENABLED=true`
2. **Lock contention** - Another worker crashed without releasing lock
   ```sql
   -- Force release all advisory locks (use with caution)
   SELECT pg_advisory_unlock_all();
   ```
3. **Invalid integration** - Campaign references missing/inactive integration

   ```sql
   -- Check campaign metadata
   SELECT metadata->>'ai_email_config'
   FROM ai_campaigns WHERE id = 'campaign-uuid';

   -- Verify integration exists and is active
   SELECT * FROM tenant_integrations
   WHERE id = 'integration-id' AND is_active = true;
   ```

#### Execution Errors

**Check error in campaign metadata:**

```sql
SELECT
  id,
  name,
  status,
  metadata->'error' as error_message,
  metadata->'lifecycle'->>'failed_at' as failed_at
FROM ai_campaigns
WHERE status = 'failed';
```

**Common errors:**

- `"No sending profile configured"` - Email campaign missing `ai_email_config.sending_profile_id`
- `"Sending profile not found or inactive"` - Integration ID invalid or `is_active=false`
- `"Unsupported campaign type"` - `metadata.campaign_type` not `email` or `call`
- Provider-specific errors (rate limits, auth failures)

#### High Memory Usage

If processing large campaigns (10,000+ contacts):

1. **Batch processing** - Worker processes contacts sequentially (not batched)
2. **Increase interval** - Reduce polling frequency:
   ```env
   CAMPAIGN_WORKER_INTERVAL_MS=60000  # 1 minute
   ```
3. **Scale horizontally** - Run multiple backend instances (advisory locks prevent duplication)

### Scaling for Production

#### Horizontal Scaling

Advisory locks ensure safe multi-instance deployment:

```yaml
# docker-compose.prod.yml
services:
  backend:
    deploy:
      replicas: 3 # Run 3 backend workers
    environment:
      - CAMPAIGN_WORKER_ENABLED=true
```

Each instance polls independently; only one acquires the lock per campaign.

#### Rate Limiting

To avoid provider rate limits:

1. **Add delay between contacts** - Modify `campaignWorker.js`:

   ```javascript
   // After each contact send
   await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s delay
   ```

2. **Configure provider-specific limits** - Store in `tenant_integrations.credentials`:
   ```json
   {
     "max_emails_per_minute": 30,
     "max_calls_per_hour": 100
   }
   ```

#### Monitoring Recommendations

- **Prometheus metrics** - Expose campaign worker metrics (future enhancement)
- **Alert on failures** - Monitor `status='failed'` count
- **Track throughput** - Log processed contacts per hour
- **Webhook delivery** - Monitor n8n webhook success rates

### Security Considerations

✅ **Enforced by Design:**

- Tenant validation before credential access
- Server-side integration ownership checks
- No cross-tenant references allowed
- Credentials never exposed to frontend

⚠️ **Admin Responsibilities:**

- Rotate integration credentials regularly
- Monitor failed webhook deliveries
- Review `system_logs` for anomalies
- Keep `tenant_integrations` audit trail

---

## 9.6 Call Flow System

### Overview

The Call Flow System processes inbound and outbound call webhooks from telephony providers (Twilio, SignalWire, CallFluent, Thoughtly), automatically creating leads, logging activities, analyzing transcripts with AI, and managing follow-up tasks.

### Architecture

```mermaid
graph TD
    A[Telephony Provider] -->|Webhook| B[Call Flow Handler]
    B --> C{Inbound/Outbound?}

    C -->|Inbound| D[Find/Create Contact]
    C -->|Outbound| E[Validate Contact]

    D --> F[Phone Lookup]
    F -->|Found| G[Existing Contact]
    F -->|Not Found| H[Create Lead]

    E --> I[Log Call Activity]
    G --> I
    H --> I

    I --> J{Transcript Provided?}
    J -->|Yes| K[Analyze with AI]
    J -->|No| L[Basic Logging Only]

    K --> M[Extract Action Items]
    M --> N[Create Formatted Note]
    N --> O[Create Follow-up Activities]
    O --> P[Complete Fulfilled Activities]

    P --> Q[Update Campaign Progress]
    L --> Q
    Q --> R[Emit Webhook]
```

### Key Features

- **Automatic Lead Creation**: Unknown callers become leads with AI-extracted names/emails
- **AI Transcript Analysis**: GPT-4 extracts action items, sentiment, customer requests
- **Smart Activity Management**: Auto-creates follow-up tasks, auto-completes fulfilled actions
- **Campaign Integration**: Tracks outbound call outcomes, updates progress
- **Provider Adapters**: Normalizes webhooks from multiple telephony providers
- **Contact Context Preparation**: Provides AI agents with full contact details and talking points

### Configuration

#### Environment Variables

Add to `backend/.env`:

```env
# Call Flow & Transcript Analysis
USE_BRAID_MCP_TRANSCRIPT_ANALYSIS=true
BRAID_MCP_URL=http://braid-mcp-node-server:8000
TRANSCRIPT_ANALYSIS_MODEL=gpt-4o-mini
```

**Variable Reference:**

| Variable                            | Default                             | Description                                         |
| ----------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `USE_BRAID_MCP_TRANSCRIPT_ANALYSIS` | `false`                             | Enable AI-powered transcript analysis via Braid MCP |
| `BRAID_MCP_URL`                     | `http://braid-mcp-node-server:8000` | Braid MCP Server endpoint                           |
| `TRANSCRIPT_ANALYSIS_MODEL`         | `gpt-4o-mini`                       | OpenAI model for transcript analysis                |

#### Webhook Endpoints

Configure these URLs in your telephony provider dashboard:

**Inbound Calls:**

```
https://your-domain.com/api/telephony/webhook/{provider}/inbound?tenant_id={UUID}
```

**Outbound Calls:**

```
https://your-domain.com/api/telephony/webhook/{provider}/outbound?tenant_id={UUID}
```

**Supported Providers:** `twilio`, `signalwire`, `callfluent`, `thoughtly`

### Monitoring

#### Log Output

Call flow logs include `[CallFlow]` prefix:

```
[CallFlow] Processing inbound call from +15551234567
[CallFlow] Contact not found, creating lead
[CallFlow] Analyzing transcript (342 chars)
[CallFlow] Using Braid MCP AI analysis
[CallFlow] Created 2 action activities
[CallFlow] ✓ Auto-completed activity 123: Send pricing information
```

#### Check Call Activities

```sql
-- Recent call activities
SELECT
    id,
    related_type,
    subject,
    created_at,
    metadata->'call_sid' as call_sid,
    metadata->'duration' as duration,
    metadata->'sentiment' as sentiment
FROM activities
WHERE type = 'call'
ORDER BY created_at DESC
LIMIT 10;
```

#### Check Auto-Created Activities

```sql
-- Auto-created follow-up tasks
SELECT
    id,
    type,
    subject,
    status,
    due_date,
    metadata->'priority' as priority,
    metadata->'auto_created' as auto_created
FROM activities
WHERE metadata->>'auto_created' = 'true'
ORDER BY created_at DESC
LIMIT 20;
```

#### Check Auto-Completed Activities

```sql
-- Activities closed by transcript analysis
SELECT
    id,
    subject,
    status,
    completed_at,
    metadata->'completion_note' as what_was_done,
    metadata->'auto_completed' as auto_completed
FROM activities
WHERE metadata->>'auto_completed' = 'true'
ORDER BY completed_at DESC
LIMIT 20;
```

### AI Transcript Analysis

The system supports two analysis modes:

#### 1. Braid MCP Server (Recommended)

**Benefits:**

- Tenant-specific OpenAI key resolution
- Structured JSON responses
- Better action item extraction
- Redis-backed agent memory
- Unified AI operations interface

**How It Works:**

1. Transcript sent to Braid MCP Server
2. Braid resolves API key (tenant → system → env var)
3. GPT-4o-mini analyzes transcript
4. Returns structured JSON with action items, sentiment, requests
5. System creates notes and activities automatically

#### 2. Pattern Matching (Fallback)

If Braid MCP unavailable, uses regex patterns to extract:

- "send me..." → Email task
- "schedule..." → Meeting task
- "call me back" → Follow-up call
- "I sent..." → Completion detection

### Action Item Extraction

**What Gets Extracted:**

1. **Customer Requests**: "Can you send me pricing?"
2. **Commitments Made**: "I'll email you by Friday"
3. **Action Items**: Tasks with priority (high/medium/low) and type (email/call/meeting)
4. **Fulfilled Actions**: Past-tense actions ("I sent", "I scheduled")
5. **Sentiment**: Positive/neutral/negative

**What Gets Created:**

- **Note**: Formatted summary with action items and emojis
- **Activities**: High/medium priority tasks with due dates
- **Completions**: Matching pending activities marked as complete

### Contact Context Preparation

For outbound AI calls, the system prepares rich context:

```powershell
# Prepare call context
POST /api/telephony/prepare-call
{
  "tenant_id": "uuid",
  "contact_id": "uuid",
  "campaign_id": "uuid"  # Optional
}
```

**Returns:**

- Contact details (name, phone, email, company, title)
- Recent interactions (last 5 activities)
- Campaign script and goals
- **Talking points** (7 personalized conversation prompts)

### Troubleshooting

#### No Transcript Analysis

**Check Braid MCP Status:**

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/health"
```

**Check Logs:**

```powershell
docker logs aishacrm-backend | Select-String "CallFlow.*transcript"
```

**Common Issues:**

- Braid MCP not running: `cd braid-mcp-node-server && docker compose up -d --build`
- No OpenAI key configured
- Transcript field empty in webhook payload

#### Activities Not Auto-Creating

**Check:**

1. Transcript provided in webhook
2. Action items extracted (check note metadata)
3. Priority is high or medium (low doesn't auto-create)

```sql
-- Check action items in notes
SELECT
    content,
    metadata->'action_items' as action_items
FROM notes
WHERE related_id = 'contact-uuid'
ORDER BY created_at DESC
LIMIT 1;
```

#### Activities Not Auto-Completing

**Fulfillment patterns must be present:**

- "I sent..." or "emailed you"
- "I scheduled" or "booked"
- "Following up as promised"

**Check for pending activities:**

```sql
-- Must have pending activity to complete
SELECT * FROM activities
WHERE related_id = 'contact-uuid'
  AND status = 'pending'
  AND type IN ('email', 'call', 'meeting')
ORDER BY created_at DESC;
```

### Security Considerations

✅ **Enforced by Design:**

- Tenant ID required in all webhook URLs
- Phone number validation
- Provider signature verification (production)
- Rate limiting on webhook endpoints

⚠️ **Admin Responsibilities:**

- Configure webhook URLs with correct tenant_id
- Enable webhook signature verification in production
- Monitor for suspicious call patterns
- Review auto-created leads regularly

### Documentation

See also:

- `backend/CALL_FLOW_DOCUMENTATION.md` - Complete technical reference
- `CALL_FLOW_QUICK_TEST.md` - PowerShell test examples
- `CALL_FLOW_IMPLEMENTATION_SUMMARY.md` - Implementation overview

---

## 9.7 Braid MCP Server

### Overview

The Braid MCP Server is a unified AI operations hub that provides a standardized interface for AI interactions across the CRM. It handles LLM operations, CRM data access, web research, and GitHub integration through a Braid v0 framework.

### Architecture

```mermaid
graph TD
    A[Call Flow System] -->|Transcript Analysis| B[Braid MCP Server]
    C[Campaign Worker] -->|AI Operations| B
    D[Frontend AI Tools] -->|Requests| B

    B --> E[LLM Adapter]
    B --> F[CRM Adapter]
    B --> G[Web Adapter]
    B --> H[GitHub Adapter]
    B --> I[Memory Adapter]

    E -->|API Key Resolution| J[Tenant Integrations]
    E -->|Fallback| K[System Settings]
    E -->|Last Resort| L[Environment Variable]

    E -->|Analyze| M[OpenAI GPT-4]
    F -->|Query/Update| N[Supabase Database]
    G -->|Research| O[Wikipedia API]
    H -->|Code Operations| P[GitHub API]
    I -->|Session Memory| Q[Redis/Valkey]
```

### Key Features

- **Unified AI Interface**: Single API for all AI operations
- **Smart Key Resolution**: Automatic tenant-specific OpenAI key selection
- **Multi-Adapter Architecture**: CRM, LLM, Web, GitHub, Memory adapters
- **Redis Memory Layer**: Persistent agent context across conversations
- **Direct Supabase Access**: Optional direct database queries for performance
- **Type-Safe TypeScript**: Comprehensive type definitions

### Configuration

#### Environment Variables

Add to `braid-mcp-node-server/.env`:

```env
# Server Configuration
NODE_ENV=production
PORT=8000

# Backend API (fallback for CRM operations)
CRM_BACKEND_URL=http://backend:3001

# Supabase (direct database access)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
USE_DIRECT_SUPABASE_ACCESS=true

# Redis (agent memory)
REDIS_URL=redis://redis:6379

# OpenAI
DEFAULT_OPENAI_MODEL=gpt-4o-mini

# GitHub
GITHUB_TOKEN=your-github-token
```

**Variable Reference:**

| Variable                     | Default               | Description                              |
| ---------------------------- | --------------------- | ---------------------------------------- |
| `PORT`                       | `8000`                | HTTP server port                         |
| `CRM_BACKEND_URL`            | `http://backend:3001` | Aisha CRM backend URL                    |
| `USE_DIRECT_SUPABASE_ACCESS` | `false`               | Bypass backend, query Supabase directly  |
| `DEFAULT_OPENAI_MODEL`       | `gpt-4o-mini`         | Default LLM model                        |
| `REDIS_URL`                  | -                     | Redis connection string for agent memory |

### Starting the Server

```powershell
# Docker Compose (recommended)
cd braid-mcp-node-server
docker compose up -d --build

# Local development
cd braid-mcp-node-server
npm install
npm run build
npm start

# Check health
Invoke-RestMethod -Uri "http://localhost:8000/health"
# Expected: {"status":"ok","service":"braid-mcp-node-server"}
```

### Adapters

#### LLM Adapter (`system: "llm"`)

OpenAI integration with intelligent API key resolution.

**Supported Operations:**

- `generate-json` - Generate structured JSON from prompts

**Key Resolution Priority:**

1. Explicit `api_key` in payload
2. Tenant integration (`tenant_integrations` table)
3. System settings (`system_settings` table)
4. Environment variable `OPENAI_API_KEY`

**Example:**

```json
POST /mcp/run
{
  "requestId": "req-123",
  "actor": { "id": "system", "type": "system" },
  "actions": [{
    "id": "analyze",
    "system": "llm",
    "resource": { "kind": "generate-json", "id": "1" },
    "verb": "create",
    "payload": {
      "prompt": "Analyze this call transcript...",
      "model": "gpt-4o-mini",
      "temperature": 0.2
    },
    "metadata": { "tenant_id": "uuid" }
  }]
}
```

#### CRM Adapter (`system: "crm"`)

Direct Supabase or backend API access for CRM operations.

**Supported Kinds:**

- `accounts`, `leads`, `contacts`, `opportunities`, `activities`

**Supported Verbs:**

- `read`, `search`, `create`, `update`, `delete`

#### Web Adapter (`system: "web"`)

Wikipedia research for market intelligence.

**Supported Kinds:**

- `wikipedia-search` - Search articles
- `wikipedia-page` - Fetch full content

#### Memory Adapter (`system: "memory"`)

Redis-backed agent memory for multi-turn conversations.

**Supported Operations:**

- Store/retrieve conversation context
- Agent session persistence
- Cross-request memory

### Monitoring

#### Health Check

```powershell
# Server health
Invoke-RestMethod -Uri "http://localhost:8000/health"

# Memory status
Invoke-RestMethod -Uri "http://localhost:8000/memory/status"
```

#### Logs

```powershell
# Docker
docker logs braid-mcp-node-server -f --tail 100

# Look for errors
docker logs braid-mcp-node-server 2>&1 | Select-String "error"
```

#### Performance Metrics

```powershell
# Check container stats
docker stats braid-mcp-node-server

# Check Redis memory usage
docker exec braid-mcp-node-server redis-cli INFO memory
```

### Integration with Call Flow

The call flow system uses Braid MCP for transcript analysis:

1. Call webhook received → `callFlowHandler.js`
2. If `USE_BRAID_MCP_TRANSCRIPT_ANALYSIS=true`:
   - Sends transcript to Braid MCP
   - Braid resolves tenant's OpenAI key
   - GPT-4 analyzes and returns structured JSON
3. Call flow creates notes and activities from AI response
4. Falls back to pattern matching if Braid unavailable

### Troubleshooting

#### Server Won't Start

**Check:**

```powershell
# View logs
docker logs braid-mcp-node-server

# Common issues:
# - Port 8000 already in use
# - Missing environment variables
# - Redis not running
```

**Fix:**

```powershell
# Restart Redis
docker compose up -d redis

# Rebuild and restart
cd braid-mcp-node-server
docker compose up -d --build
```

#### LLM Operations Failing

**Check API Key Resolution:**

```sql
-- Check tenant integration
SELECT * FROM tenant_integrations
WHERE tenant_id = 'uuid'
  AND integration_type = 'openai'
  AND is_active = true;

-- Check system settings
SELECT * FROM system_settings
WHERE setting_key = 'openai_api_key';
```

**Check Logs:**

```powershell
docker logs braid-mcp-node-server | Select-String "OpenAI"
```

#### Memory Layer Unavailable

**Check Redis:**

```powershell
# Test Redis connection
docker exec braid-mcp-node-server redis-cli PING
# Expected: PONG

# Check Redis is running
docker ps | Select-String "redis"
```

### Security Considerations

✅ **Enforced by Design:**

- Tenant validation before database access
- OpenAI API key isolation per tenant
- No cross-tenant data leakage
- Redis memory isolation by tenant_id

⚠️ **Admin Responsibilities:**

- Secure `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- Monitor OpenAI usage per tenant
- Review Redis memory usage
- Rate limit MCP endpoint in production

### Documentation

See also:

- `braid-mcp-node-server/README-braid-mcp-node.md` - Complete reference
- Braid v0 Framework documentation
- OpenAI API documentation

---

# Chapter 10: Troubleshooting

## 10.1 Common Issues

### Docker Container Issues

#### Containers Won't Start

**Problem:** `docker-compose up` fails

✅ **Solutions:**

1. **Check port conflicts:**

   ```powershell
   # Check if ports 4000/4001 are in use
   PS C:\> Get-NetTCPConnection -LocalPort 4000,4001

   # Kill conflicting processes if found
   PS C:\> Stop-Process -Id <PID> -Force
   ```

2. **Verify .env files exist:**

   ```powershell
   PS C:\> Test-Path .env
   PS C:\> Test-Path backend/.env
   ```

3. **Check Docker resources:**
   - Docker Desktop → Settings → Resources
   - Ensure 8GB+ RAM allocated
   - Ensure 50GB+ disk space

4. **View build logs:**
   ```powershell
   PS C:\> docker-compose up --build
   # Review error messages
   ```

#### Backend Container Exits Immediately

**Problem:** Container starts then stops

✅ **Solutions:**

1. **Check backend logs:**

   ```powershell
   PS C:\> docker logs aishacrm-backend
   ```

2. **Common errors:**
   - **Database connection failed**: Check `DATABASE_URL` in `backend/.env`
   - **Missing environment variables**: Verify all required vars set
   - **Port already bound**: Another process using port 3001

3. **Test database connection:**
   ```powershell
   PS C:\> node backend/test-db-connection.js
   ```

> **📝 NOTE**
>
> For ESM-specific debugging, see `backend/TROUBLESHOOTING_NODE_ESM.md`

### Database Connection Issues

#### Can't Connect to Database

**Problem:** "Database connection failed"

✅ **Diagnostic Steps:**

```powershell
# 1. Test network connectivity
PS C:\> Test-NetConnection -ComputerName your-db-host -Port 5432

# 2. Verify credentials
PS C:\> $env:DATABASE_URL
# Check username/password are correct

# 3. Check Supabase project status (if using Supabase)
# Visit: https://app.supabase.com/project/your-project

# 4. Test direct connection
PS C:\> psql $env:DATABASE_URL -c "SELECT 1;"
```

**Common Causes:**

| Error                       | Cause              | Solution                 |
| --------------------------- | ------------------ | ------------------------ |
| **"ECONNREFUSED"**          | DB not running     | Start PostgreSQL service |
| **"Authentication failed"** | Wrong credentials  | Update `backend/.env`    |
| **"ENOTFOUND"**             | Wrong hostname     | Check `DATABASE_URL`     |
| **"SSL required"**          | Missing SSL params | Add `?sslmode=require`   |

#### Slow Database Queries

**Problem:** API responses take >5 seconds

✅ **Investigation:**

```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- Over 1 second
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check missing indexes
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND attname NOT IN (
    SELECT indexdef FROM pg_indexes
  );
```

### Frontend Issues

#### "Cannot connect to backend"

**Problem:** Frontend shows connection error

✅ **Checklist:**

```powershell
# 1. Verify backend is running
PS C:\> curl http://localhost:4001/health

# 2. Check VITE_AISHACRM_BACKEND_URL in .env
PS C:\> cat .env | Select-String "VITE_AISHACRM_BACKEND_URL"
# Should be: http://localhost:4001

# 3. Check CORS settings in backend/.env
PS C:\> cat backend/.env | Select-String "ALLOWED_ORIGINS"
# Should include: http://localhost:4000

# 4. Test API directly
PS C:\> Invoke-RestMethod http://localhost:4001/api/status
```

#### Page Loads Blank/White Screen

**Problem:** Frontend displays blank page

✅ **Solutions:**

1. **Check browser console** (F12)
   - Look for JavaScript errors
   - Note any failed network requests

2. **Clear cache:**
   - Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Or clear browser data

3. **Rebuild frontend:**

   ```powershell
   PS C:\> docker-compose up -d --build frontend
   ```

4. **Check frontend logs:**
   ```powershell
   PS C:\> docker logs aishacrm-frontend
   ```

## 10.2 Diagnostic Tools

### Health Check Endpoints

```powershell
# Backend health
PS C:\> Invoke-RestMethod http://localhost:4001/health
# Response: {"status":"ok","timestamp":"..."}

# System status (detailed)
PS C:\> Invoke-RestMethod http://localhost:4001/api/status
# Response: {"status":"success","data":{"backend":"ok","database":"ok",...}}

# Database diagnostics
PS C:\> Invoke-RestMethod -Method POST http://localhost:4001/api/system/diagnostics
# Response: Connection stats, query performance, etc.
```

### Log Analysis

```powershell
# View recent logs
PS C:\> docker logs --tail 100 aishacrm-backend

# Follow logs in real-time
PS C:\> docker logs -f aishacrm-backend

# Search for errors
PS C:\> docker logs aishacrm-backend 2>&1 | Select-String -Pattern "error|ERROR"

# Export logs to file
PS C:\> docker logs aishacrm-backend > backend-logs.txt
```

### Performance Monitoring

```powershell
# Check container resource usage
PS C:\> docker stats aishacrm-backend aishacrm-frontend

# View performance metrics
PS C:\> Invoke-RestMethod http://localhost:4001/api/system/metrics
# Response: CPU, memory, request counts, etc.
```

## 10.3 Log Analysis

### Log Levels

```
ERROR   - Critical issues requiring immediate attention
WARN    - Important issues that don't stop operation
INFO    - General informational messages
DEBUG   - Detailed debugging information
```

### Common Log Patterns

#### Authentication Failures

```
[ERROR] Authentication failed for user@example.com - Invalid credentials
```

**Action:** Check user password, verify account not locked

#### Database Errors

```
[ERROR] Database query failed: relation "contacts" does not exist
```

**Action:** Run migrations, verify database schema

#### Rate Limiting

```
[WARN] Rate limit exceeded for IP 192.168.1.100
```

**Action:** Normal if legitimate high traffic, investigate if suspicious

## 10.4 Emergency Procedures

### Service Outage

```mermaid
graph TD
    A[Service Down] --> B{Can access server?}
    B -->|Yes| C[Check container status]
    B -->|No| D[Network/DNS issue]

    C --> E{Containers running?}
    E -->|No| F[Restart containers]
    E -->|Yes| G[Check logs]

    F --> H{Started successfully?}
    H -->|No| I[Check .env files]
    H -->|Yes| J[Monitor]

    G --> K{Found error?}
    K -->|Yes| L[Fix error & restart]
    K -->|No| M[Escalate]

    style A fill:#EF4444,color:#fff
    style J fill:#10B981,color:#fff
```

### Emergency Restart

```powershell
# 🚨 NUCLEAR OPTION: Stop everything and restart fresh
PS C:\> docker-compose down
PS C:\> Start-Sleep -Seconds 2
PS C:\> docker-compose up -d --build
```

### Database Recovery

```powershell
# Restore from backup
PS C:\> psql $env:DATABASE_URL < backup-2025-11-15.sql

# Verify restoration
PS C:\> psql $env:DATABASE_URL -c "SELECT COUNT(*) FROM contacts;"
```

### Rollback Procedures

```powershell
# 1. Pull previous version
PS C:\> git log --oneline  # Find previous commit
PS C:\> git checkout <commit-hash>

# 2. Rebuild containers
PS C:\> docker-compose down
PS C:\> docker-compose up -d --build

# 3. Restore database if schema changed
PS C:\> psql $env:DATABASE_URL < backup-before-upgrade.sql
```

---

# Chapter 13: C.A.R.E. v1 - Autonomous Relationship Management

## 13.1 C.A.R.E. Overview

### What is C.A.R.E.?

**C.A.R.E. (Cognitive Adaptive Response Engine)** is AiSHA's autonomous relationship management system that maintains customer relationship momentum without requiring constant human supervision.

**C.A.R.E.** stands for:

- **Communication** – maintaining presence and responsiveness
- **Acquisition** – moving intent toward commitment
- **Retention** – preventing decay before loss occurs
- **Engagement** – sustaining relationship value between events

### Key Principles

1. **Behavioral Focus**: C.A.R.E. manages relationship behaviors, not just database states
2. **Autonomous Operation**: The system detects issues and takes action without manual intervention
3. **Safety First**: All autonomous actions are gated by policy checks and kill switches
4. **Audit Everything**: Every decision and action is logged for transparency

### Architecture Overview

```mermaid
graph TB
    A[Call Flow Handler] --> B[Escalation Detector]
    C[AI Triggers Worker] --> B
    B --> D{Policy Gate}
    D -->|ALLOWED| E[State Engine]
    D -->|BLOCKED| F[Audit Log Only]
    E --> G[State Persistence]
    E --> H[Workflow Triggers]
    H --> I[External Workflows]
    G --> J[Audit Logs]
    F --> J
```

### Components

| Component               | Purpose                                      | Location                                        |
| ----------------------- | -------------------------------------------- | ----------------------------------------------- |
| **Kill Switch**         | Emergency stop for autonomous operations     | `backend/lib/care/isCareEnabled.js`             |
| **State Engine**        | Manages C.A.R.E. state transitions           | `backend/lib/care/careStateEngine.js`           |
| **Escalation Detector** | Identifies when intervention is needed       | `backend/lib/care/escalationDetector.js`        |
| **Policy Gate**         | Controls what autonomous actions are allowed | `backend/lib/care/carePolicyGate.js`            |
| **Action Classifier**   | Determines origin of actions                 | `backend/lib/care/actionOriginClassifier.js`    |
| **Workflow Triggers**   | Invokes external workflow systems            | `backend/lib/care/careWorkflowTriggerClient.js` |

---

## 13.2 Kill Switch Configuration

### Purpose

The C.A.R.E. kill switch provides an emergency stop mechanism for all autonomous operations. When disabled, the system returns to read-only mode with zero risk.

### Configuration

**Environment Variable**: `CARE_ENABLED`

```bash
# Enable C.A.R.E. autonomous operations
CARE_ENABLED=true

# Disable C.A.R.E. (emergency stop)
CARE_ENABLED=false
```

**Default**: `false` (disabled for safety)

### Behavior When Disabled

When `CARE_ENABLED=false`:

- ✅ Escalation detection **still runs** (monitoring continues)
- ✅ Audit logs **still written** (visibility maintained)
- ❌ No autonomous actions taken (safe read-only mode)
- ❌ No state transitions
- ❌ No workflow triggers

### Checking Kill Switch Status

```bash
# Via backend logs
docker logs aishacrm-backend | grep "CARE_ENABLED"

# Via API (if exposed)
curl http://localhost:4001/api/care/status
```

### Emergency Shutdown Procedure

```bash
# 1. Set kill switch in .env
CARE_ENABLED=false

# 2. Restart backend
docker compose restart backend

# 3. Verify in logs
docker logs aishacrm-backend --tail=50 | grep "\[CARE_AUDIT\]"
# Should see: action_skipped entries instead of action_candidate
```

---

## 13.3 State Engine and Transitions

### C.A.R.E. States

The state engine manages behavioral states for customer relationships:

| State       | Description            | Typical Duration | Exit Conditions       |
| ----------- | ---------------------- | ---------------- | --------------------- |
| **cold**    | No recent engagement   | N/A              | First interaction     |
| **warm**    | Recent contact made    | Days-weeks       | Follow-up scheduled   |
| **hot**     | Active negotiation     | Hours-days       | Deal closes or stalls |
| **won**     | Successfully converted | Permanent        | Account created       |
| **lost**    | Relationship ended     | Permanent        | Marked unrecoverable  |
| **nurture** | Long-term engagement   | Weeks-months     | Engagement resumes    |
| **stale**   | Momentum lost          | N/A              | Re-engagement attempt |

### State Transitions

```mermaid
stateDiagram-v2
    [*] --> cold
    cold --> warm: First Contact
    warm --> hot: Engagement
    hot --> won: Conversion
    hot --> lost: Rejection
    warm --> nurture: Extended Timeline
    warm --> stale: No Response
    nurture --> warm: Re-engagement
    stale --> lost: Failed Recovery
    won --> [*]
    lost --> [*]
```

### Database Schema

States are stored in the `care_states` table:

```sql
CREATE TABLE care_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL, -- 'lead', 'contact', 'account', 'opportunity'
    entity_id UUID NOT NULL,
    current_state TEXT NOT NULL, -- 'cold', 'warm', 'hot', etc.
    previous_state TEXT,
    transitioned_at TIMESTAMPTZ DEFAULT NOW(),
    transition_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Monitoring State Transitions

```sql
-- View recent state transitions
SELECT
    entity_type,
    entity_id,
    previous_state,
    current_state,
    transition_reason,
    transitioned_at
FROM care_states
WHERE tenant_id = 'YOUR_TENANT_UUID'
ORDER BY transitioned_at DESC
LIMIT 20;
```

---

## 13.4 Escalation Detection

### What is an Escalation?

An **escalation** occurs when the system detects a relationship issue that requires intervention:

- Negative sentiment in communication
- Extended silence from prospect
- Deal stagnation
- Overdue follow-up activities

### Escalation Sources

#### 1. Call Flow Escalations

Detected during inbound/outbound calls:

```javascript
// Example: Negative sentiment detection
{
  is_escalation: true,
  trigger_type: 'negative_sentiment',
  reason: 'Customer expressed frustration during call',
  sentiment: 'negative',
  confidence: 0.85
}
```

**Configuration**:

```bash
# Sentiment threshold (0.0-1.0)
CARE_SENTIMENT_THRESHOLD=0.5
```

#### 2. AI Trigger Escalations

Detected by scheduled checks:

| Trigger              | Condition                           | Default Threshold |
| -------------------- | ----------------------------------- | ----------------- |
| **Lead Stagnant**    | No activity for N days              | 7 days            |
| **Deal Decay**       | High-value deal inactive            | 3 days            |
| **Activity Overdue** | Task past due date                  | 1 day             |
| **Opportunity Hot**  | High probability, no recent contact | 2 days            |

**Configuration**:

```bash
CARE_LEAD_STAGNANT_DAYS=7
CARE_DEAL_DECAY_DAYS=3
CARE_ACTIVITY_OVERDUE_THRESHOLD=1
CARE_OPPORTUNITY_HOT_DAYS=2
```

### Escalation Detector Logic

Location: `backend/lib/care/escalationDetector.js`

```javascript
function detectEscalation({
  text, // Communication text
  sentiment, // Sentiment score
  entity_type, // 'lead', 'contact', etc.
  last_contact, // Date of last interaction
  metadata, // Additional context
}) {
  // Returns: { is_escalation, reason, trigger_type, confidence }
}
```

### Viewing Escalations

```sql
-- Query escalation audit logs
SELECT
    event_type,
    entity_type,
    entity_id,
    reason,
    metadata->>'trigger_type' as trigger,
    created_at
FROM care_audit_log
WHERE event_type = 'ESCALATION_DETECTED'
AND tenant_id = 'YOUR_TENANT_UUID'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 13.5 Policy Gate System

### Purpose

The **Policy Gate** determines whether an autonomous action is allowed to proceed based on:

- Current C.A.R.E. state
- Action origin (human vs autonomous)
- Tenant-specific rules
- System-wide safety constraints

### Policy Results

```javascript
CarePolicyGateResult = {
  ALLOWED: 'allowed', // Action permitted
  BLOCKED: 'blocked', // Action denied
  WARN: 'warn', // Allowed with warning
  DEFER: 'defer', // Requires human approval
};
```

### Default Policy Rules

| Action        | State      | Origin     | Result  |
| ------------- | ---------- | ---------- | ------- |
| Send message  | Any        | Human      | ALLOWED |
| Send message  | cold/stale | Autonomous | BLOCKED |
| Send message  | warm/hot   | Autonomous | ALLOWED |
| Update state  | Any        | Autonomous | ALLOWED |
| Delete entity | Any        | Autonomous | BLOCKED |

### Configuration

**Environment Variable**: `CARE_POLICY_MODE`

```bash
# Strict mode (default): Block risky autonomous actions
CARE_POLICY_MODE=strict

# Permissive mode: Allow more autonomous actions
CARE_POLICY_MODE=permissive

# Read-only mode: Block all autonomous writes
CARE_POLICY_MODE=readonly
```

### Custom Policy Rules

Edit `backend/lib/care/carePolicyGate.js`:

```javascript
function evaluatePolicy({
  action_type, // 'send_message', 'update_state', etc.
  action_origin, // 'human' | 'care_autonomous'
  current_state, // C.A.R.E. state
  entity_type, // 'lead', 'contact', etc.
  tenant_id, // For tenant-specific rules
}) {
  // Custom logic here
  return CarePolicyGateResult.ALLOWED;
}
```

### Monitoring Policy Decisions

```sql
-- View blocked autonomous actions
SELECT
    metadata->>'action_origin' as origin,
    metadata->>'policy_gate_result' as decision,
    reason,
    COUNT(*) as count
FROM care_audit_log
WHERE event_type IN ('ACTION_ALLOWED', 'ACTION_BLOCKED')
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY origin, decision, reason
ORDER BY count DESC;
```

---

## 13.6 Workflow Webhook Triggers

### Purpose

When C.A.R.E. detects an escalation, it can trigger external workflow systems (Pabbly, Thoughtly, CallFluent, n8n) to handle the response.

### Architecture

```mermaid
sequenceDiagram
    participant CD as C.A.R.E. Detector
    participant PG as Policy Gate
    participant WT as Workflow Trigger
    participant WH as Webhook Endpoint
    participant WS as Workflow System

    CD->>PG: Escalation Detected
    PG->>PG: Check Policy
    PG-->>WT: ALLOWED
    WT->>WT: Generate HMAC Signature
    WT->>WH: POST /webhook (signed)
    WH->>WS: Route to appropriate system
    WS-->>Customer: Take action
```

### Configuration

**Environment Variables**:

```bash
# Enable workflow triggers (default: false)
CARE_WORKFLOW_TRIGGERS_ENABLED=true

# Webhook endpoint URL
CARE_WORKFLOW_ESCALATION_WEBHOOK_URL=https://your-workflow-server.com/webhook

# HMAC-SHA256 secret for request signing
CARE_WORKFLOW_WEBHOOK_SECRET=<generate-with-crypto>

# HTTP timeout in milliseconds (default: 3000)
CARE_WORKFLOW_WEBHOOK_TIMEOUT_MS=3000

# Max retry attempts (default: 2)
CARE_WORKFLOW_WEBHOOK_MAX_RETRIES=2
```

### Generating Webhook Secret

```bash
# Generate secure HMAC secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Webhook Payload Contract

```json
{
  "event_id": "escalation-1234567890-abc123",
  "type": "care.escalation_detected",
  "ts": "2026-01-24T10:30:00.000Z",
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "entity_type": "lead",
  "entity_id": "uuid-here",
  "action_origin": "care_autonomous",
  "reason": "Lead stagnant for 7+ days",
  "policy_gate_result": "allowed",
  "trigger_type": "lead_stagnant",
  "meta": {
    "days_stagnant": 7,
    "last_contact": "2026-01-17T10:30:00.000Z"
  }
}
```

### Security: HMAC Signature Verification

Webhooks include `X-AISHA-SIGNATURE` header for verification:

```javascript
// Verify signature (Node.js example)
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}
```

### Workflow System Integration Examples

#### n8n Webhook Node

```json
{
  "nodes": [
    {
      "type": "n8n-nodes-base.webhook",
      "name": "C.A.R.E. Webhook",
      "parameters": {
        "path": "care-escalation",
        "responseMode": "lastNode",
        "authentication": "headerAuth"
      }
    }
  ]
}
```

#### Pabbly Connect

1. Create new workflow
2. Add "Webhook" trigger
3. Use webhook URL in `CARE_WORKFLOW_ESCALATION_WEBHOOK_URL`
4. Add signature verification step
5. Route to Thoughtly/CallFluent based on `trigger_type`

### Monitoring Workflow Triggers

```sql
-- View recent workflow trigger attempts
SELECT
    metadata->>'event_id' as event_id,
    metadata->>'trigger_type' as trigger,
    metadata->>'http_status' as status,
    metadata->>'attempt' as attempt,
    created_at
FROM care_audit_log
WHERE metadata->>'action_type' = 'workflow_trigger'
ORDER BY created_at DESC
LIMIT 100;
```

### Troubleshooting Webhook Failures

```bash
# Check backend logs for webhook errors
docker logs aishacrm-backend | grep "Workflow trigger failed"

# Common issues:
# 1. CARE_WORKFLOW_TRIGGERS_ENABLED=false (disabled)
# 2. Invalid URL in CARE_WORKFLOW_ESCALATION_WEBHOOK_URL
# 3. Network timeout (increase CARE_WORKFLOW_WEBHOOK_TIMEOUT_MS)
# 4. Signature mismatch (verify CARE_WORKFLOW_WEBHOOK_SECRET matches receiver)
```

---

## 13.7 Audit Logging and Monitoring

### Audit Log Table

All C.A.R.E. decisions and actions are logged to `care_audit_log`:

```sql
CREATE TABLE care_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    event_type TEXT NOT NULL, -- 'ESCALATION_DETECTED', 'ACTION_ALLOWED', etc.
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action_origin TEXT, -- 'human' | 'care_autonomous'
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Event Types

| Event Type            | Description              | When Logged           |
| --------------------- | ------------------------ | --------------------- |
| `ESCALATION_DETECTED` | Issue identified         | Every escalation      |
| `ACTION_ALLOWED`      | Policy gate approved     | When action proceeds  |
| `ACTION_BLOCKED`      | Policy gate denied       | When action blocked   |
| `STATE_TRANSITION`    | C.A.R.E. state changed   | Every state change    |
| `WORKFLOW_TRIGGERED`  | External webhook invoked | Every webhook attempt |

### Monitoring Queries

```sql
-- Escalation rate over time
SELECT
    DATE(created_at) as date,
    COUNT(*) as escalations
FROM care_audit_log
WHERE event_type = 'ESCALATION_DETECTED'
AND tenant_id = 'YOUR_TENANT_UUID'
AND created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Action approval rate
SELECT
    event_type,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM care_audit_log
WHERE event_type IN ('ACTION_ALLOWED', 'ACTION_BLOCKED')
AND tenant_id = 'YOUR_TENANT_UUID'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type;

-- Most common escalation reasons
SELECT
    reason,
    metadata->>'trigger_type' as trigger,
    COUNT(*) as count
FROM care_audit_log
WHERE event_type = 'ESCALATION_DETECTED'
AND tenant_id = 'YOUR_TENANT_UUID'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY reason, trigger
ORDER BY count DESC
LIMIT 10;
```

### Log Retention

Default: 90 days

```sql
-- Clean up old audit logs (run monthly)
DELETE FROM care_audit_log
WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## 13.8 Configuration Reference

### Complete Environment Variables

```bash
# ============================================================================
# C.A.R.E. v1 Configuration
# ============================================================================

# Master kill switch (default: false for safety)
CARE_ENABLED=false

# Policy mode: strict | permissive | readonly (default: strict)
CARE_POLICY_MODE=strict

# Escalation detection thresholds
CARE_SENTIMENT_THRESHOLD=0.5          # 0.0-1.0 (lower = more sensitive)
CARE_LEAD_STAGNANT_DAYS=7             # Days before lead considered stagnant
CARE_DEAL_DECAY_DAYS=3                # Days before deal considered decaying
CARE_ACTIVITY_OVERDUE_THRESHOLD=1     # Days before task considered overdue
CARE_OPPORTUNITY_HOT_DAYS=2           # Days for hot opportunity check

# Workflow webhook triggers (default: disabled)
CARE_WORKFLOW_TRIGGERS_ENABLED=false
CARE_WORKFLOW_ESCALATION_WEBHOOK_URL=https://your-workflow.com/webhook
CARE_WORKFLOW_WEBHOOK_SECRET=<generate-with-crypto>
CARE_WORKFLOW_WEBHOOK_TIMEOUT_MS=3000
CARE_WORKFLOW_WEBHOOK_MAX_RETRIES=2

# Audit log retention (days)
CARE_AUDIT_LOG_RETENTION_DAYS=90
```

### Recommended Production Settings

```bash
# Enable with strict safety
CARE_ENABLED=true
CARE_POLICY_MODE=strict
CARE_WORKFLOW_TRIGGERS_ENABLED=true

# Conservative thresholds
CARE_SENTIMENT_THRESHOLD=0.4
CARE_LEAD_STAGNANT_DAYS=10
CARE_DEAL_DECAY_DAYS=5
```

### Testing/Staging Settings

```bash
# Enable with verbose logging
CARE_ENABLED=true
CARE_POLICY_MODE=permissive
CARE_WORKFLOW_TRIGGERS_ENABLED=false  # Use test webhook URL
CARE_LEAD_STAGNANT_DAYS=1             # Faster escalations for testing
```

---

## 13.9 Troubleshooting C.A.R.E.

### Issue: C.A.R.E. Not Taking Actions

**Symptoms**: Escalations detected but no autonomous actions

**Diagnosis**:

```bash
# 1. Check kill switch
docker exec aishacrm-backend printenv | grep CARE_ENABLED
# Should be: CARE_ENABLED=true

# 2. Check audit logs for blocked actions
docker exec aishacrm-backend psql $DATABASE_URL -c \
  "SELECT event_type, reason, COUNT(*)
   FROM care_audit_log
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY event_type, reason;"
```

**Solutions**:

- Verify `CARE_ENABLED=true` in `.env`
- Check policy mode isn't set to `readonly`
- Review policy gate rules for overly strict blocking

### Issue: Workflow Webhooks Failing

**Symptoms**: `Workflow trigger failed` in logs

**Diagnosis**:

```bash
# Check configuration
docker exec aishacrm-backend printenv | grep CARE_WORKFLOW

# Check backend logs
docker logs aishacrm-backend --tail=100 | grep "workflow"
```

**Solutions**:

- Verify `CARE_WORKFLOW_TRIGGERS_ENABLED=true`
- Test webhook URL manually: `curl -X POST https://your-webhook-url`
- Check network connectivity from container
- Verify HMAC secret matches between AiSHA and receiver
- Increase timeout if network is slow: `CARE_WORKFLOW_WEBHOOK_TIMEOUT_MS=5000`

### Issue: Too Many Escalations

**Symptoms**: Escalations triggered constantly

**Diagnosis**:

```sql
-- Check escalation rate
SELECT
    DATE(created_at) as date,
    COUNT(*) as escalations
FROM care_audit_log
WHERE event_type = 'ESCALATION_DETECTED'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 7;
```

**Solutions**:

- Increase thresholds: `CARE_LEAD_STAGNANT_DAYS=14`
- Raise sentiment threshold: `CARE_SENTIMENT_THRESHOLD=0.6`
- Review escalation logic in `escalationDetector.js`

### Issue: State Not Updating

**Symptoms**: C.A.R.E. states remain unchanged

**Diagnosis**:

```sql
-- Check state transition history
SELECT entity_type, current_state, COUNT(*)
FROM care_states
WHERE updated_at > NOW() - INTERVAL '24 hours'
GROUP BY entity_type, current_state;
```

**Solutions**:

- Verify state engine is invoked (check audit logs for `STATE_TRANSITION`)
- Check database permissions for `care_states` table
- Review state transition logic in `careStateEngine.js`

### Emergency Procedures

#### Full System Stop

```bash
# 1. Disable C.A.R.E.
CARE_ENABLED=false

# 2. Restart backend
docker compose restart backend

# 3. Verify shutdown
docker logs aishacrm-backend --tail=20 | grep CARE_ENABLED
```

#### Audit Log Analysis

```sql
-- Last 100 C.A.R.E. events
SELECT
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as time,
    event_type,
    entity_type,
    reason,
    metadata->>'action_origin' as origin,
    metadata->>'policy_gate_result' as decision
FROM care_audit_log
ORDER BY created_at DESC
LIMIT 100;
```

---

## 13.10 C.A.R.E. Workflow Integration Examples

### Overview

C.A.R.E. escalations can trigger AiSHA workflows in two ways:

1. **External Workflows** (Pabbly, n8n, Zapier) - Recommended for production
2. **Internal AiSHA Workflows** - For routing, enrichment, and internal automation

Both approaches honor the behavioral contract: **backend never messages customers directly**.

---

### Pattern 1: External Workflow System (Production)

#### Architecture

```mermaid
sequenceDiagram
    participant CARE as C.A.R.E. Detector
    participant EXT as External Workflow
    participant MSG as Messaging System
    participant CUST as Customer

    CARE->>EXT: POST /webhook (escalation)
    EXT->>EXT: Route by trigger_type
    EXT->>MSG: Trigger Thoughtly/CallFluent
    MSG->>CUST: Phone call / SMS / Email
    CUST-->>MSG: Response
    MSG-->>EXT: Update
    EXT-->>CARE: Optional status callback
```

#### Setup (Pabbly Connect Example)

**Step 1: Create Pabbly Workflow**

1. Go to Pabbly Connect dashboard
2. Create New Workflow: "AiSHA C.A.R.E. Handler"
3. Add Webhook trigger
4. Copy webhook URL (e.g., `https://connect.pabbly.com/workflow/sendwebhookdata/ABC123`)

**Step 2: Configure AiSHA**

```bash
# .env
CARE_WORKFLOW_TRIGGERS_ENABLED=true
CARE_WORKFLOW_ESCALATION_WEBHOOK_URL=https://connect.pabbly.com/workflow/sendwebhookdata/ABC123
CARE_WORKFLOW_WEBHOOK_SECRET=<generate-32-byte-hex>
```

**Step 3: Add Pabbly Routing Logic**

In Pabbly, add Router step:

- **Route 1**: `trigger_type` = "lead_stagnant" → Send to Thoughtly (AI call)
- **Route 2**: `trigger_type` = "negative_sentiment" → Send to CallFluent (urgent call)
- **Route 3**: `trigger_type` = "deal_decay" → Send email via SendGrid
- **Route 4**: `trigger_type` = "activity_overdue" → Create Slack notification

**Step 4: Verify Signature (Security)**

Add Pabbly action before routing:

```javascript
// Webhook Data Parser
const crypto = require('crypto');
const receivedSig = request.headers['x-aisha-signature'];
const secret = 'YOUR_WEBHOOK_SECRET';
const expectedSig = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(request.body))
  .digest('hex');

if (receivedSig !== expectedSig) {
  throw new Error('Invalid signature');
}
```

---

### Pattern 2: Internal AiSHA Workflow (Routing Layer)

Use AiSHA's workflow system as a **routing and enrichment layer** before calling external services.

#### Why Internal Workflows?

- **Enrich escalation data** before sending to external system
- **Apply tenant-specific routing rules**
- **Log additional audit trail**
- **Transform payload format** for different external systems
- **Add conditional logic** (e.g., only escalate high-value leads)

#### Example: Lead Stagnant Handler

**Visual Workflow:**

```
┌─────────────────────┐
│  webhook_trigger    │  (receives C.A.R.E. payload)
│  Type: Entry        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  condition          │  trigger_type === "lead_stagnant"
│  Type: Logic        │
└──────┬──────────────┘
       │ TRUE
       ▼
┌─────────────────────┐
│  get_lead           │  Fetch lead details from DB
│  Type: CRUD         │  Input: {{payload.entity_id}}
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  condition          │  lead.value > 10000
│  Type: Logic        │
└──────┬──────────────┘
       │ TRUE
       ▼
┌─────────────────────┐
│  http_request       │  POST to Thoughtly (AI call)
│  Type: Action       │  URL: https://thoughtly.com/api/call
└─────────────────────┘
       │ FALSE
       ▼
┌─────────────────────┐
│  http_request       │  POST to SendGrid (email)
│  Type: Action       │  URL: https://api.sendgrid.com/v3/mail/send
└─────────────────────┘
```

#### Step-by-Step Setup

**Step 1: Create Workflow in AiSHA**

1. Navigate to **Workflows** in AiSHA
2. Click **Create Workflow**
3. Name: "C.A.R.E. Lead Stagnant Handler"
4. Description: "Routes stagnant leads to Thoughtly or email based on value"

**Step 2: Build Workflow Nodes**

**Node 1: Webhook Trigger** (auto-created)

```json
{
  "id": "trigger-1",
  "type": "webhook_trigger",
  "config": {}
}
```

- This node receives the C.A.R.E. payload
- Available variables: `{{payload.entity_id}}`, `{{payload.trigger_type}}`, `{{payload.meta.days_stagnant}}`

**Node 2: Condition - Check Trigger Type**

```json
{
  "id": "condition-1",
  "type": "condition",
  "config": {
    "field": "{{payload.trigger_type}}",
    "operator": "equals",
    "value": "lead_stagnant"
  }
}
```

- Ensures workflow only processes lead stagnant escalations
- Prevents execution for other escalation types

**Node 3: Get Lead (CRUD)**

```json
{
  "id": "get-lead-1",
  "type": "get_lead",
  "config": {
    "lead_id": "{{payload.entity_id}}"
  }
}
```

- Fetches full lead details from database
- Populates `{{lead}}` variable with: name, email, phone, value, etc.

**Node 4: Condition - Check Lead Value**

```json
{
  "id": "condition-2",
  "type": "condition",
  "config": {
    "field": "{{lead.value}}",
    "operator": "greater_than",
    "value": "10000"
  }
}
```

- Routes high-value leads (>$10k) to AI calling system
- Routes low-value leads to email nurture

**Node 5a: HTTP Request - Thoughtly AI Call** (TRUE branch)

```json
{
  "id": "http-thoughtly-1",
  "type": "http_request",
  "config": {
    "method": "POST",
    "url": "https://api.thoughtly.com/v1/calls",
    "headers": [
      { "key": "Authorization", "value": "Bearer {{env.THOUGHTLY_API_KEY}}" },
      { "key": "Content-Type", "value": "application/json" }
    ],
    "body_type": "raw",
    "body": "{\"to\": \"{{lead.phone}}\", \"from\": \"+1234567890\", \"script\": \"Hi {{lead.first_name}}, this is AiSHA. I noticed you haven't heard from us in {{payload.meta.days_stagnant}} days. Just checking in on your interest in our solution.\"}"
  }
}
```

- Triggers Thoughtly AI phone call
- Uses lead phone number and personalized script
- Script includes escalation context (days stagnant)

**Node 5b: HTTP Request - SendGrid Email** (FALSE branch)

```json
{
  "id": "http-sendgrid-1",
  "type": "http_request",
  "config": {
    "method": "POST",
    "url": "https://api.sendgrid.com/v3/mail/send",
    "headers": [
      { "key": "Authorization", "value": "Bearer {{env.SENDGRID_API_KEY}}" },
      { "key": "Content-Type", "value": "application/json" }
    ],
    "body_type": "raw",
    "body": "{\"personalizations\": [{\"to\": [{\"email\": \"{{lead.email}}\"}]}], \"from\": {\"email\": \"hello@yourcompany.com\"}, \"subject\": \"Still interested?\", \"content\": [{\"type\": \"text/plain\", \"value\": \"Hi {{lead.first_name}},\\n\\nIt's been {{payload.meta.days_stagnant}} days since we last connected. Just wanted to see if you're still interested in learning more about our solution.\\n\\nBest,\\nThe Team\"}]}"
  }
}
```

- Sends nurture email via SendGrid
- Uses lead email and personalized message
- Includes escalation context

**Step 3: Configure C.A.R.E. to Use Internal Workflow**

Once workflow is saved, you'll get a workflow ID (e.g., `wf_abc123`).

```bash
# .env
CARE_WORKFLOW_TRIGGERS_ENABLED=true
CARE_WORKFLOW_ESCALATION_WEBHOOK_URL=http://localhost:4001/api/workflows/wf_abc123/execute
CARE_WORKFLOW_WEBHOOK_SECRET=internal-workflow-secret-123
```

**Note**: For internal workflows, signature verification is optional but recommended for consistency.

**Step 4: Test the Integration**

```bash
# Simulate a lead stagnant escalation (from backend shell)
curl -X POST http://localhost:4001/api/workflows/wf_abc123/execute \
  -H "Content-Type: application/json" \
  -H "X-AISHA-SIGNATURE: <generate-hmac>" \
  -d '{
    "event_id": "test-123",
    "type": "care.escalation_detected",
    "tenant_id": "your-tenant-uuid",
    "entity_type": "lead",
    "entity_id": "your-lead-uuid",
    "trigger_type": "lead_stagnant",
    "meta": { "days_stagnant": 7 }
  }'
```

**Expected flow:**

1. Workflow receives payload at webhook_trigger
2. Condition checks `trigger_type === "lead_stagnant"` → TRUE
3. get_lead fetches lead from database
4. Condition checks `lead.value > 10000`
   - If TRUE → Thoughtly call initiated
   - If FALSE → SendGrid email sent
5. Execution log stored in `workflow_execution` table

---

### Advanced Example: Multi-Tenant Routing

Route escalations to different external systems based on tenant configuration.

**Workflow Design:**

```
webhook_trigger
   ↓
get_tenant (fetch tenant settings)
   ↓
condition (tenant.metadata.messaging_provider)
   ├─ "thoughtly" → http_request (Thoughtly API)
   ├─ "callfluent" → http_request (CallFluent API)
   └─ "email" → http_request (SendGrid API)
```

**Implementation:**

**Node: Get Tenant**

```json
{
  "type": "get_tenant",
  "config": {
    "tenant_id": "{{payload.tenant_id}}"
  }
}
```

**Node: Condition by Provider**

```json
{
  "type": "condition",
  "config": {
    "field": "{{tenant.metadata.messaging_provider}}",
    "operator": "equals",
    "value": "thoughtly"
  }
}
```

**Tenant Configuration** (in tenant metadata):

```json
{
  "messaging_provider": "thoughtly",
  "thoughtly_api_key": "sk-abc123",
  "thoughtly_phone_number": "+1234567890"
}
```

---

### Monitoring Internal Workflows

```sql
-- View recent C.A.R.E. workflow executions
SELECT
    we.id,
    we.workflow_id,
    w.name as workflow_name,
    we.status,
    we.trigger_payload->>'trigger_type' as care_trigger,
    we.trigger_payload->>'entity_type' as entity_type,
    we.started_at,
    we.completed_at
FROM workflow_execution we
JOIN workflow w ON w.id = we.workflow_id
WHERE we.trigger_payload->>'type' = 'care.escalation_detected'
ORDER BY we.started_at DESC
LIMIT 50;

-- Execution success rate for C.A.R.E. workflows
SELECT
    status,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM workflow_execution
WHERE trigger_payload->>'type' = 'care.escalation_detected'
AND started_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

---

### Best Practices

#### 1. **Use Internal Workflows for Routing, External for Messaging**

✅ **Good**: Internal workflow enriches data and routes to Pabbly → Thoughtly  
❌ **Bad**: Internal workflow tries to send SMS directly (violates contract)

#### 2. **Always Include Signature Verification**

Even for internal workflows, verify HMAC signature to prevent spoofing.

#### 3. **Add Logging Nodes**

```json
{
  "type": "log_message",
  "config": {
    "message": "C.A.R.E. escalation routed to Thoughtly for {{lead.email}}"
  }
}
```

#### 4. **Handle Errors Gracefully**

Add error handling nodes:

```
http_request (Thoughtly)
   ├─ SUCCESS → log_success
   └─ ERROR → http_request (fallback to email)
```

#### 5. **Monitor Execution Metrics**

Set up alerts for:

- Workflow execution failures (>10% error rate)
- Slow execution times (>5 seconds)
- Missing trigger payloads (malformed C.A.R.E. events)

---

### Troubleshooting Internal Workflows

#### Issue: Workflow Not Executing

**Check:**

```sql
-- Verify workflow exists and is active
SELECT id, name, status FROM workflow WHERE id = 'wf_abc123';
-- status should be 'active'
```

**Solution:**

```bash
# Activate workflow via API
curl -X PATCH http://localhost:4001/api/workflows/wf_abc123 \
  -H "Content-Type: application/json" \
  -d '{"is_active": true}'
```

#### Issue: Variables Not Resolving

**Symptoms**: `{{payload.entity_id}}` appears as literal string in output

**Cause**: Variable context not populated correctly

**Fix**: Check trigger payload in execution log:

```sql
SELECT trigger_payload, execution_log
FROM workflow_execution
WHERE id = 'exec_xyz789';
```

Ensure `trigger_payload` contains the C.A.R.E. escalation data.

---

# Appendix A: Environment Variables

## Complete Environment Variable Reference

### Root .env (Frontend Configuration)

| Variable                    | Type    | Required | Example                 | Description                    |
| --------------------------- | ------- | -------- | ----------------------- | ------------------------------ |
| `VITE_AISHACRM_BACKEND_URL` | URL     | Yes      | `http://localhost:4001` | Backend API URL (Docker port)  |
| `VITE_BASE44_APP_ID`        | String  | No       | `app_xyz123`            | Base44 app ID (migration only) |
| `VITE_ENABLE_AI`            | Boolean | No       | `true`                  | Enable AI features             |
| `VITE_ENABLE_DOCS`          | Boolean | No       | `true`                  | Enable document processing     |
| `VITE_ENABLE_ANALYTICS`     | Boolean | No       | `true`                  | Enable analytics               |
| `NODE_ENV`                  | String  | No       | `production`            | Environment mode               |

### backend/.env (Backend Configuration)

#### Server Settings

| Variable          | Type   | Required | Default                 | Description                     |
| ----------------- | ------ | -------- | ----------------------- | ------------------------------- |
| `PORT`            | Number | No       | `3001`                  | Internal container port         |
| `FRONTEND_URL`    | URL    | Yes      | `http://localhost:4000` | Frontend URL for CORS           |
| `ALLOWED_ORIGINS` | String | Yes      | `http://localhost:4000` | Comma-separated allowed origins |

#### Database Settings

| Variable                    | Type    | Required      | Example                               | Description                       |
| --------------------------- | ------- | ------------- | ------------------------------------- | --------------------------------- |
| `USE_SUPABASE_PROD`         | Boolean | No            | `true`                                | Use Supabase vs direct PostgreSQL |
| `SUPABASE_URL`              | URL     | If Supabase   | `https://xxx.supabase.co`             | Supabase project URL              |
| `SUPABASE_SERVICE_ROLE_KEY` | String  | If Supabase   | `eyJ...`                              | Service role key                  |
| `DATABASE_URL`              | URL     | If PostgreSQL | `postgresql://user:pass@host:5432/db` | Direct PostgreSQL connection      |

#### Security Settings

| Variable               | Type    | Required | Default | Description                                     |
| ---------------------- | ------- | -------- | ------- | ----------------------------------------------- |
| `JWT_SECRET`           | String  | Yes      | -       | Secret for JWT signing (generate strong random) |
| `API_KEY`              | String  | No       | -       | API key for webhooks                            |
| `RATE_LIMIT_WINDOW_MS` | Number  | No       | `60000` | Rate limit window (milliseconds)                |
| `RATE_LIMIT_MAX`       | Number  | No       | `120`   | Max requests per window                         |
| `AUTH_RATE_LIMIT_MAX`  | Number  | No       | `5`     | Max auth attempts per window                    |
| `PRODUCTION_READONLY`  | Boolean | No       | `false` | Block write operations (safety toggle)          |

#### Integration Settings

| Variable      | Type   | Required | Example           | Description           |
| ------------- | ------ | -------- | ----------------- | --------------------- |
| `SMTP_HOST`   | String | No       | `smtp.gmail.com`  | Email server hostname |
| `SMTP_PORT`   | Number | No       | `587`             | Email server port     |
| `SMTP_USER`   | String | No       | `user@gmail.com`  | Email username        |
| `SMTP_PASS`   | String | No       | `app-password`    | Email password        |
| `N8N_HOST`    | URL    | No       | `http://n8n:5678` | n8n automation URL    |
| `N8N_API_KEY` | String | No       | -                 | n8n API key           |

#### Logging Settings

| Variable                     | Type    | Required | Default | Description                         |
| ---------------------------- | ------- | -------- | ------- | ----------------------------------- |
| `LOG_LEVEL`                  | String  | No       | `info`  | Log level: error, warn, info, debug |
| `ENABLE_PERFORMANCE_LOGGING` | Boolean | No       | `true`  | Enable query performance logging    |

---

# Appendix B: API Endpoints

## Complete API Reference

### System Endpoints

| Method | Endpoint                  | Description            | Auth Required |
| ------ | ------------------------- | ---------------------- | ------------- |
| GET    | `/health`                 | Simple health check    | No            |
| GET    | `/api/status`             | Detailed system status | No            |
| POST   | `/api/system/diagnostics` | Run diagnostics        | Yes           |
| GET    | `/api/system/metrics`     | Performance metrics    | Yes           |

### Authentication Endpoints

| Method | Endpoint                    | Description             | Auth Required |
| ------ | --------------------------- | ----------------------- | ------------- |
| POST   | `/api/auth/login`           | User login              | No            |
| POST   | `/api/auth/logout`          | User logout             | Yes           |
| POST   | `/api/auth/refresh`         | Refresh JWT token       | Yes           |
| POST   | `/api/auth/forgot-password` | Request password reset  | No            |
| POST   | `/api/auth/reset-password`  | Complete password reset | No            |

### User Management

| Method | Endpoint                    | Description     | Auth Required |
| ------ | --------------------------- | --------------- | ------------- |
| GET    | `/api/users`                | List users      | Yes (Admin)   |
| GET    | `/api/users/:id`            | Get user by ID  | Yes           |
| POST   | `/api/users`                | Create user     | Yes (Admin)   |
| PUT    | `/api/users/:id`            | Update user     | Yes           |
| DELETE | `/api/users/:id`            | Delete user     | Yes (Admin)   |
| POST   | `/api/users/sync-from-auth` | Sync from auth  | Yes           |
| POST   | `/api/users/heartbeat`      | Update presence | Yes           |

_[Complete endpoint list continues...]_

---

# Appendix D: Troubleshooting Flowcharts

## Service Won't Start Flowchart

```mermaid
graph TD
    A[Service Won't Start] --> B{Docker running?}
    B -->|No| C[Start Docker Desktop]
    B -->|Yes| D{.env files exist?}

    D -->|No| E[Create from .env.example]
    D -->|Yes| F{Ports available?}

    F -->|No| G[Stop conflicting services]
    F -->|Yes| H{Enough resources?}

    H -->|No| I[Increase Docker resources]
    H -->|Yes| J{Build errors?}

    J -->|Yes| K[Check logs, fix errors]
    J -->|No| L[Check database connection]

    L --> M{Database reachable?}
    M -->|No| N[Fix database/network]
    M -->|Yes| O[Escalate to developer]

    C --> B
    E --> D
    G --> F
    I --> H
    K --> J
    N --> M

    style A fill:#EF4444,color:#fff
    style O fill:#F59E0B,color:#000
```

---

**End of System Administrator Guide**

For additional technical documentation, see:

- [User Guide](AISHA_CRM_USER_GUIDE.md)
- [Developer Technical Manual](AISHA_CRM_DEVELOPER_MANUAL.md)
- [Security & Compliance Manual](AISHA_CRM_SECURITY_MANUAL.md)
- [Database Administration Manual](AISHA_CRM_DATABASE_MANUAL.md)

---

_Document Version: 2.0_  
_Last Updated: November 15, 2025_  
_© 2025 Aisha CRM. All rights reserved._
