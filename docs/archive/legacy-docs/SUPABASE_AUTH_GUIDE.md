# Supabase Authentication Guide

**Version:** 2.0  
**Last Updated:** December 4, 2025  
**Consolidates:** `SUPABASE_AUTH_SETUP.md`, `SUPABASE_AUTH_INTEGRATION.md`, `SUPABASE_AUTH_TESTING.md`

---

## Overview

AiSHA CRM uses Supabase Auth for user authentication with automatic credential provisioning when users are created in the application.

### Key Features
- **Auto-provisioned user accounts** with temporary passwords
- **24-hour password expiration** forcing users to change initial passwords
- **Password reset flows** via email
- **Tenant admin self-service** for managing team user accounts
- **Session persistence** across page refreshes

---

## Quick Start

### 1. Get Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings → API**
4. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Publishable key** (starts with `eyJ...` - safe for browser)
   - **service_role** key (⚠️ Keep secret - backend only!)

### 2. Configure Environment Variables

**Frontend** (root `.env`):
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key_here
```

**Backend** (`backend/.env`):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_publishable_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
DEFAULT_USER_PASSWORD=Welcome2024!
FRONTEND_URL=http://localhost:4000
```

### 3. Restart Services

```bash
docker compose up -d --build
```

You should see in backend logs:
```
✓ Supabase Auth initialized
✓ Backend server running on port 3001
```

---

## Authentication Flow

### Priority Order
1. **Supabase Auth** → Primary authentication (production)
2. **Backend API** → Independent backend (localhost:4001)
3. **Local Dev Mode** → Returns mock user (development only)

### User Creation Flow

When you create a user in User Management:

1. **Frontend sends user data** (email, name, role, tenant)
2. **Backend creates database record** in `employees` table
3. **Backend creates Supabase Auth user** with:
   - Email confirmation auto-enabled
   - Temporary password (default or custom)
   - User metadata (name, role, tenant_id)
   - Password expiration set to 24 hours
4. **Response includes temporary credentials**

### API Response Example
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "email": "john.doe@company.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    "auth": {
      "created": true,
      "password": "Welcome2024!",
      "password_expires_hours": 24,
      "must_change_password": true
    }
  }
}
```

---

## Available Methods

```javascript
// Get current user
const user = await User.me();

// Sign in
const user = await User.signIn('email@example.com', 'password');

// Sign out
await User.signOut();

// Sign up (if enabled)
const user = await User.signUp('email@example.com', 'password', {
  tenant_id: 'tenant-123',
  name: 'John Doe'
});

// Update current user
const updated = await User.updateMyUserData({ name: 'New Name' });

// List users (admin)
const users = await User.list({ tenant_id: 'tenant-123' });

// Update user by ID (admin)
const updated = await User.update('user-id', { name: 'Updated Name' });
```

---

## User Object Structure

After successful authentication:

```javascript
{
  id: "uuid-from-supabase",
  email: "user@example.com",
  tenant_id: "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  name: "User Name",
  user_metadata: {
    tenant_id: "a11dfb63-4b18-4eb8-872e-747af2e37c46",
    name: "User Name"
  },
  created_at: "2025-10-26T...",
  session: { /* Supabase session object */ }
}
```

---

## API Endpoints

### POST /api/users
Create new user with auth credentials

```json
{
  "email": "john.doe@company.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "employee",
  "tenant_id": "tenant-uuid",
  "password": "CustomPassword123!"  // Optional
}
```

### POST /api/users/reset-password
Send password reset email

```json
{
  "email": "john.doe@company.com"
}
```

### DELETE /api/users/:id
Delete user from both database and auth

---

## Password Lifecycle

### Initial Password
- Set by admin during user creation (or uses `DEFAULT_USER_PASSWORD`)
- **Expires in 24 hours**
- Admin must communicate credentials to user

### First Login
- User logs in with temporary password
- Frontend should check `user_metadata.password_change_required`
- System prompts for password change

### Password Reset
1. Admin clicks "Send Password Reset" in User Management
2. OR user clicks "Forgot Password" on login page
3. Supabase sends reset link to email
4. Link redirects to `/reset-password` page

---

## Testing Authentication

### Check Configuration
Open browser console - no Supabase warnings means configured correctly.

### Create Test User

**Via Supabase Dashboard:**
1. Go to **Authentication → Users**
2. Click **Add User**
3. Set email, password
4. Add User Metadata:
   ```json
   {
     "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
     "name": "Test User"
   }
   ```

### Test Sign In
1. Sign in with test user
2. Console shows: `[Supabase Auth] Sign in successful`
3. Refresh page - user should stay logged in

### Disable Email Confirmation (Dev Only)
1. Supabase Dashboard → **Authentication → Providers**
2. **Email** → Toggle OFF "Confirm email"
3. Users can sign in immediately without verification

⚠️ **Re-enable in production!**

---

## Troubleshooting

### "Missing credentials" warning
- Add `VITE_SUPABASE_ANON_KEY` to `.env`
- Restart dev server

### "Invalid login credentials"
- Verify user exists in Supabase Dashboard
- Check email/password are correct
- Verify email is confirmed

### User signed in but app doesn't recognize
- Check `User.me()` result in console
- Verify `user_metadata` includes `tenant_id`
- Check localStorage: `supabase.auth.session`

### "Supabase Auth not initialized"
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in backend `.env`
- Restart backend server

---

## Security Features

- **Service Role Key** - Backend uses privileged key for admin operations
- **Email Confirmation** - Auto-enabled for new users
- **Password Expiration** - Temporary passwords expire in 24 hours
- **Metadata Storage** - User info stored in Supabase Auth
- **CORS Protection** - API calls restricted to allowed origins

---

## Tenant Admin Capabilities

- ✅ **Create Users** - Add team members with auto-provisioned logins
- ✅ **Reset Passwords** - Send reset emails to team members
- ✅ **Deactivate Users** - Remove login access without deleting data
- ✅ **Delete Users** - Completely remove users and auth credentials
- ✅ **View Login Status** - See recent login activity

---

## Related Documentation

- [Supabase Setup Guide](./SUPABASE_SETUP_GUIDE.md) - Database setup
- [Supabase Cloud Setup](./SUPABASE_CLOUD_SETUP.md) - Cloud deployment
- [Supabase Official Docs](https://supabase.com/docs/guides/auth)

---

**Document Owner**: Engineering Team  
**Last Updated**: December 4, 2025
