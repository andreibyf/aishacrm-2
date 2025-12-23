# URGENT FIXES NEEDED - Multiple Critical Issues

## Issue 1: User.listProfiles is not a function ❌
**Location:** `src/api/entities.js`  
**Error:** `TypeError: me.listProfiles is not a function`  
**Called from:** `src/components/settings/EnhancedUserManagement.jsx` line 642

**Fix Required:**
Add `listProfiles` function to User object in entities.js (after line 1807):

```javascript
  /**
   * List user profiles with linked employee data
   * @param {object} filters - Optional filters (tenant_id, role, etc.)
   */
  listProfiles: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value);
        }
      });
      
      const url = `${BACKEND_URL}/api/users${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data?.users || result.data || result || [];
    } catch (error) {
      console.error('[User.listProfiles] Error:', error);
      throw error;
    }
  },

  /**
   * Update user record
   * @param {string} id - User ID
   * @param {object} data - Update data
   */
  update: async (id, data) => {
    try {
      const url = `${BACKEND_URL}/api/users/${id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update user: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[User.update] Error:', error);
      throw error;
    }
  },
```

---

## Issue 2: Developer AI Lacks Context ❌
**Problem:** Developer AI doesn't maintain conversation context - keeps forgetting what was discussed

**Fix Required:**
- Add conversation history storage similar to AiSHA
- Include previous messages in API calls
- Implement context window management

---

## Issue 3: Input Box Doesn't Clear After Sending ❌
**Problem:** Text stays in input box (grayed out) after pressing Enter

**Fix Required:**
Find Developer AI input component and:
1. Clear input value after sending message
2. Ensure cursor stays in input box
3. Remove grayed text behavior

---

## PRIORITY ORDER:
1. **CRITICAL:** Fix User.listProfiles (breaks User Management)
2. **HIGH:** Fix input box behavior (UX issue)
3. **MEDIUM:** Add Developer AI context

---

## FILES TO MODIFY:
1. `src/api/entities.js` - Add listProfiles and update functions
2. Find Developer AI component - Fix input behavior
3. Developer AI backend - Add context support

