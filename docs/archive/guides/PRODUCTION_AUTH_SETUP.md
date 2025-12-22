# Production Authentication Setup Guide

Complete guide for configuring authentication in production deployment of AI-SHA CRM.

## Overview

This guide covers:
1. ✅ Adding "Forgot Password" to login UI (COMPLETED)
2. ✅ Disabling dev auto-login in production (COMPLETED)
3. ✅ Creating initial superadmin user (COMPLETED)
4. 🔧 Updating Supabase Site URL and redirect URLs
5. 🔧 Testing complete auth flow

---

## 1. Frontend Changes (COMPLETED ✅)

### Added Forgot Password Feature

**File:** `src/pages/Layout.jsx`

Added "Forgot Password?" button to login form (after password field):
- Validates email is entered before sending reset email
- Calls `supabase.auth.resetPasswordForEmail()` with redirect to `/reset-password`
- Shows user-friendly success/error messages
- Links to existing `ResetPassword.jsx` component

**Code Location:** Lines 2170-2210 in Layout.jsx

### Disabled Dev Auto-Login

**File:** `src/components/shared/tenantContext.jsx`

Added production environment check to prevent auto-tenant selection:
```javascript
// Skip auto-selection in production
if (import.meta.env.PROD) {
  return;
}
```

**Effect:** Production builds will NO LONGER automatically redirect to `?tenant=6cb4c008-4847-426a-9a2e-918ad70e7b69`

---

## 2. Create Initial Admin User (COMPLETED ✅)

### Script Location

**File:** `backend/scripts/create-admin.js`

Creates superadmin user using Supabase Admin API (service_role key).

### Environment Variables Required

Add to `/opt/aishacrm/.env`:

```bash
# Admin User Setup (for create-admin.js script)
ADMIN_EMAIL=admin@aishacrm.com
ADMIN_PASSWORD=YourSecurePassword123!

# Supabase Service Role Key (from Supabase Dashboard > Settings > API)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important Security Notes:**
- Use a STRONG password (min 8 characters, mix of letters/numbers/symbols)
- Service role key has full database access - keep it secret!
- Never commit `.env` to git
- Change default password after first login

### Running the Script

#### Option A: Via Docker (Recommended)

```bash
# On your VPS at /opt/aishacrm
cd /opt/aishacrm

# Add admin credentials to .env
nano .env
# Add:
# ADMIN_EMAIL=admin@aishacrm.com
# ADMIN_PASSWORD=YourSecurePassword123!
# SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Restart backend to load new env vars
docker-compose down backend
docker-compose up -d backend

# Run the script inside the container
docker exec -it aishacrm-backend node /app/scripts/create-admin.js
```

#### Option B: Locally (Development)

```bash
cd backend

# Add credentials to backend/.env
# Then run:
node scripts/create-admin.js
```

### Expected Output

```
╔══════════════════════════════════════════════╗
║   AI-SHA CRM - Admin User Creation Script   ║
╚══════════════════════════════════════════════╝

Configuration:
  Supabase URL: https://ehjlenywplgyiahgxkfj.supabase.co
  Admin Email:  admin@aishacrm.com
  Password:     ************************ (24 characters)

🔍 Checking if user already exists...
✓ No existing user found, creating new admin user...

📝 Creating admin user in Supabase Auth...
✅ Auth user created successfully!
   User ID: 8f3a9c1e-4b2d-4e5f-9c1a-3d5e7f8b9a0c

📝 Creating user record in users table...
✅ User record created successfully!

╔═══════════════════════════════════════════════╗
║          Admin User Created Successfully!     ║
╚═══════════════════════════════════════════════╝

You can now sign in at:
  URL:      https://app.aishacrm.com
  Email:    admin@aishacrm.com
  Password: YourSecurePassword123!
  Role:     superadmin
  Tenant:   00000000-0000-0000-0000-000000000000 (superadmin global access)

