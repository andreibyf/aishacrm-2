# Development Quick Start Guide

## � CRITICAL RULES - READ FIRST

### Terminal & Directory Management (MANDATORY)

**Before running ANY command:**

1. **Verify Directory Location:**
   ```powershell
   Get-Location  # ALWAYS run this first!
   ```

2. **Navigate to Project Root if Needed:**
   ```powershell
   cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
   ```

3. **Use Separate Terminals:**
   - Frontend runs in Terminal 1
   - Backend runs in Terminal 2
   - Your work/commands go in Terminal 3 (NEW terminal after starting services)

**Why This Matters:**
- Running commands in wrong directory = errors/failures
- Background processes occupy terminals = need new terminal for commands
- Assuming location instead of verifying = waste time debugging phantom issues

---

## �🚀 One-Command Startup

Start everything with auto-restart enabled:

```powershell
# 1. Verify you're in project root
Get-Location

# 2. Start all services (occupies this terminal)
.\start-all.ps1

# 3. Open a NEW terminal for your work
# (Ctrl+Shift+` in VS Code or use terminal menu)
```

This starts:
- ✅ Backend server with auto-restart (port 3001)
- ✅ Frontend dev server with HMR (port 5173)

**⚠️ IMPORTANT:** After services start, open a NEW terminal for running other commands!

## 🔄 Auto-Restart Features

### Backend Auto-Restart
- **How it works**: Custom wrapper monitors file changes with restart limits
- **What triggers restart**: Any `.js` file modification in `backend/`
- **Restart time**: ~2 seconds (includes cooldown)
- **Safety limits**: Max 10 restarts per minute, auto-exits if exceeded
- **Manual start**: `cd backend && npm run dev`
- **Unlimited mode**: `cd backend && npm run dev:unlimited` (not recommended)

### Frontend Hot Module Replacement (HMR)
- **How it works**: Vite detects changes and updates browser instantly
- **What updates**: React components, CSS, config files
- **Update time**: Instant (no page reload needed)
- **Crash recovery**: Auto-restarts if Vite crashes (max 5/min)
- **Manual start**: `npm run dev`
- **Direct Vite**: `npm run dev:vite` (no crash recovery)

## 📝 Development Workflow

### Making Backend Changes
1. Edit any file in `backend/routes/`, `backend/lib/`, etc.
2. Save the file
3. ✅ Server automatically restarts in ~1 second
4. Check terminal for restart confirmation
5. Test your changes

**Example:**
```javascript
// backend/routes/contacts.js
router.get('/', async (req, res) => {
  // Add console.log for debugging
  console.log('Contacts route hit!', req.query);
  // ... rest of code
});
// Save → Auto-restart → Console.log appears in backend terminal
```

### Making Frontend Changes
1. Edit any component in `src/components/`, `src/pages/`, etc.
2. Save the file
3. ✅ Browser updates instantly (no reload)
4. Check browser for your changes

**Example:**
```jsx
// src/pages/Dashboard.jsx
<h1>Dashboard</h1> // Change this
// Save → Browser updates immediately
```

### Making CSS/Style Changes
1. Edit any `.css` file or Tailwind classes
2. Save the file
3. ✅ Styles update instantly in browser

## 🐛 Troubleshooting Auto-Restart

### Backend Not Restarting
1. Check if you're using `npm run dev` (not `npm start`)
2. Verify you saved the file
3. Check terminal for error messages
4. If stuck, manually restart: `Ctrl+C` then `npm run dev`

### Frontend Not Updating
1. Check browser console for errors
2. Try hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. Clear Vite cache: Delete `.vite/` folder and restart
4. If stuck, manually restart: `Ctrl+C` then `npm run dev`

### Port Already in Use
```powershell
# Find and kill process on port 3001 (backend)
Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Find and kill process on port 5173 (frontend)
Get-NetTCPConnection -LocalPort 5173 | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## 🛑 Stopping Services

### Stop All Services
```powershell
.\stop-all.ps1
```

### Stop Individual Services
- **Backend**: `Ctrl+C` in backend terminal
- **Frontend**: `Ctrl+C` in frontend terminal

## 📊 Checking Status

```powershell
.\status.ps1
```

Shows:
- ✅ Which services are running
- ✅ Port status
- ✅ Process IDs
- ✅ Database connectivity

## 🔍 Quick Tests

### Test Backend
```powershell
# Health check
Invoke-RestMethod http://localhost:3001/health

# System status
Invoke-RestMethod http://localhost:3001/api/system/status

# List contacts
Invoke-RestMethod "http://localhost:3001/api/contacts?tenant_id=test&limit=10"
```

### Test Frontend
Open browser to: http://localhost:5173

## 💡 Tips

1. **Keep terminals visible**: Watch for errors and restart confirmations
2. **Use console.log**: Backend logs appear in backend terminal
3. **Browser DevTools**: Frontend logs appear in browser console
4. **Database changes**: Might need manual backend restart if schema changes
5. **Environment changes**: Always restart after editing `.env` files

## 🎯 Common Tasks

### Add New Backend Route
1. Create/edit file in `backend/routes/`
2. Save → Auto-restart applies changes
3. Test with `Invoke-RestMethod` or frontend

### Add New Frontend Component
1. Create component in `src/components/`
2. Import in parent component
3. Save → HMR updates browser
4. Check browser for changes

### Update Database Schema
1. Create migration in `backend/migrations/`
2. Restart backend manually (schema changes need fresh connection)
3. Verify with database client

## 📚 Scripts Reference

### Root Directory
- `npm run dev` - Start frontend with HMR
- `npm run build` - Build for production
- `npm run lint` - Check code quality

### Backend Directory
- `npm run dev` - Start with auto-restart
- `npm start` - Start in production mode
- `npm test` - Run tests

## 🚨 Emergency Commands

If everything breaks:
```powershell
# Nuclear option - stop everything and restart fresh
.\stop-all.ps1
Start-Sleep -Seconds 2
.\start-all.ps1
```

Happy coding! 🎉
