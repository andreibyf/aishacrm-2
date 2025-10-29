# Development Quick Start Guide

## 🚀 One-Command Startup

Start everything with auto-restart enabled:

```powershell
.\start-all.ps1
```

This starts:
- ✅ Backend server with auto-restart (port 3001)
- ✅ Frontend dev server with HMR (port 5173)

## 🔄 Auto-Restart Features

### Backend Auto-Restart
- **How it works**: Node.js `--watch` flag monitors file changes
- **What triggers restart**: Any `.js` file modification in `backend/`
- **Restart time**: ~1 second
- **Manual start**: `cd backend && npm run dev`

### Frontend Hot Module Replacement (HMR)
- **How it works**: Vite detects changes and updates browser instantly
- **What updates**: React components, CSS, config files
- **Update time**: Instant (no page reload needed)
- **Manual start**: `npm run dev`

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