✨ Next steps:
   1. Sign in with the credentials above
   2. Create tenant organizations for your customers
   3. Create regular users and assign them to tenants
   4. Update Supabase Site URL to https://app.aishacrm.com
   5. Configure email templates in Supabase dashboard
```

### Troubleshooting

**Error: "SUPABASE_SERVICE_ROLE_KEY not found"**
- Get service_role key from Supabase Dashboard → Settings → API → service_role (secret)
- NOT the anon/public key - you need service_role for admin operations

**Error: "Could not create user record in users table"**
- Auth user was created successfully (you can sign in)
- Users table entry failed (likely RLS policy issue)
- Manually insert row or adjust RLS policies for superadmin

**User already exists**
- Script will update the password instead of creating new user
- Useful for password resets

---

## 3. Update Supabase Site URL (TODO 🔧)

### Problem

Password reset emails currently point to `http://localhost:4000/reset-password` because Supabase Site URL is still set to localhost.

### Solution: Use Supabase CLI

The Supabase Dashboard doesn't allow editing redirect URLs directly. Use the CLI instead:

#### Step 1: Install Supabase CLI

```bash
# On your VPS or local machine
npm install -g supabase
```

#### Step 2: Link to Your Project

```bash
# Link to your Supabase project
supabase link --project-ref ehjlenywplgyiahgxkfj

# You'll be prompted for your Supabase access token
# Get it from: https://supabase.com/dashboard/account/tokens
```

#### Step 3: Update Site URL in config.toml

Create/update `supabase/config.toml`:

```toml
[auth]
site_url = "https://app.aishacrm.com"
additional_redirect_urls = [
  "https://app.aishacrm.com/**",
  "https://app.aishacrm.com/reset-password",
  "http://localhost:4000/**"  # Keep for local dev
]

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false  # Set to true if you want email verification

[auth.email.template.reset_password]
subject = "Reset Your AI-SHA CRM Password"
```

#### Step 4: Push Configuration

```bash
supabase db push
```

### Alternative: Manual Update via Supabase Management API

If CLI doesn't work, use the Management API:

```bash
# Get your service_role key
SERVICE_ROLE_KEY="eyJ..."
PROJECT_REF="ehjlenywplgyiahgxkfj"

curl -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "SITE_URL": "https://app.aishacrm.com",
    "REDIRECT_URLS": "https://app.aishacrm.com/**,https://app.aishacrm.com/reset-password"
  }'
```

### Verify Configuration

After updating:

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Verify Site URL shows: `https://app.aishacrm.com`
3. Verify Redirect URLs include your production domain

---

## 4. Rebuild Frontend with Production URLs (TODO 🔧)

### Check Current Build

The frontend container may have localhost URLs embedded from the build process. Verify:

```bash
# On VPS
docker exec -it aishacrm-frontend cat /usr/share/nginx/html/index.html | grep localhost

# If you see localhost:4001 references, rebuild is needed
```

### Rebuild with Production URLs

If localhost URLs are embedded, rebuild the frontend:

```bash
# On your development machine
cd /path/to/ai-sha-crm-copy

# Ensure .env has production values
echo "VITE_AISHACRM_BACKEND_URL=https://app.aishacrm.com/api" > .env
echo "VITE_SUPABASE_URL=https://ehjlenywplgyiahgxkfj.supabase.co" >> .env
echo "VITE_SUPABASE_ANON_KEY=eyJ..." >> .env

# Build and push new image
docker build -t ghcr.io/andreibyf/aishacrm-2-frontend:v1.0.4 .
docker push ghcr.io/andreibyf/aishacrm-2-frontend:v1.0.4

# On VPS: Update docker-compose.prod.yml to use v1.0.4
# Then:
docker-compose down frontend
docker-compose pull frontend
docker-compose up -d frontend
```

---

## 5. Test Complete Auth Flow (TODO 🔧)

### Test Checklist

Once everything is configured:

