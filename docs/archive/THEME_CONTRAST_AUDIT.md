# Theme Contrast Audit and Fixes

## Overview
This document tracks the theme contrast improvements being made to ensure proper accessibility and readability in both light and dark themes. The goal is to achieve WCAG AA compliance (4.5:1 contrast ratio for normal text, 3:1 for large text).

## Architecture

### Theme System Location
- **Main Implementation**: `src/pages/Layout.jsx` (lines 360-400 for state, 2095+ for CSS overrides)
- **Theme State**: React useState with localStorage persistence
- **CSS Approach**: `.theme-light` and `.theme-dark` classes applied to document.body and documentElement
- **Override Strategy**: Extensive CSS overrides force light backgrounds and dark text in light theme

### Badge Contrast System
The theme system uses a specific pattern for badges to ensure proper contrast:

**Required Attributes:**
- `className` must include `contrast-badge`
- `data-variant` attribute: either "status" or "priority"
- `data-status` attribute (for status badges): the status value (e.g., "new", "completed", "overdue")
- `data-priority` attribute (for priority badges): the priority value (e.g., "urgent", "high", "medium", "low")

**Example:**
```jsx
<Badge 
  className={`${statusColors[lead.status]} contrast-badge capitalize text-xs font-semibold border`}
  data-variant="status"
  data-status={lead.status}
>
  {lead.status}
</Badge>
```

## Status Colors (Light Theme CSS Overrides)

