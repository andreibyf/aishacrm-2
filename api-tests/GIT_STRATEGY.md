# API Tests - Git Strategy

## Summary

✅ **`api-tests/` directory IS tracked in git**  
❌ **`*.local.http` files are NOT tracked** (added to `.gitignore`)

## File Structure

```
api-tests/
├── braid-mcp.http          ✅ Tracked - Template with placeholders
├── braid-mcp.local.http    ❌ Ignored - Your actual credentials
└── README.md               ✅ Tracked - Documentation
```

## Why This Approach?

### Benefits:

1. **Team Collaboration**
   - Everyone gets the same test templates
   - Consistent API testing across team
   - Easy onboarding for new developers

2. **Security**
   - Actual credentials stay local
   - No risk of committing tenant IDs
   - `.local.http` pattern is ignored globally

3. **Flexibility**
   - Each developer can have different tenant IDs
   - Local environment customization
   - No merge conflicts on credentials

## What's in Git vs Local

### Git (Shared with Team):
```http
@baseUrl = http://localhost:8000
@tenantId = YOUR_TENANT_ID_HERE  ← Placeholder
```

### Local (Your Machine Only):
```http
@baseUrl = http://localhost:8000
@tenantId = a11dfb63-4b18-4eb8-872e-747af2e37c46  ← Real ID
```

## Updated .gitignore

```gitignore
# API test files with actual credentials
*.local.http
```

This ensures all `.local.http` files are automatically ignored.

## How to Use

1. **Clone the repo** → Get `braid-mcp.http` template
2. **Already created** → `braid-mcp.local.http` with your tenant ID
3. **Test away** → Use the `.local.http` file
4. **Git ignores it** → No risk of committing credentials

## For New Team Members

```bash
# Copy template
cp api-tests/braid-mcp.http api-tests/braid-mcp.local.http

# Edit with your tenant ID
# Then test!
```

## Comparison: .http files vs Thunder Client

| Feature | .http files | Thunder Client |
|---------|-------------|----------------|
| Free | ✅ Yes | ⚠️ Limited |
| Version Control | ✅ Easy | ❌ Hard |
| Team Sharing | ✅ Templates | ⚠️ Export/Import |
| Security | ✅ `.local` pattern | ⚠️ Manual |
| Response Storage | ❌ No | ✅ Yes |

## Best Practice

Use **both**:
- **`.http` files** → For version-controlled tests (team)
- **Thunder Client** → For ad-hoc testing and response inspection (personal)

Both can coexist peacefully! 🤝

---

**Status:** API tests are safely tracked with credentials protected! 🔒