#### ✅ Login Test
1. Navigate to `https://app.aishacrm.com`
2. Should see login form (NO auto-redirect to ?tenant=6cb4c008-4847-426a-9a2e-918ad70e7b69)
3. Enter admin@aishacrm.com and password
4. Should successfully sign in and load dashboard

#### ✅ Forgot Password Test
1. Go to `https://app.aishacrm.com` (logged out)
2. Enter email in email field
3. Click "Forgot Password?" button
4. Should see "Password reset email sent! Please check your inbox."
5. Check email inbox for reset link
6. Reset link should point to: `https://app.aishacrm.com/reset-password?token_hash=...`

#### ✅ Password Reset Test
1. Click reset link from email
2. Should load `ResetPassword.jsx` component
3. Enter new password (twice for confirmation)
4. Click "Reset Password"
5. Should redirect to login page
6. Sign in with NEW password - should work

#### ✅ Logout Test
1. After signing in, click user menu (top right)
2. Click "Logout"
3. Should sign out and return to login page
4. No auto-login should occur

#### ✅ Tenant Selection Test
1. Sign in as superadmin
2. Top navigation should show "No Client" or tenant switcher
3. Create a test tenant organization
4. Switch to that tenant
5. URL should update to `?tenant=<uuid>`
6. Reload page - tenant selection should persist

---

## 6. Email Template Configuration (TODO 🔧)

### Customize Password Reset Email

Go to Supabase Dashboard → Authentication → Email Templates → Reset Password

**Suggested Template:**

```html
<h2>Reset Your AI-SHA CRM Password</h2>

<p>Hi there,</p>

<p>You requested to reset your password for AI-SHA CRM. Click the button below to set a new password:</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>

<p>Or copy and paste this link into your browser:</p>
<p>{{ .ConfirmationURL }}</p>

<p>If you didn't request this password reset, you can safely ignore this email.</p>

<p>This link will expire in 24 hours.</p>

<hr>
<p style="font-size: 12px; color: #666;">
  AI-SHA CRM by 4V Data Consulting<br>
  <a href="https://app.aishacrm.com">https://app.aishacrm.com</a>
</p>
```

**Variables Available:**
- `{{ .ConfirmationURL }}` - The reset password link
- `{{ .Token }}` - Raw token (use ConfirmationURL instead)
- `{{ .Email }}` - User's email address
- `{{ .SiteURL }}` - Your configured site URL

---

## 7. Security Best Practices

### Production Checklist

- ✅ Use strong ADMIN_PASSWORD (min 8 chars, mix of letters/numbers/symbols)
- ✅ Keep SUPABASE_SERVICE_ROLE_KEY secret (never commit to git)
- ✅ Enable HTTPS only (Cloudflare tunnel handles this)
- ✅ Configure CORS properly (ALLOWED_ORIGINS in backend .env)
- ✅ Enable RLS (Row Level Security) on all Supabase tables
- ✅ Set up proper backup strategy for Supabase database
- ✅ Enable MFA (Multi-Factor Authentication) for admin accounts
- ✅ Regularly rotate admin passwords
- ✅ Monitor authentication logs in Supabase Dashboard
- ✅ Set up email rate limiting to prevent abuse

### Recommended Supabase Auth Settings

Dashboard → Authentication → Providers → Email:

- **Enable signup:** Yes (so you can create new users)
- **Confirm email:** Yes (recommended for security)
- **Email change confirmation:** Yes
- **Secure password change:** Yes
- **Minimum password length:** 8 characters

Dashboard → Authentication → Rate Limits:

- **Email/password sign in:** 30 per hour per IP
- **Email/password signup:** 10 per hour per IP
- **Password reset:** 5 per hour per email

---

## 8. Troubleshooting

### "Invalid login credentials"

**Causes:**
- Wrong email/password
- User doesn't exist yet (run create-admin.js)
- Email not confirmed (check Supabase Auth users table)

