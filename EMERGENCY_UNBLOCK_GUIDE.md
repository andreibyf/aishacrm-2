# 🚨 Emergency IP Unblock Guide

## When to Use This Guide

You need this if:
- You're locked out of your Aisha CRM production instance
- You see errors like "IP address temporarily blocked due to suspicious activity"
- You have SSH access to the VPS but can't access the web UI
- The Security Monitor is inaccessible because your IP is blocked

## Quick Recovery Steps

### Option 1: Clear All IP Blocks (Fastest)

```bash
# SSH to your VPS
ssh andreibyf@147.189.173.237

# Navigate to app directory
cd /opt/aishacrm

# Clear all IP blocks from Redis
docker exec aishacrm-redis-memory redis-cli --scan --pattern "idr:blocked:*" | xargs docker exec aishacrm-redis-memory redis-cli DEL

# Restart backend to clear in-memory blocks
docker restart aishacrm-backend

# Wait 10 seconds for backend to restart
sleep 10

# Test access
curl http://localhost:4001/health
```

After this, you have access again. **Proceed immediately to Option 4 to prevent re-blocking.**

### Option 2: Unblock Specific IP

```bash
# SSH to VPS
ssh andreibyf@147.189.173.237
cd /opt/aishacrm

# Find your blocked IP
docker exec aishacrm-redis-memory redis-cli KEYS "idr:blocked:*"
# Example output: idr:blocked:203.0.113.42

# View block details
docker exec aishacrm-redis-memory redis-cli GET "idr:blocked:203.0.113.42"

# Remove specific IP block
docker exec aishacrm-redis-memory redis-cli DEL "idr:blocked:203.0.113.42"

# Restart backend
docker restart aishacrm-backend
```

### Option 3: Use Emergency Unblock API (v1.0.17+)

If you've deployed v1.0.17 and configured `IDR_EMERGENCY_SECRET`:

```bash
# From any machine with curl (replace with your values)
curl -X POST https://app.aishacrm.com/api/security/emergency-unblock \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_EMERGENCY_SECRET","ip":"YOUR_BLOCKED_IP"}'
```

To find your current IP:
```bash
curl https://api.ipify.org
```

### Option 4: Add Your IP to Whitelist (Prevents Future Blocks)

**Do this IMMEDIATELY after unblocking to prevent re-blocking:**

```bash
# SSH to VPS
ssh andreibyf@147.189.173.237
cd /opt/aishacrm

# Get your current IP (from another machine)
# Visit: https://whatismyipaddress.com/
# Or: curl https://api.ipify.org

# Edit docker-compose.prod.yml
nano docker-compose.prod.yml

# Add to backend environment section:
# environment:
#   - IDR_WHITELIST_IPS=203.0.113.42,198.51.100.0  # Your IP(s)
#   - IDR_EMERGENCY_SECRET=your_generated_secret_here

# Generate emergency secret (optional but recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Restart to apply changes
docker-compose -f docker-compose.prod.yml up -d --build backend
```

## Understanding the Lockout

### Why Did This Happen?

1. **Production Safety Guard** blocks writes to production database
2. Missing exemptions caused 403 errors on system endpoints
3. Frontend retried failed requests → 100+ 403s per minute
4. **Intrusion Detection (IDR)** detected excessive failures (>50/min)
5. IDR auto-blocked your IP for 5 minutes
6. Block prevented ALL requests, including UI access

### How to Prevent Future Lockouts

1. **Whitelist your admin IP** (Option 4 above)
2. **Set emergency secret** for API-based unblocking
3. **Monitor Security Monitor** at `/settings` → Security tab
4. **Test changes in staging** before production deployment
5. **Keep multiple admin IPs whitelisted** (office, home, VPN)

## Version-Specific Notes

### v1.0.13 - v1.0.16 (Current Deployed)
- **No whitelist feature** - manual Redis clearing only
- **No emergency API** - SSH access required
- Block duration: 15 minutes (older versions), 5 minutes (v1.0.16+)
- Use Options 1 or 2 above

### v1.0.17+ (New Features)
- **IP Whitelist** - Add trusted IPs via `IDR_WHITELIST_IPS`
- **Emergency API** - Unblock via `/api/security/emergency-unblock`
- **Lenient thresholds** - 50 failures/min (was 10)
- **Shorter blocks** - 5 minutes (was 15)
- Use Option 3 or 4 above

## Troubleshooting

### "docker exec: command not found"
You're not in the correct directory or Docker isn't running:
```bash
cd /opt/aishacrm
docker ps  # Should show aishacrm-* containers
```

### "Error: No such container"
Backend container isn't running:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### "Still blocked after clearing Redis"
Backend has in-memory cache of blocks:
```bash
docker restart aishacrm-backend
sleep 10  # Wait for restart
```

### "Can't find my IP in blocked list"
Your IP may have changed (dynamic IP) or block expired:
```bash
# Check current IP
curl https://api.ipify.org

# Check all blocks
docker exec aishacrm-redis-memory redis-cli KEYS "idr:blocked:*"
```

### "Emergency API returns 403"
The API itself isn't blocked - your secret is wrong:
```bash
# Check your .env or docker-compose.prod.yml for IDR_EMERGENCY_SECRET
grep IDR_EMERGENCY_SECRET /opt/aishacrm/.env
```

## Customer Lockout Support

If a **customer** reports being blocked:

1. **Ask them to wait 5 minutes** - blocks auto-expire
2. **Check Security Monitor** at `/settings` → Security tab
3. **Manually unblock** via UI "Unblock" button
4. **Investigate root cause**:
   - Check system logs for their IP
   - Look for repeated 403s or errors
   - Verify they're not behind shared proxy/VPN (multiple users, one IP)
5. **Consider whitelisting** if legitimate high-usage customer

## Emergency Contact

If you're still locked out after trying all options:

1. Reach out to Base44 support: app@base44.com
2. Check Aisha CRM Slack/Discord for community help
3. Review `backend/logs/` on VPS for error details

## Post-Recovery Checklist

After regaining access:

- [ ] Add your IP to `IDR_WHITELIST_IPS`
- [ ] Set `IDR_EMERGENCY_SECRET` for future emergencies
- [ ] Deploy v1.0.17 if not already deployed
- [ ] Test Security Monitor shows blocks correctly
- [ ] Document this incident (what caused the lockout?)
- [ ] Update runbooks with your specific IP addresses
- [ ] Set up monitoring alerts for IP blocks

## Related Documentation

- `docs/SECURITY_IMPLEMENTATION_SUMMARY.md` - IDR architecture
- `backend/middleware/intrusionDetection.js` - IDR code
- `src/components/settings/SecurityMonitor.jsx` - Security UI
- `.github/copilot-instructions.md` - Project conventions
