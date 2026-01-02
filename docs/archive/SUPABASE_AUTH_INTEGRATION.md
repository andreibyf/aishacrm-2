# Supabase Authentication Setup Guide

## Overview
This CRM now integrates Supabase Auth to automatically create login credentials when users are added in the application. This enables:
- **Auto-provisioned user accounts** with temporary passwords
- **24-hour password expiration** forcing users to change their initial password
- **Password reset flows** via email
- **Tenant admin self-service** for managing their team's user accounts

## Quick Start

### 1. Get Your Supabase Credentials

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **Settings → API**
3. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Publishable key** (safe to use in browser with RLS enabled)
   - **service_role** key from Secret keys section (⚠️ Keep this secret!)

### 2. Configure Environment Variables

Add to `backend/.env`:

```bash
# Supabase Configuration (for authentication)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Publishable key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Secret key

# Default password for new users (must be changed within 24 hours)
DEFAULT_USER_PASSWORD=Welcome2024!

# Frontend URL for password reset redirects
FRONTEND_URL=http://localhost:5173
```

### 3. Restart Backend Server

```powershell
cd backend
npm start
```

You should see:
```
✓ Supabase Auth initialized
✓ Backend server running on port 3001
```

## How It Works

### User Creation Flow

When you create a user in the CRM (Settings → User Management → Add User):

1. **Frontend sends user data** including email, name, role, tenant
2. **Backend creates database record** in `employees` table
3. **Backend creates Supabase Auth user** with:
   - Email confirmation auto-enabled
   - Temporary password (default or custom)
   - User metadata (name, role, tenant_id)
   - Password expiration set to 24 hours
4. **Response includes temporary credentials**:
   ```json
   {
     "status": "success",
     "data": {
       "user": {...},
       "auth": {
         "created": true,
         "password": "Welcome2024!",
         "password_expires_hours": 24,
         "must_change_password": true
       }
     }
   }
   ```
5. **YOU must communicate credentials to the user** - Supabase does NOT automatically send emails in this flow

### Communication Options

**Option 1: Manual (Current)**
- Copy the password from API response
- Send to user via email, Slack, or other secure channel
- Include login URL and instructions

**Option 2: Automatic Email (Recommended - Not Yet Implemented)**
- Backend sends welcome email with credentials
- Uses your email service (SendGrid, AWS SES, etc.)
- Template includes: username, temp password, login URL, expiration warning

**Option 3: Password Reset Flow (For Expired Passwords)**
- If temp password expires, admin uses "Send Password Reset"
- User receives Supabase reset email
- User sets their own password

### Password Lifecycle

**Initial Password:**
- Set by admin during user creation (or uses `DEFAULT_USER_PASSWORD`)
- **Expires in 24 hours** (stored in metadata, not yet enforced)
- **Admin must communicate credentials** to the user manually

**First Login:**
- User logs in with temporary password
- **Frontend should check** `user_metadata.password_change_required`
- System prompts for password change (UI not yet implemented)
- New password must meet security requirements

**Password Expiration Handling:**
- If user tries to log in after 24 hours:
  - **Currently:** Login succeeds (expiration not enforced yet)
  - **Should:** Reject login and require password reset
  - **Workaround:** Admin sends password reset email

**Password Reset:**
- Admin clicks "Send Password Reset" in User Management
- OR user clicks "Forgot Password" on login page
- System sends reset link to email (Supabase handles this)
- Link redirects to `/reset-password` page
- User creates new password

**Account Suspension (Not Yet Implemented):**
- Admin sets user status to "inactive" in database
- Backend should check status before allowing login
- User sees "Account suspended" message

### User Deletion Flow

When deleting a user:

1. **Backend retrieves user email**
2. **Backend deletes from Supabase Auth** (revokes login access)
3. **Backend deletes from database** (removes CRM data)
4. Returns success (or partial success if auth deletion fails)

## API Endpoints

### POST /api/users
Create new user with auth credentials

**Request:**
```json
{
  "email": "john.doe@company.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "employee",
  "tenant_id": "tenant-uuid",
  "password": "CustomPassword123!" // Optional, uses DEFAULT_USER_PASSWORD if omitted
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Employee created successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "john.doe@company.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "employee",
      "tenant_id": "tenant-uuid"
    },
    "auth": {
      "created": true,
      "password": "CustomPassword123!",
      "password_expires_hours": 24,
      "must_change_password": true
    }
  }
}
```

### POST /api/users/reset-password
Send password reset email

**Request:**
```json
{
  "email": "john.doe@company.com"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Password reset email sent"
}
```

### DELETE /api/users/:id
Delete user (removes from both database and auth)

**Request:**
```bash
DELETE /api/users/uuid-here
```

**Response:**
```json
{
  "status": "success",
  "message": "User deleted",
  "data": {
    "user": {
      "id": "uuid",
      "email": "john.doe@company.com"
    }
  }
}
```

## Tenant Admin Capabilities

Once fully integrated, tenant admins will be able to:

✅ **Create Users** - Add team members with auto-provisioned logins
✅ **Reset Passwords** - Send reset emails to team members
✅ **Deactivate Users** - Remove login access without deleting data
✅ **Delete Users** - Completely remove users and their auth credentials
✅ **View Login Status** - See who has logged in recently

## Security Features

- **Service Role Key** - Backend uses privileged key for admin operations
- **Email Confirmation** - Auto-enabled (users can log in immediately)
- **Password Expiration** - Temporary passwords expire in 24 hours
- **Metadata Storage** - User metadata (name, role) stored in Supabase Auth
- **CORS Protection** - API calls restricted to allowed origins

## Troubleshooting

