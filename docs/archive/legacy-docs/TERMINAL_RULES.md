# 🚨 TERMINAL & DIRECTORY RULES

## MANDATORY - FOLLOW EVERY TIME

### Rule #1: Verify Directory BEFORE Every Command

**ALWAYS run this first:**
```powershell
Get-Location
```

**Never assume where you are.** Verify first, every time.

### Rule #2: Use Separate Terminals

```
Terminal 1: Backend Server (occupied by npm run dev)
Terminal 2: Frontend Server (occupied by npm run dev)  
Terminal 3: Your Commands (NEW terminal - spawn after starting services)
```

**Why?** Background processes block the terminal. You need a fresh terminal for additional commands.

### Rule #3: Directory Navigation Pattern

```powershell
# Step 1: Check where you are
Get-Location

# Step 2: Navigate if needed
cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53

# Step 3: Verify you're in the right place
Get-Location

# Step 4: Execute command
.\your-script.ps1
```

## Common Mistakes ❌

1. **Running commands without checking directory**
   - Result: File not found, script errors, wasted time
   - Fix: `Get-Location` first, navigate, then run

2. **Trying to run commands in occupied terminal**
   - Result: Command never executes, confusion
   - Fix: Open NEW terminal (Ctrl+Shift+` in VS Code)

3. **Assuming you're in project root**
   - Result: "Cannot find path" errors
   - Fix: ALWAYS verify with `Get-Location`

## Quick Reference

### Starting Services
```powershell
# In project root (verify first!)
Get-Location
.\start-all.ps1

# Then open NEW terminal for other work
```

### Backend Commands
```powershell
# Verify directory first
Get-Location

# Navigate to backend
cd backend

# Verify you're there
Get-Location

# Run command
npm run dev
```

### Frontend Commands
```powershell
# Verify directory first
Get-Location

# Should be in project root
cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53

# Verify
Get-Location

# Run command
npm run dev
```

### Database/Utility Scripts
```powershell
# Verify directory first
Get-Location

# Must be in project root for these scripts
.\clear-test-data.ps1
.\reset-password.ps1
.\status.ps1
```

## Visual Reminder

```
YOU ARE HERE?
    ↓
┌─────────────────┐
│  Get-Location   │  ← Run this FIRST
└─────────────────┘
         ↓
    ┌────────┐
    │ Verify │
    └────────┘
         ↓
┌─────────────────┐
│   Navigate if   │
│     needed      │
└─────────────────┘
         ↓
┌─────────────────┐
│  Get-Location   │  ← Verify AGAIN
└─────────────────┘
         ↓
┌─────────────────┐
│ Execute Command │
└─────────────────┘
```

## Emergency: "I'm Lost"

```powershell
# Find out where you are
Get-Location

# Get back to project root
cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53

# Verify you're there
Get-Location

# Should show: C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
```

---

**Remember: 5 seconds to verify location saves 5 minutes debugging phantom issues.**
