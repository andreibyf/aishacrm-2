# VPS-2 Deployment Guide

## Overview

This guide covers deploying non-core AiSHA services to VPS-2 (147.189.168.164) to reduce CPU load on VPS-1.

**Services migrated:**

- Cal.com + PostgreSQL (scheduling)
- Ollama (local LLM)
- Hawser (Docker monitoring for Dockhand)

**Services remaining on VPS-1:**

- Frontend, Backend, Redis (2x), LiteLLM, Braid MCP
- aisha-comms (needs Redis on VPS-1, only 0.1 CPU)

## Prerequisites

1. **Doppler secrets** - Get from VPS-1:

   ```bash
   ssh andreibyf@147.189.173.237
   cat /opt/aishacrm/.env | grep -E 'CALCOM_|HAWSER_'
   ```

2. **Hawser token** - Get from https://dockhand.dev
   - Login → Servers → Add Server → Copy token

3. **VPS-2 access**:
   ```bash
   ssh root@147.189.168.164
   ```

## Deployment Steps

### Step 1: Copy files to VPS-2

```bash
# From local machine
scp docker-compose.vps2.yml root@147.189.168.164:/opt/aishacrm/
scp .env.vps2 root@147.189.168.164:/opt/aishacrm/.env
```

### Step 2: Deploy services on VPS-2

```bash
ssh root@147.189.168.164
cd /opt/aishacrm
docker compose -f docker-compose.vps2.yml up -d
```

### Step 3: Verify containers

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Expected output:

- `aishacrm-calcom` - Up, port 3002
- `aishacrm-calcom-db` - Up
- `aishacrm-ollama` - Up, port 11434
- `hawser` - Up, port 8080

### Step 4: Load Ollama model

```bash
docker exec aishacrm-ollama ollama pull llama3.1:8b
docker exec aishacrm-ollama ollama list
```

### Step 5: Configure VPS-1 to use VPS-2 Ollama

Update Doppler config for VPS-1 LiteLLM:

```bash
# In Doppler prd_prd config
OLLAMA_BASE_URL=http://147.189.168.164:11434
```

Then redeploy LiteLLM on VPS-1 (if using Ollama for any features).

### Step 6: Verify Hawser in Dockhand

1. Go to https://dockhand.dev
2. Navigate to Servers
3. You should see VPS-2 appear with container metrics

### Step 7: Test Cal.com

```bash
# Check health
curl -I http://147.189.168.164:3002/auth/login

# Should return 200 OK
```

Then test via public URL: https://scheduler.aishacrm.com

## Verification Checklist

- [ ] All 3 containers running on VPS-2
- [ ] Cal.com accessible at https://scheduler.aishacrm.com
- [ ] Ollama responds: `curl http://147.189.168.164:11434/api/tags`
- [ ] Hawser visible in Dockhand dashboard
- [ ] Ollama model loaded: `llama3.1:8b`
- [ ] VPS-1 CPU load reduced (check with `uptime`)

## Networking Notes

**Cal.com webhooks:**

- Webhooks go to https://app.aishacrm.com/api/scheduler/webhook
- Works from anywhere (public URL)

**Ollama access:**

- LiteLLM on VPS-1 connects to http://147.189.168.164:11434
- Firewall: Port 11434 must be open on VPS-2

**Coolify proxy routing:**

- If using Coolify on VPS-2 for SSL termination, configure domain routing:
  - scheduler.aishacrm.com → http://aishacrm-calcom:3000

## Rollback Procedure

If issues arise, restart services on VPS-1:

```bash
ssh andreibyf@147.189.173.237
cd /opt/aishacrm
docker compose -f docker-compose.prod.yml up -d calcom calcom-db
```

## Monitoring

**VPS-2 resources:**

```bash
ssh root@147.189.168.164
uptime  # Check CPU load (should stay under 2.0)
free -h  # Check memory (3.5GB total)
docker stats --no-stream
```

**VPS-1 CPU reduction:**

```bash
ssh andreibyf@147.189.173.237
uptime  # Should drop from 8.0 to ~4-5 after migration
docker ps  # Should only show 8-9 containers
```
