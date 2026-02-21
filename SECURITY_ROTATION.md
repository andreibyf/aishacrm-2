# SECURITY INCIDENT: Exposed Production Secrets

**Date**: February 21, 2026  
**Severity**: CRITICAL  
**Status**: MITIGATED (secrets removed from git, rotation required)

## Incident Summary

Production secrets were accidentally committed to the git repository in `.env.production.recommended`. The file has been removed from git tracking and added to `.gitignore`.

## Exposed Secrets (MUST ROTATE IMMEDIATELY)

### 1. Database Credentials

- **SUPABASE_SERVICE_ROLE_KEY**: Full admin access to Supabase
  - Action: Generate new service role key in Supabase Dashboard
  - Location: Settings > API > Generate new service_role key
- **DATABASE_URL** (PostgreSQL password): `Aml834VyYYH6humU`
  - Action: Change database password in Supabase Dashboard
  - Update connection strings after rotation

### 2. Authentication Secrets

- **SESSION_SECRET**: `AVGI0HjFCxp20bick3qLODK3R5o7OVVu`
  - New value: `yr3zDCFLhjomDgkXU5GHVBDexmMcdB5vgLTy2b0JCug=`
- **JWT_SECRET**: (128 chars, exposed)
  - New value: `a3e8f5756f22e5ff411f7923f654a7b84f3095c88d0e62076dbe376a7787fc1ae7413ca08e1b6a0d9a8a81ec021608ea0f5852ef7f33e6956089b48623ec84b8`

### 3. Security Systems

- **IDR_EMERGENCY_SECRET**: (emergency unblock bypass)
  - New value: `b019dfb6445dde10fa0935ab0e39b3a6d14eaa791c23748ef732613e41001c3b`
- **MCP_SECRET**: (MCP server auth)
  - New value: `vy5ozPmO4u87M+YTeunYmi1nh/GoGwtJ`

### 4. Third-Party Services

- **OPENAI_API_KEY**: `sk-svcacct-om8TLEl7BYOea...`
  - Action: Revoke and generate new key at https://platform.openai.com/api-keys
- **N8N_PASSWORD**: `MvjmY1g1heQe3vf2`
  - Action: Change password in N8N admin interface
- **SMTP_PASS** (Gmail): `RbM6Zn&3d=nX4rF>`
  - Action: Generate new app-specific password in Google Account settings

## Rotation Steps

### Immediate (Do Now)

1. **OpenAI API Key**:

   ```bash
   # Revoke exposed key
   # Visit: https://platform.openai.com/api-keys
   # Click "Revoke" on the exposed key
   # Generate new key and update in Doppler/environment
   ```

2. **Supabase Service Role Key**:

   ```bash
   # Warning: This will invalidate all API calls using the old key
   # Coordinate downtime or use rolling deployment
   # 1. Generate new key in Supabase Dashboard
   # 2. Update SUPABASE_SERVICE_ROLE_KEY in production env
   # 3. Restart all services
   ```

3. **Update Internal Secrets** (can do without downtime):

   ```bash
   # Update in Doppler or .env.production.actual
   SESSION_SECRET=yr3zDCFLhjomDgkXU5GHVBDexmMcdB5vgLTy2b0JCug=
   JWT_SECRET=a3e8f5756f22e5ff411f7923f654a7b84f3095c88d0e62076dbe376a7787fc1ae7413ca08e1b6a0d9a8a81ec021608ea0f5852ef7f33e6956089b48623ec84b8
   IDR_EMERGENCY_SECRET=b019dfb6445dde10fa0935ab0e39b3a6d14eaa791c23748ef732613e41001c3b
   MCP_SECRET=vy5ozPmO4u87M+YTeunYmi1nh/GoGwtJ

   # WARNING: Changing JWT_SECRET will invalidate all active sessions
   # Users will need to log in again
   ```

### Within 24 Hours

4. **Database Password**:
   - Change in Supabase Dashboard > Database > Settings
   - Update DATABASE_URL in all environments

5. **Email Password**:
   - Generate new Gmail app-specific password
   - Update SMTP_PASS

6. **N8N Password**:
   - Change via N8N admin panel
   - Update N8N_PASSWORD

## Preventative Measures Implemented

1. ✅ Removed `.env.production.recommended` from git
2. ✅ Added `.env.production.*` to `.gitignore` (except .template)
3. ✅ Created `.env.production.template` with placeholders
4. ✅ Generated new random secrets above

## Best Practices Going Forward

1. **Use Doppler for Production**:

   ```bash
   doppler run -- npm start
   ```

2. **Never Commit .env Files**:
   - Use `.env.example` or `.template` files
   - Keep actual secrets in `.gitignore`

3. **Use GitHub Secrets for CI/CD**:
   - Store secrets in repository settings
   - Reference as `${{ secrets.SECRET_NAME }}`

4. **Regular Secret Rotation**:
   - Rotate production secrets quarterly
   - Rotate immediately if exposure suspected

5. **Secret Scanning**:
   - Enable GitHub secret scanning
   - Use pre-commit hooks to prevent commits

## Verification

After rotation, verify:

- [ ] Application starts successfully
- [ ] Database connections work
- [ ] API authentication works
- [ ] External services (OpenAI, email) function
- [ ] Users can log in (may need to re-authenticate)

## Contact

If you discover the exposed secrets being used maliciously:

1. Immediately rotate ALL secrets
2. Review Supabase audit logs
3. Check for unauthorized database access
4. Review application logs for suspicious activity

---

**This incident has been addressed. Track rotation progress above.** ✅
