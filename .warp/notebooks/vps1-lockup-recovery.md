# VPS-1 Lockup Recovery Runbook

When VPS-1 (Staging) wedges under CPU load. Manual reboot is the proven
recovery; this notebook walks the verification afterward so you don't
declare "fixed" prematurely.

## 1. Confirm it's actually locked (vs slow / network blip)

```sh
ssh -o ConnectTimeout=10 ${SSH_USER}@${STAGING_HOST} 'uptime'
```

If this hangs >15s or returns a connection error, it's locked. Proceed.

If it returns normal uptime + load, it's not locked — investigate something
else (Cloudflare, Coolify, app errors).

## 2. Reboot

Run the `aisha staging reboot` workflow, or manually:

```sh
ssh ${SSH_USER}@${STAGING_HOST} 'sudo reboot' || true
```

Wait 90 seconds for boot + Docker daemon + container restart policies.

```sh
sleep 90
```

## 3. Verify server is back

```sh
ssh -o ConnectTimeout=15 ${SSH_USER}@${STAGING_HOST} 'uptime'
```

Should show fresh uptime (<2 min). If it hangs again, the host is still
locked — repeat reboot, or escalate (Zap support, consider Hetzner migration).

## 4. Verify slice is active

```sh
ssh ${SSH_USER}@${STAGING_HOST} 'systemctl is-active aishacrm.slice && systemctl status aishacrm.slice --no-pager | head -10'
```

Must print `active`. If `inactive` or `failed`:

```sh
ssh ${SSH_USER}@${STAGING_HOST} 'sudo systemctl start aishacrm.slice && sudo systemctl status aishacrm.slice --no-pager | head -10'
```

## 5. Verify all 7 staging containers came up under the slice

```sh
ssh ${SSH_USER}@${STAGING_HOST} 'systemctl status aishacrm.slice --no-pager | grep -c "docker-.*\.scope"'
```

Should print 7 or more (7 staging services + Coolify infra). If <7, find
the missing container in Coolify dashboard and click Redeploy.

## 6. Spot-check public endpoints

```sh
curl -sI -o /dev/null -w "staging-app: %{http_code}\n" https://staging-app.aishacrm.com/
curl -sI -o /dev/null -w "staging-api: %{http_code}\n" https://staging-api.aishacrm.com/health
```

Both should return 200. If 502/503, the cloudflared tunnel can see the
host but services aren't responding yet — wait 60s and retry.

## 7. Log the recovery

```sh
ssh ${SSH_USER}@${STAGING_HOST} 'last -x reboot | head -3'
```

Note the new boot timestamp. If reboots are happening more frequently
than ~6h apart, the slice isn't holding the load and the next move is
either tightening CPUQuota to 450% or migrating to Hetzner.
