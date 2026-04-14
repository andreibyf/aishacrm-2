# AiSHA CRM Documentation

> Last updated: December 2025 | Version 3.0.x

## 📚 Core Documentation

| Document                                                                        | Description                                             | Audience       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------- |
| [USER_GUIDE.md](./user-guides/USER_GUIDE.md)                                    | Complete end-user guide for CRM operations              | Users          |
| [ADMIN_GUIDE.md](./admin-guides/ADMIN_GUIDE.md)                                 | System administration, tenant management, permissions   | Admins         |
| [OPENREPLAY_SETUP_GUIDE.md](./admin-guides/OPENREPLAY_SETUP_GUIDE.md)           | Session replay and assist-mode support operations       | Admins/Support |
| [OPENREPLAY_SELF_HOSTED_CICD.md](./admin-guides/OPENREPLAY_SELF_HOSTED_CICD.md) | OpenReplay infrastructure deployment via GitHub Actions | Admins/DevOps  |
| [AI_ASSISTANT_GUIDE.md](./user-guides/AI_ASSISTANT_GUIDE.md)                    | AiSHA AI assistant features and capabilities            | Users          |
| [DEVELOPER_MANUAL.md](./developer-docs/DEVELOPER_MANUAL.md)                     | Development setup, architecture, API reference          | Developers     |
| [DATABASE_GUIDE.md](./developer-docs/DATABASE_GUIDE.md)                         | Database schema, migrations, Supabase configuration     | DBAs/Devs      |
| [SECURITY_GUIDE.md](./admin-guides/SECURITY_GUIDE.md)                           | Security best practices, RLS policies, authentication   | Security       |
| [BRANDING_GUIDE.md](./references/BRANDING_GUIDE.md)                             | Brand assets, colors, typography                        | Design         |

## 📄 PDF Exports

- `Ai-SHA-CRM-User-Guide-2025-10-26.pdf` - Printable user guide
- `Ai-SHA-CRM-System-Admin-Guide-2025-10-26-new.pdf` - Printable admin guide

## 🗄️ Archive

Legacy and historical documentation is preserved in `archive/` for reference:

- `archive/legacy-docs/` - Superseded documentation
- `archive/guides/` - Old implementation guides
- `archive/reports/` - Test and verification reports

## 🌐 Online Documentation Freshness

User-facing online guides are served from `public/guides/` (PDF assets copied from `docs/`).

To keep online docs current after markdown/doc changes:

1. Regenerate the PDF guides from the latest markdown sources (especially user/admin guides).
2. Sync docs into `public/guides/` using:

```bash
node scripts/copy-docs-to-public.js
```

3. Rebuild/redeploy frontend so updated guide assets are served.

For user navigation and feature behavior, treat `docs/user-guides/USER_GUIDE.md` as the canonical source before PDF export.

## 🔗 Quick Links

- **Main README**: [../README.md](../README.md)
- **Changelog**: [../CHANGELOG.md](../CHANGELOG.md)
- **Claude Instructions**: [../CLAUDE.md](../CLAUDE.md)

---

## v3.0.0 Key Concepts

### CRM Lifecycle (BizDev → Lead → Contact/Account/Opportunity)

```
BizDev Source → promote → Lead → qualify → Lead (qualified) → convert → Contact + Account + Opportunity
```

### AI Assistant (AiSHA)

The AI assistant uses **Braid DSL tools** for CRM operations with full tenant isolation.
Tools are defined in `braid-llm-kit/examples/assistant/` and registered in `backend/lib/braidIntegration-v2.js`.

**Braid Tool API Endpoints (v3.1.6+):**
| Tool | Endpoint | Notes |
|------|----------|-------|
| accounts | `/api/v2/accounts` | List with `?search=` query param |
| contacts | `/api/v2/contacts` | List endpoint |
| leads | `/api/v2/leads` | List endpoint |
| opportunities | `/api/v2/opportunities` | List endpoint |
| activities | `/api/v2/activities` | List endpoint |
| notes | `/api/notes` | List endpoint |

**Testing Braid SDK:**

```bash
# Run all Braid SDK tests (40 tests)
docker exec aishacrm-backend sh -c "cd /app/backend && doppler run -- node --test __tests__/ai/braidScenarios.test.js __tests__/ai/braidToolExecution.test.js"
```

### Entity Label Customization

Tenants can customize entity names (e.g., "Clients" instead of "Accounts").
The AI dynamically loads the tenant's terminology via `tenantContextDictionary.js`.