**Solutions:**
```bash
# Re-run admin creation script to reset password
docker exec -it aishacrm-backend node /app/scripts/create-admin.js

# Check Supabase Dashboard → Authentication → Users
# Verify user exists and email_confirmed_at is set
```

### "Password reset email not received"

**Causes:**
- SMTP not configured in Supabase
- Email in spam folder
- Site URL still pointing to localhost

**Solutions:**
1. Check Supabase Dashboard → Settings → Auth → Email Templates
2. Verify SMTP settings or use Supabase's default email service
3. Update Site URL to https://app.aishacrm.com (see step 3 above)
4. Check spam folder
5. Test email delivery: Dashboard → Authentication → Users → Send Password Reset

### "Redirect URL not allowed"

**Cause:** The URL in password reset email doesn't match Supabase redirect URLs

**Solution:**
```bash
# Add to Supabase redirect URLs:
https://app.aishacrm.com/**
https://app.aishacrm.com/reset-password

# Via CLI or Management API (see step 3)
```

### "Auto-redirect to ?tenant=6cb4c008-4847-426a-9a2e-918ad70e7b69 still happening"

**Cause:** Frontend container has old build without production environment check

**Solution:**
```bash
# Rebuild frontend with latest code
docker-compose build frontend
docker-compose up -d frontend

# Or pull latest image if already pushed to GHCR
docker-compose pull frontend
docker-compose up -d frontend
```

### "Failed to send reset email: Invalid redirectTo"

**Cause:** redirectTo URL in code doesn't match Supabase allowed redirects

**Solution:**
Verify Layout.jsx line 2188 has correct URL:
```javascript
redirectTo: `${window.location.origin}/reset-password`
// Should resolve to: https://app.aishacrm.com/reset-password
```

---

## 9. Next Steps After Setup

1. **Create Tenant Organizations**
   - Sign in as superadmin
   - Go to Settings → Tenants
   - Create tenants for each customer/organization

2. **Create Regular Users**
   - Settings → Users → Add User
   - Assign users to specific tenants
   - Set appropriate roles (admin, user, etc.)

3. **Configure Branding**
   - Settings → Branding
   - Upload logo, set colors for each tenant
   - Customize for white-label experience

4. **Set Up Email Templates**
   - Customize all Supabase email templates
   - Add your branding/logo
   - Update footer with company info

5. **Enable Additional Auth Providers** (Optional)
   - Supabase Dashboard → Authentication → Providers
   - Enable Google, GitHub, Azure AD, etc.
   - Configure OAuth credentials

6. **Monitor & Maintain**
   - Check system logs regularly
   - Monitor authentication attempts
   - Review audit logs for suspicious activity
   - Keep Docker images updated

---

## 10. Quick Reference

### Important URLs

- **Production App:** https://app.aishacrm.com
- **Backend API:** https://app.aishacrm.com/api
- **Supabase Dashboard:** https://supabase.com/dashboard/project/ehjlenywplgyiahgxkfj
- **Cloudflare Tunnel:** Check /etc/cloudflared/config.yml

### Important Files

- **Frontend Login:** `src/pages/Layout.jsx` (lines 2065-2210)
- **Tenant Context:** `src/components/shared/tenantContext.jsx` (lines 270-285)
- **Password Reset:** `src/pages/ResetPassword.jsx`
- **Admin Script:** `backend/scripts/create-admin.js`
- **Production Env:** `/opt/aishacrm/.env`
- **Docker Compose:** `/opt/aishacrm/docker-compose.prod.yml`

### Key Commands

```bash
# Check container status
docker ps

# View backend logs
docker logs aishacrm-backend -f

# Restart containers
docker-compose restart

# Create admin user
docker exec -it aishacrm-backend node /app/scripts/create-admin.js

# Update Supabase config
supabase link --project-ref ehjlenywplgyiahgxkfj
supabase db push
```

---

**Last Updated:** 2025-01-XX  
**Version:** 1.0.4  
**Author:** AI-SHA CRM Team