### "Supabase Auth not initialized"
- Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env`
- Restart backend server
- Verify environment variables are loading correctly

### "Failed to create auth user"
- Check Supabase project is active (not paused)
- Verify service role key is correct
- Check Supabase dashboard for error logs
- Ensure email doesn't already exist

### User created but auth failed
- User record exists in database but can't log in
- Check Supabase Auth dashboard for user
- Manually create auth user or delete and recreate

### Password reset not working
- Verify `FRONTEND_URL` is set correctly
- Check email templates in Supabase dashboard
- Verify email service is configured in Supabase

## Next Steps

### 1. Immediate Workarounds (What You Can Do Now)

**Creating Users:**
1. Create user via User Management UI
2. Copy the temporary password from the API response (shown in browser console or UI)
3. Manually send credentials to user via email/Slack:
   ```
   Welcome to Aisha CRM!
   
   Login: https://your-app-url.com
   Email: user@company.com
   Temporary Password: Welcome2024!
   
   ⚠️ This password expires in 24 hours. Please change it on first login.
   ```

**If Password Expires:**
1. Go to User Management
2. Find the user
3. Click "Send Password Reset" (you'll need to add this button)
4. User receives email from Supabase with reset link

**Suspending Access:**
1. **Toggle OFF "CRM Access"** in User Management (you or admin can do this)
   - Removes `'crm_access'` from the `permissions` JSONB array
   - User exists but cannot use the CRM
2. **OR:** Set user `status` to "inactive" 
   - Different purpose: marks account as suspended/disabled
3. **Note:** User can still authenticate with Supabase until frontend checks these flags on login
4. **Complete Revocation:** Use "Delete User" to remove from both DB and Supabase Auth

### 2. Features To Implement

#### Priority 1: Password Change on First Login
**Frontend** (`src/components/auth/FirstLoginPasswordChange.jsx` - create this):
```javascript
// Check if password change required
const user = await User.me();
if (user.user_metadata?.password_change_required) {
  // Show password change modal
  // Force user to set new password before continuing
}
```

#### Priority 2: Enforce 24-Hour Expiration
**Frontend** (`src/api/entities.js` - update User.signIn):
```javascript
// After successful login, check password expiration
const passwordExpiresAt = user.user_metadata?.password_expires_at;
if (passwordExpiresAt && new Date(passwordExpiresAt) < new Date()) {
  await User.signOut();
  throw new Error('Temporary password expired. Please request a password reset.');
}
```

#### Priority 3: Welcome Email
**Backend** (`backend/lib/emailService.js` - create this):
```javascript
export async function sendWelcomeEmail(email, tempPassword, userName) {
  // Use SendGrid, AWS SES, or your email provider
  // Template includes login URL, credentials, expiration warning
}
```

**Update** `backend/routes/users.js`:
```javascript
// After creating auth user
await sendWelcomeEmail(email, userPassword, `${first_name} ${last_name}`);
```

#### Priority 4: CRM Access & Account Status Check
**Frontend** (`src/api/entities.js` - update User.signIn):
```javascript
// After Supabase auth succeeds
const dbUser = await callBackendAPI(`users/email/${email}`, 'GET');

// Check permissions JSONB array for 'crm_access'
if (dbUser.permissions && !dbUser.permissions.includes('crm_access')) {
  await User.signOut();
  throw new Error('CRM access has been disabled. Contact your administrator.');
}

// Check account status
if (dbUser.status === 'inactive') {
  await User.signOut();
  throw new Error('Your account has been suspended. Contact your administrator.');
}
```

**Backend** (Add to User Management API):
```javascript
// Toggle CRM Access: Remove or add 'crm_access' from permissions array
const toggleCRMAccess = async (userId, enable) => {
  const query = enable
    ? `UPDATE users SET permissions = array_append(permissions, 'crm_access') WHERE id = $1`
    : `UPDATE users SET permissions = array_remove(permissions, 'crm_access') WHERE id = $1`;
  await pgPool.query(query, [userId]);
};
```

#### Priority 5: Auto-Generate Strong Passwords
**Backend** (`backend/routes/users.js`):
```javascript
import crypto from 'crypto';

function generateSecurePassword() {
  return crypto.randomBytes(12).toString('base64'); // e.g., "aB3#kL9$xY2@"
}

// Use when creating user:
const userPassword = password || generateSecurePassword();
```

### 3. Customize Email Templates

1. **Customize Email Templates in Supabase**
   - Go to Supabase Dashboard → Authentication → Email Templates
   - Customize "Invite User" template with your branding
   - Customize "Reset Password" template

2. **Configure Frontend Login**
   - Create login page that authenticates with Supabase
   - Store auth token in local storage
   - Redirect users after successful login

3. **Add Password Change UI**
   - Force password change on first login
   - Show expiration warning
   - Validate password strength

4. **Enable Tenant Admin Features**
   - Allow tenant admins to manage their users
   - Restrict user creation to admin roles
   - Add audit logging for user management actions

## Example PowerShell Test

Test user creation with auth:

```powershell
# Create user with auto-provisioned auth
$body = @{
  email = 'jane.smith@company.com'
  first_name = 'Jane'
  last_name = 'Smith'
  role = 'employee'
  tenant_id = '6cb4c008-4847-426a-9a2e-918ad70e7b69'
  password = 'TempPassword2024!'
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri 'http://localhost:3001/api/users' -Method Post -Body $body -ContentType 'application/json'

# Display result
$result.data

# Should show:
# user: { id, email, first_name, last_name, ... }
# auth: { created: true, password: 'TempPassword2024!', password_expires_hours: 24, must_change_password: true }
```

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Admin API](https://supabase.com/docs/reference/javascript/admin-api)
- [Password Reset Flow](https://supabase.com/docs/guides/auth/passwords)
