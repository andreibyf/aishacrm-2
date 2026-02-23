# ✅ UI Rename Complete: "BizDev Sources" → "Potential Leads"

## 🎯 What Was Changed

Renamed "BizDev Sources" to "Potential Leads" throughout the **UI only**. Backend APIs remain unchanged for stability.

### Files Modified (2 files):

1. **`src/components/shared/entityLabelsUtils.js`**
   - Changed default labels for `bizdev_sources`:
     - `plural: 'Sources'` → `'Potential Leads'`
     - `singular: 'Source'` → `'Potential Lead'`

2. **`src/utils/navigationConfig.js`**
   - Changed navigation menu label:
     - `"BizDev Sources"` → `"Potential Leads"`

## ✅ What Changed in the UI

### Before:

```
Navigation: "BizDev Sources"
Page Title: "Sources"
Buttons: "Add Source"
Stats: "Total Sources", "Active Sources"
```

### After:

```
Navigation: "Potential Leads"
Page Title: "Potential Leads"
Buttons: "Add Potential Lead"
Stats: "Total Potential Leads", "Active Potential Leads"
```

## 🔧 Backend Unchanged (By Design)

The following remain unchanged to avoid breaking changes:

- ✅ API endpoints: `/api/bizdevsources`
- ✅ Database table: `bizdev_sources`
- ✅ Entity class: `BizDevSource`
- ✅ Component filenames: `BizDev*.jsx`
- ✅ Folder names: `/components/bizdev/`

## 🎨 How It Works

The app uses the **Entity Labels system** which provides centralized label management:

1. **EntityLabelsContext** provides labels to all components
2. **useEntityLabel('bizdev_sources')** hook fetches labels
3. Components use `{bizdevLabel}` and `{bizdevSourceLabel}` instead of hardcoded text
4. All labels update automatically when config changes

### Example from the page:

```jsx
const { plural: bizdevLabel, singular: bizdevSourceLabel } = useEntityLabel('bizdev_sources');

// Before: "BizDev Sources"
// After: "Potential Leads"
<h1>{bizdevLabel}</h1>

// Before: "Add Source"
// After: "Add Potential Lead"
<Button>Add {bizdevSourceLabel}</Button>
```

## 🧪 Testing Checklist

### Manual Testing:

- [ ] Navigation menu shows "Potential Leads" instead of "BizDev Sources"
- [ ] Page title shows "Potential Leads"
- [ ] "Add Potential Lead" button works
- [ ] Stats cards show "Total Potential Leads", "Active", etc.
- [ ] Detail panel titles updated
- [ ] Form titles updated
- [ ] Toast notifications use new labels
- [ ] Import/Export still works
- [ ] Promote to Lead still works
- [ ] Search and filters work

### Backend Verification:

```bash
# These should still work (unchanged):
curl http://localhost:3001/api/bizdevsources?tenant_id=xxx
curl -X POST http://localhost:3001/api/bizdevsources
curl -X POST http://localhost:3001/api/bizdevsources/{id}/promote
```

## 📊 Label Usage Throughout App

The app now uses consistent terminology:

| Stage       | Name                  | Description                |
| ----------- | --------------------- | -------------------------- |
| **Stage 1** | **Potential Lead**    | Cold prospect, unqualified |
| **Stage 2** | **Lead**              | Warm, being worked         |
| **Stage 3** | **Qualified Lead**    | Hot, ready to convert      |
| **Stage 4** | **Contact + Account** | Customer with full profile |

This aligns perfectly with your business workflow!

## 🚀 Commit Instructions

```bash
cd C:\Users\andre\Documents\GitHub\aishacrm-2

# Stage the 2 changed files
git add src/components/shared/entityLabelsUtils.js
git add src/utils/navigationConfig.js

# Commit
git commit -m "ui: Rename 'BizDev Sources' to 'Potential Leads' in UI

- Updated default entity labels for bizdev_sources
- Changed navigation menu label
- Backend APIs and database unchanged
- Component files unchanged for stability

Affects:
- Entity labels: 'Sources' → 'Potential Leads'
- Navigation: 'BizDev Sources' → 'Potential Leads'
- All UI text updates automatically via EntityLabelsContext"

# Push
git push
```

## 🎉 Benefits of This Approach

✅ **User-friendly**: "Potential Leads" is immediately clear to everyone
✅ **No breaking changes**: Backend remains stable
✅ **Easy to revert**: Just change 2 lines back
✅ **Consistent**: All UI updates automatically via central config
✅ **Safe**: No risk of breaking API integrations

## 📝 Future Enhancements (Optional)

If you want to customize further, users can override labels via:

- Settings → Entity Labels Manager
- Per-tenant customization available

---

**Status:** ✅ COMPLETE - Ready to test and commit!