### Activity Status
- **completed**: bg-green-300 (#a7f3d0), text-green-600 (#059669), border-green-400 (#34d399)
- **scheduled**: bg-blue-300 (#bfdbfe), text-blue-600 (#2563eb), border-blue-400 (#60a5fa)
- **overdue**: bg-amber-300 (#fde68a), text-amber-600 (#d97706), border-amber-400 (#fbbf24)
- **in_progress**: bg-yellow-300 (#fef08a), text-yellow-600 (#ca8a04), border-yellow-400 (#facc15)
- **cancelled/failed**: bg-red-300 (#fca5a5), text-red-600 (#dc2626), border-red-400 (#f87171)

### Lead Status
- **new**: bg-blue-300, text-blue-600, border-blue-400
- **contacted**: bg-indigo-300 (#c7d2fe), text-indigo-600 (#4f46e5), border-indigo-400 (#818cf8)
- **qualified/qualification**: bg-green-300, text-green-600, border-green-400
- **unqualified**: bg-amber-300, text-amber-600, border-amber-400
- **converted**: bg-green-300, text-green-600, border-green-400
- **lost**: bg-red-300, text-red-600, border-red-400

### Opportunity Stages
- **prospecting**: bg-blue-300, text-blue-600, border-blue-400
- **qualification**: bg-indigo-300, text-indigo-600, border-indigo-400
- **proposal**: bg-indigo-300, text-indigo-600, border-indigo-400
- **negotiation**: bg-yellow-300, text-yellow-600, border-yellow-400
- **closed_won**: bg-green-300, text-green-600, border-green-400
- **closed_lost**: bg-red-300, text-red-600, border-red-400

### Priority Badges
- **urgent**: bg-rose-300 (#fda4af), text-rose-500 (#f43f5e), border-rose-400 (#fb7185)
- **high**: bg-red-300 (#fca5a5), text-red-500 (#ef4444), border-red-400 (#f87171)
- **medium**: bg-orange-300 (#fdba74), text-orange-600 (#ea580c), border-orange-400 (#fb923c)
- **low/normal**: bg-sky-300 (#7dd3fc), text-sky-600 (#0284c7), border-sky-400 (#38bdf8)

## Progress Tracker

### ✅ Completed Components
1. **LeadCard** (`src/components/leads/LeadCard.jsx`)
   - Status badge: Added `contrast-badge` class and data attributes
   - Line ~153: Status badge now has proper theme support

2. **OpportunityCard** (`src/components/opportunities/OpportunityCard.jsx`)
   - Stage badge: Added `contrast-badge` class and data attributes
   - Line ~61: Stage badge now has proper theme support

3. **ActivityCard** (`src/components/activities/ActivityCard.jsx`)
   - Status badge: Added `contrast-badge` class and data attributes
   - Priority badge: Added `contrast-badge` class and data attributes
   - Lines ~106-118: Both status and priority badges now have proper theme support

4. **Leads Page Table** (`src/pages/Leads.jsx`)
   - Status badge: Added `contrast-badge` class and data attributes
   - Line ~1339: Status badge in table view now has proper theme support

5. **ContactCard** (`src/components/contacts/ContactCard.jsx`)
   - Status badge: Added `contrast-badge` class and data attributes
   - Line ~123: Status badge now has proper theme support

6. **Opportunities Page Table** (`src/pages/Opportunities.jsx`)
   - Stage badge: Added `contrast-badge` class and data attributes
   - Line ~1218: Stage badge in table view now has proper theme support

7. **Activities Page Table** (`src/pages/Activities.jsx`)
   - Status badge: Added `contrast-badge` class and data attributes
   - Line ~1138: Status badge in table view now has proper theme support

8. **AccountCard** (`src/components/accounts/AccountCard.jsx`)
   - Type badge: Added `contrast-badge` class and data attributes
   - Line ~128: Account type badge now has proper theme support

9. **Accounts Page Table** (`src/pages/Accounts.jsx`)
   - Type badge: Added `contrast-badge` class and data attributes
   - Line ~1080: Account type badge in table view now has proper theme support

10. **OpportunityDetailPanel** (`src/components/opportunities/OpportunityDetailPanel.jsx`)
    - Stage badge: Converted from solid colors to semi-transparent style, added contrast support
    - Activity status badges: Converted from light solid to semi-transparent dark style
    - Lines ~248, ~498: All badges now have proper theme support

11. **Contacts Page** (`src/pages/Contacts.jsx`)
    - **Stat Cards**: Completely redesigned from light solid backgrounds to match Leads/Opportunities/Activities
    - Now uses semi-transparent dark backgrounds (bg-slate-800, bg-green-900/20, bg-blue-900/20, etc.)
    - Consistent hover states and selection rings across all entity pages
    - Lines ~548-620: All stat cards now match design system

### 🔄 In Progress Components
_(None currently - review needed to identify more)_

### ❌ Not Yet Updated Components
These components have badges but haven't been updated yet:

1. **DataQualityReport** (`src/components/reports/DataQualityReport.jsx`)
   - Lines 246-248: Quality score badges (Excellent, Good, Needs Improvement)
   - Badge types: Quality scores (not status/priority, may need custom handling)

2. **AIMarketInsights** (`src/components/reports/AIMarketInsights.jsx`)
   - Lines 314, 324: Insight badges
   - Badge types: Informational (not status/priority, may need custom handling)

3. **RefactoringDocumentation** (`src/components/shared/RefactoringDocumentation.jsx`)
   - Lines 117, 137, 196: Phase badges
   - Badge types: Phase indicators (not status/priority, may need custom handling)

4. **TenantManagement** (`src/components/settings/TenantManagement.jsx`)
   - Line 552: Tenant status badges
   - Badge types: Active/inactive status

5. **EnhancedUserManagement** (`src/components/settings/EnhancedUserManagement.jsx`)
   - Line 709: User role/permission badges
   - Badge types: Informational

6. **CsvImportDialog** (`src/components/shared/CsvImportDialog.jsx`)
   - Line 563: Import status badges
   - Badge types: Success/status indicators

7. **AIEmailComposer** (`src/components/shared/AIEmailComposer.jsx`)
   - Line 268: Attachment badges
   - Badge types: Informational

8. **EmployeeDetailPanel** (`src/components/employees/EmployeeDetailPanel.jsx`)
   - Lines 359, 371, 375: Employee status/role badges
   - Badge types: Status indicators

9. **ReceiptSelector** (`src/components/cashflow/ReceiptSelector.jsx`)
   - Lines 137, 141: Receipt status badges
   - Badge types: Status indicators

10. **Opportunities Page** (`src/pages/Opportunities.jsx`)
    - Need to check table view for stage badges

11. **Activities Page** (`src/pages/Activities.jsx`)
    - Need to check table view for status/priority badges

12. **Accounts Page** (`src/pages/Accounts.jsx`)
    - Need to check if there are status badges

13. **Contacts Page** (`src/pages/Contacts.jsx`)
    - Need to check if there are status badges

## Additional Theme Issues to Address

### Card Backgrounds
- **Current Issue**: Many cards use hardcoded `bg-slate-800` which gets overridden by CSS
- **Solution**: CSS overrides in Layout.jsx already handle this (.theme-light .bg-slate-800 { background-color: #ffffff !important; })
- **Status**: ✅ Already handled by existing CSS overrides

### Text Colors
- **Current Issue**: `text-slate-100/200/300` are light colors for dark theme
- **Solution**: CSS overrides already force dark text in light theme
- **Status**: ✅ Already handled by existing CSS overrides

### Form Inputs
- **Current Issue**: Form inputs may have poor contrast in light theme
- **Components to Review**:
  - PhonePrefixPicker (already has `darkMode` prop support)
  - PhoneInput (already has `darkMode` prop support)
  - TagInput (already has `darkMode` prop support)
  - All input fields in form dialogs
- **Status**: ⚠️ Needs testing - some components have darkMode prop but may not be used everywhere

### Dropdown Menus
- **Current Issue**: Dropdown menus use `bg-slate-800` which may not have enough contrast
- **Status**: ✅ Should be handled by existing CSS overrides

### Tooltips
- **Current Issue**: StatusHelper and other tooltips use dark backgrounds
- **Status**: ⚠️ Needs review - may need explicit theme support

### Highlighted/Selected Items
- **Current Issue**: Selected items (e.g., `ring-2 ring-blue-500`) may not be visible in light theme
- **Status**: ⚠️ Needs testing

## Testing Checklist

### Visual Testing
- [ ] Test all updated components in dark theme (should look the same as before)
- [ ] Test all updated components in light theme (badges should have readable contrast)
- [ ] Check color-blind accessibility (use browser DevTools or color-blind simulators)
- [ ] Verify hover states for badges and buttons
- [ ] Verify focus states for interactive elements

### Component-Specific Testing
- [ ] Leads: View in both list and grid modes, both themes
- [ ] Opportunities: View in list, grid, and Kanban modes, both themes
- [ ] Activities: View in list and grid modes, both themes
- [ ] All form dialogs: Check input contrast in both themes
- [ ] Dropdown menus: Check background/text contrast in both themes
- [ ] Tooltips: Check visibility in both themes

### Automated Testing
- [ ] Update Playwright tests to test both themes
- [ ] Add accessibility tests for contrast ratios
- [ ] Test with screen reader (optional but recommended)

## Implementation Guidelines

### For Status Badges
```jsx
<Badge 
  className={`${statusColors[item.status]} contrast-badge capitalize text-xs font-semibold border`}
  data-variant="status"
  data-status={item.status}
>
  {item.status}
</Badge>
```

### For Priority Badges
```jsx
<Badge 
  className={`${priorityColors[item.priority]} contrast-badge`}
  data-variant="priority"
  data-priority={item.priority}
>
  {item.priority}
</Badge>
```

### For Custom Badges (Non-Status/Priority)
For badges that don't fit the status/priority pattern (e.g., phase indicators, quality scores):
1. Option A: Create new data attributes and CSS overrides in Layout.jsx
2. Option B: Use conditional className based on theme prop
3. Option C: Use Tailwind's built-in light/dark mode if available

## Next Steps

1. **Immediate**: Test the updated components (LeadCard, OpportunityCard, ActivityCard, Leads table) in light theme
2. **Short-term**: Update remaining entity card components (Accounts, Contacts, etc.)
3. **Medium-term**: Review and update informational badges (reports, settings, etc.)
4. **Long-term**: Add automated contrast testing to CI/CD pipeline

## Resources

- WCAG 2.1 Contrast Guidelines: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Chrome DevTools Color Contrast: Built into Inspect > Accessibility

## Notes

- The current CSS override approach in Layout.jsx is comprehensive but relies on `!important` flags
- Consider migrating to Tailwind's built-in dark mode in the future for cleaner implementation
- Some components already have `darkMode` prop support - audit usage consistency
- Keep Layout.jsx CSS overrides updated when adding new badge types or status values
