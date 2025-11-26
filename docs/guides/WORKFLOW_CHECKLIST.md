# Development Workflow Checklist

## ✅ Starting Your Work Session

### Step 1: Verify Directory
```powershell
Get-Location
# Expected: C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
```

### Step 2: Start All Services
```powershell
.\start-all.ps1
# This terminal is now OCCUPIED - don't use it for other commands
```

### Step 3: Open NEW Terminal
- In VS Code: Press `Ctrl+Shift+`` (backtick)
- Or use Terminal menu → New Terminal
- **This is your WORK terminal**

### Step 4: Verify Services Running
```powershell
# In your NEW terminal:
Get-Location  # Verify you're in project root

# Check backend
curl http://localhost:3001/health

# Check frontend (in browser)
# Open: http://localhost:5173
```

## ✅ Making Changes

### Backend Changes
1. Edit files in `backend/routes/`, `backend/lib/`, etc.
2. Save → Auto-restart happens (~1 second)
3. Watch terminal for "Restarting..." message
4. Test your changes

### Frontend Changes
1. Edit files in `src/components/`, `src/pages/`, etc.
2. Save → Browser updates instantly
3. No reload needed (HMR)
4. Check browser for changes

## ✅ Running Commands

### BEFORE Every Command:
```powershell
Get-Location  # Always verify first!
```

### Database Operations
```powershell
# Must be in PROJECT ROOT
Get-Location
.\clear-test-data.ps1 -KeepTenants
```

### Password Reset
```powershell
# Must be in PROJECT ROOT
Get-Location
.\reset-password.ps1 -Email admin2025@temp.com
```

### Check Status
```powershell
# Must be in PROJECT ROOT
Get-Location
.\status.ps1
```

## ✅ Common Mistakes to Avoid

| ❌ Wrong | ✅ Right |
|---------|---------|
| Assume you're in project root | Run `Get-Location` first |
| Use same terminal after start-all.ps1 | Open NEW terminal |
| Run scripts from backend directory | Navigate to root first |
| Forget to verify location | Always verify before command |

## ✅ Quick Reference Card

```
┌────────────────────────────────────────────────────┐
│  BEFORE EVERY COMMAND:                             │
│                                                    │
│  1. Get-Location   ← Where am I?                   │
│  2. Navigate        ← If needed                    │
│  3. Get-Location   ← Verify again                  │
│  4. Execute         ← Now run command              │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  TERMINAL USAGE:                                   │
│                                                    │
│  Terminal 1: Backend   (occupied)                  │
│  Terminal 2: Frontend  (occupied)                  │
│  Terminal 3: Your Work (NEW - open after startup)  │
└────────────────────────────────────────────────────┘
```

## ✅ End of Day Shutdown

```powershell
# In your WORK terminal (not the occupied ones):
Get-Location  # Verify you're in project root
.\stop-all.ps1
```

## ✅ Troubleshooting

### "File not found" or "Command not found"
**Cause:** Wrong directory  
**Fix:**
```powershell
Get-Location  # Check where you are
cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
Get-Location  # Verify you're in root
```

### "Cannot execute command" or terminal hangs
**Cause:** Using occupied terminal  
**Fix:** Open NEW terminal (Ctrl+Shift+`)

### Backend not responding
**Cause:** Crashed or not started  
**Fix:**
```powershell
Get-Location  # Verify in project root
.\stop-all.ps1
.\start-all.ps1
# Open NEW terminal for testing
```

---

**🎯 Remember:** 5 seconds to `Get-Location` saves 5 minutes debugging!
