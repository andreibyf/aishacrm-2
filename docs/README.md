# AiSHA CRM Documentation

> Last updated: December 2025 | Version 3.0.x

## 📚 Core Documentation

| Document | Description | Audience |
|----------|-------------|----------|
| [USER_GUIDE.md](USER_GUIDE.md) | Complete end-user guide for CRM operations | Users |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | System administration, tenant management, permissions | Admins |
| [AI_ASSISTANT_GUIDE.md](AI_ASSISTANT_GUIDE.md) | AiSHA AI assistant features and capabilities | Users |
| [DEVELOPER_MANUAL.md](DEVELOPER_MANUAL.md) | Development setup, architecture, API reference | Developers |
| [DATABASE_GUIDE.md](DATABASE_GUIDE.md) | Database schema, migrations, Supabase configuration | DBAs/Devs |
| [SECURITY_GUIDE.md](SECURITY_GUIDE.md) | Security best practices, RLS policies, authentication | Security |
| [BRANDING_GUIDE.md](BRANDING_GUIDE.md) | Brand assets, colors, typography | Design |

## 📄 PDF Exports

- `Ai-SHA-CRM-User-Guide-2025-10-26.pdf` - Printable user guide
- `Ai-SHA-CRM-System-Admin-Guide-2025-10-26-new.pdf` - Printable admin guide

## 🗄️ Archive

Legacy and historical documentation is preserved in `archive/` for reference:
- `archive/legacy-docs/` - Superseded documentation
- `archive/guides/` - Old implementation guides
- `archive/reports/` - Test and verification reports

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

### Entity Label Customization

Tenants can customize entity names (e.g., "Clients" instead of "Accounts").
The AI dynamically loads the tenant's terminology via `tenantContextDictionary.js`.
