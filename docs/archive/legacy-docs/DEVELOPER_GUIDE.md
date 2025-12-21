# Developer Quick Reference

## 🚀 Quick Start Checklist

- [ ] Run `npm install`
- [ ] Copy `.env.example` to `.env`
- [ ] Add your `VITE_BASE44_APP_ID` to `.env`
- [ ] Run `npm run dev`
- [ ] Open http://localhost:5173

## 🔧 Common Tasks

### Adding a New Page
```jsx
// 1. Create page in src/pages/
// src/pages/MyNewPage.jsx
import { User } from '@/api/entities';

export default function MyNewPage() {
  // Your component code
}

// 2. Add route in src/pages/index.jsx
// 3. Add navigation item in src/pages/Layout.jsx (navItems array)
```

### Adding a New API Entity
```javascript
// Entities are auto-exported from src/api/entities.js
import { MyEntity } from '@/api/entities';

// Usage
const data = await MyEntity.list();
const item = await MyEntity.get(id);
await MyEntity.create({ ...data });
await MyEntity.update(id, { ...data });
await MyEntity.delete(id);
```

### Using the Confirmation Dialog
```jsx
import { useConfirmDialog } from '@/components/shared/ConfirmDialog';

function MyComponent() {
  const { ConfirmDialog, confirm } = useConfirmDialog();

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete this item?",
      description: "This action cannot be undone.",
      variant: "destructive"
    });
    
    if (confirmed) {
      // Perform delete
    }
  };

  return (
    <>
      <ConfirmDialog />
      <Button onClick={handleDelete}>Delete</Button>
    </>
  );
}
```

### Using Error Boundaries
```jsx
// Already implemented at root level
// For component-level boundaries:
import ErrorBoundary from '@/components/shared/ErrorBoundary';

<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>
```

### Accessing Current User
```jsx
import { User } from '@/api/entities';
import { useTenant } from '@/components/shared/tenantContext';

function MyComponent() {
  const { currentTenant } = useTenant();
  const [user, setUser] = useState(null);

  useEffect(() => {
    User.me().then(setUser);
  }, []);

  return <div>Hello, {user?.name}</div>;
}
```

## 🎨 UI Components

### Available Components (Radix UI + shadcn/ui)
- `Button` - Buttons with variants
- `Dialog` - Modal dialogs
- `AlertDialog` - Confirmation dialogs
- `DropdownMenu` - Dropdown menus
- `Select` - Select inputs
- `Input` - Text inputs
- `Checkbox` - Checkboxes
- `Tabs` - Tabbed interfaces
- `Tooltip` - Tooltips
- `Badge` - Status badges
- `Card` - Content cards
- `Sheet` - Slide-out panels

All available in `@/components/ui/`

### Icons
```jsx
import { User, Settings, Trash2 } from 'lucide-react';

<User className="h-4 w-4" />
```

## 🔐 Security Best Practices

### ✅ DO
- Use environment variables for sensitive data
- Wrap dev-only logs with `import.meta.env.DEV`
- Use `ConfirmDialog` instead of `window.confirm()`
- Implement error boundaries for critical sections
- Use the entity wrappers in `src/api/entities.js` for all data access. They provide automatic Base44 → local backend failover; prefer the local backend when available.

### ❌ DON'T
- Commit `.env` files
- Hardcode API keys or secrets
- Use `eval()` or `new Function()`
- Trust user input without validation
- Use `dangerouslySetInnerHTML` with user content

## 🚀 Performance Tips

### Optimize Renders
```jsx
// Use React.memo for expensive components
import { memo } from 'react';

const MyComponent = memo(function MyComponent({ data }) {
  // Component code
});

// Use useMemo for expensive calculations
const expensiveValue = useMemo(() => {
  return complexCalculation(data);
}, [data]);
```

### Use the Performance Cache
```javascript
import { performanceCache } from '@/components/shared/PerformanceCache';

// Cached entity calls
const data = await performanceCache.cachedEntityCall(
  'Contact', 
  'list', 
  { limit: 50 }
);

// Clear cache when data changes
performanceCache.clearEntityCache('Contact');
```

### Code Splitting
```jsx
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

<Suspense fallback={<div>Loading...</div>}>
  <HeavyComponent />
</Suspense>
```

## 📦 Build & Deploy

### Development
```bash
npm run dev          # Start dev server
npm run lint         # Check code quality
```

### Production
```bash
npm run build        # Build for production
npm run preview      # Test production build
npm audit            # Check for vulnerabilities
```

### Environment Variables
```bash
# Development (.env)
VITE_BASE44_APP_ID=your_app_id_here

# Production
# Set in your hosting platform's environment config
```

## 🐛 Debugging

### Enable Verbose Logging
```javascript
// Only in development
if (import.meta.env.DEV) {
  console.log('Debug info:', data);
}
```

### Check Cache Stats
```javascript
import { performanceCache } from '@/components/shared/PerformanceCache';

console.log(performanceCache.getCacheStats());
```

### View API Errors
All API errors are automatically caught by the SDK. Check the browser console for details.

## 📚 Key Files

- `src/api/base44Client.js` - Base44 SDK configuration
- `src/api/entities.js` - All available entities
- `src/api/functions.js` - Cloud functions
- `src/pages/Layout.jsx` - Main app layout and navigation
- `src/components/shared/` - Reusable utilities
- `.env` - Environment configuration (DO NOT COMMIT)
- `vite.config.js` - Build configuration

## 🆘 Troubleshooting

### "Cannot find module '@/...'"
- Check `vite.config.js` alias configuration
- Ensure path is correct

### "appId is undefined"
- Create `.env` file from `.env.example`
- Add `VITE_BASE44_APP_ID=your_id`
- Restart dev server

### Build fails
- Run `npm run lint` to check for errors
- Check console for specific error messages
- Ensure all environment variables are set

### API calls fail
- Check authentication status
- Verify `requiresAuth: true` in base44Client.js
- Check Base44 API status

---

**Questions?** Contact Base44 support at app@base44.com
