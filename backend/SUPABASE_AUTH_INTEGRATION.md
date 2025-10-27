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
   - **anon public** key
   - **service_role** key (⚠️ Keep this secret!)

### 2. Configure Environment Variables

Add to `backend/.env`:

```bash
# Supabase Configuration (for authentication)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

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

### Password Lifecycle

**Initial Password:**
- Set by admin during user creation (or uses `DEFAULT_USER_PASSWORD`)
- Expires in 24 hours
- User receives email with temporary password

**First Login:**
- User logs in with temporary password
- System prompts for password change
- New password must meet security requirements

**Password Reset:**
- User clicks "Forgot Password"
- System sends reset link to email
- Link redirects to `/reset-password` page
- User creates new password

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

1. **Customize Email Templates**
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
  tenant_id = 'local-tenant-001'
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
