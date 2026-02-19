# PLAN

## Feature Identity

- **Name**: PEP Phase 1-A — Catalog Migration from JSON to YAML
- **Description**: Migrate `pep/catalogs/` from JSON to YAML format. Update the compiler to parse YAML. All tests must continue to pass. No other behavior changes.
- **Value**: YAML is human-authored config. JSON is machine-generated output. The catalogs are human-authored — they will be edited frequently as new domains are added. YAML allows comments, cleaner syntax, and more readable Git diffs. The compiled artifacts (`semantic_frame.json`, `braid_ir.json`, `plan.json`, `audit.json`) stay JSON — they are machine-generated.
- **In-scope**:
  - Rename `entity-catalog.json` → `entity-catalog.yaml` (convert content to YAML)
  - Rename `capability-catalog.json` → `capability-catalog.yaml` (convert content to YAML)
  - Update `pep/compiler/index.js` → `loadDefaultCatalogs()` reads `.yaml` files using the `yaml` package
  - Update `pep/tests/compiler.test.js` → load `.yaml` files instead of `.json`
  - Update `pep/README.md` → reflect new file names and format
  - Update `BRAID_PEP_JOURNAL.md` → record format decision and rationale
- **Out-of-scope**:
  - No changes to compiled artifacts (stay JSON)
  - No changes to `source.pep.md`
  - No changes to compiler logic (parser, resolver, emitter)
  - No changes to `pepRuntime.js`
  - No changes to `cashflow.braid` or `types.braid`
  - No new features

---

## Dependency

The `yaml` package (v2.8.2) is already installed in `backend/devDependencies`. It does
**not** need to be installed — it is available. The compiler imports it directly.

**Import to use in `pep/compiler/index.js`:**

```javascript
import { parse as parseYaml } from 'yaml';
```

Do NOT use `js-yaml`. Use the `yaml` package already present in the repo.

---

## YAML Format Rules

- Preserve all existing data exactly — only the format changes, not the content
- Add a comment block at the top of each `.yaml` file explaining what it is
- Add inline comments on non-obvious fields (e.g. ISO-8601 duration values)
- Use 2-space indentation (matches existing repo style)
- String values that contain special YAML characters must be quoted

---

## Expected YAML Output

### entity-catalog.yaml

```yaml
# PEP Entity Catalog
# Maps domain-agnostic entity names to AiSHA CRM bindings.
# Add new entities here when extending PEP to new domains.
# Human-authored — YAML preferred over JSON for readability and comments.

version: '1.0.0'
entities:
  - id: CashFlowTransaction
    description: A financial transaction record (income or expense)
    aisha_binding:
      table: cash_flow
      route: /api/cashflow
    attributes:
      id:
        type: String
        required: false
      tenant_id:
        type: String
        required: true
      transaction_type:
        type: String
        enum: [income, expense]
        required: true
      amount:
        type: Number
        required: true
      transaction_date:
        type: String
        format: date
        required: true
      category:
        type: String
        required: true
      description:
        type: String
        required: true
      is_recurring:
        type: Boolean
        default: false
      recurrence_pattern:
        type: String
        enum: [weekly, monthly, quarterly, annually]
      status:
        type: String
        enum: [actual, projected, pending, cancelled]
      entry_method:
        type: String
        enum: [manual, crm_auto, document_extracted, recurring_auto]
    events:
      TransactionCreated: Fired when a new cash_flow record is inserted
      TransactionUpdated: Fired when a cash_flow record is updated
      RecurringTransactionDue: Fired when is_recurring=true and next date has been reached
```

### capability-catalog.yaml

```yaml
# PEP Capability Catalog
# Maps abstract capability names to AiSHA CRM tool bindings.
# Capabilities are platform-agnostic — bindings are AiSHA-specific.
# Add new capabilities here when extending PEP to new domains.
# Human-authored — YAML preferred over JSON for readability and comments.

version: '1.0.0'
capabilities:
  - id: persist_entity
    abstract: StoreRecord
    description: Create or update a business entity record
    bindings:
      CashFlowTransaction:
        create:
          braid_tool: createCashFlowTransaction
          http: POST /api/cashflow
        update:
          braid_tool: updateCashFlowTransaction
          http: PUT /api/cashflow/:id
    effects: ['!net']
    policy: WRITE_OPERATIONS

  - id: read_entity
    abstract: ReadRecord
    description: Read or list business entity records
    bindings:
      CashFlowTransaction:
        list:
          braid_tool: listCashFlowTransactions
          http: GET /api/cashflow
        get:
          braid_tool: getCashFlowTransaction
          http: GET /api/cashflow/:id
    effects: ['!net']
    policy: READ_ONLY

  - id: notify_role
    abstract: SendMessage
    description: Notify a role or actor about an event
    bindings:
      owner:
        braid_tool: notifyOwner
        http: POST /api/notifications
      manager:
        braid_tool: notifyManager
        http: POST /api/notifications
    effects: ['!net']
    policy: WRITE_OPERATIONS

  - id: compute_next_date
    abstract: TimeCalculation
    description: Calculate the next occurrence date from a recurrence pattern
    bindings:
      weekly:
        duration: P7D # ISO-8601: 7 days
      monthly:
        duration: P1M # ISO-8601: 1 month
      quarterly:
        duration: P3M # ISO-8601: 3 months
      annually:
        duration: P1Y # ISO-8601: 1 year
    effects: ['!clock']
    policy: READ_ONLY
```

---

## Updated `loadDefaultCatalogs()` in `pep/compiler/index.js`

Replace the existing `loadDefaultCatalogs` function with:

```javascript
import { parse as parseYaml } from 'yaml';

function loadDefaultCatalogs() {
  const entity_catalog = parseYaml(readFileSync(join(CATALOGS_DIR, 'entity-catalog.yaml'), 'utf8'));
  const capability_catalog = parseYaml(
    readFileSync(join(CATALOGS_DIR, 'capability-catalog.yaml'), 'utf8'),
  );
  return { entity_catalog, capability_catalog };
}
```

---

## Updated Test Catalog Loading in `pep/tests/compiler.test.js`

Replace the existing JSON catalog loading at the top of the test file with:

```javascript
import { parse as parseYaml } from 'yaml';

const entityCatalog = parseYaml(
  readFileSync(join(__dirname, '..', 'catalogs', 'entity-catalog.yaml'), 'utf8'),
);
const capabilityCatalog = parseYaml(
  readFileSync(join(__dirname, '..', 'catalogs', 'capability-catalog.yaml'), 'utf8'),
);
```

---

## Ordered Implementation Steps

| #   | Step                                                                                                                                   | Verifiable Output                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Create `pep/catalogs/entity-catalog.yaml` with content matching the YAML spec above                                                    | File exists; `node -e "import('yaml').then(m => console.log(m.parse(require('fs').readFileSync('pep/catalogs/entity-catalog.yaml','utf8'))))"` prints the parsed object without error |
| 2   | Create `pep/catalogs/capability-catalog.yaml` with content matching the YAML spec above                                                | File exists; parses without error; contains all 4 capabilities                                                                                                                        |
| 3   | Delete `pep/catalogs/entity-catalog.json`                                                                                              | File no longer exists                                                                                                                                                                 |
| 4   | Delete `pep/catalogs/capability-catalog.json`                                                                                          | File no longer exists                                                                                                                                                                 |
| 5   | Update `pep/compiler/index.js` — add `import { parse as parseYaml } from 'yaml'`; update `loadDefaultCatalogs()` to read `.yaml` files | `node pep/compiler/index.js --source pep/programs/cashflow/source.pep.md` still prints compiled output                                                                                |
| 6   | Update `pep/tests/compiler.test.js` — load `.yaml` files using `parseYaml`                                                             | File updated; no JSON catalog references remain                                                                                                                                       |
| 7   | Run all 15 tests                                                                                                                       | `node --test pep/tests/compiler.test.js` exits 0, all 15 pass                                                                                                                         |
| 8   | Regenerate compiled artifacts (re-run generate.js to confirm compiler still works end-to-end)                                          | `node pep/programs/cashflow/generate.js` exits 0; artifact files unchanged in content                                                                                                 |
| 9   | Update `pep/README.md` — replace all `.json` catalog references with `.yaml`; add note explaining format decision                      | README accurate                                                                                                                                                                       |
| 10  | Update `BRAID_PEP_JOURNAL.md` — add Phase 1-A entry recording format decision and rationale                                            | Journal updated                                                                                                                                                                       |

---

## Definition of Done

- [ ] `pep/catalogs/entity-catalog.yaml` exists and parses correctly
- [ ] `pep/catalogs/capability-catalog.yaml` exists and parses correctly
- [ ] `pep/catalogs/entity-catalog.json` deleted
- [ ] `pep/catalogs/capability-catalog.json` deleted
- [ ] `pep/compiler/index.js` imports `yaml` package and reads `.yaml` files
- [ ] `pep/tests/compiler.test.js` loads `.yaml` catalogs
- [ ] All 15 tests pass: `node --test pep/tests/compiler.test.js` exits 0
- [ ] `node pep/programs/cashflow/generate.js` exits 0
- [ ] No references to `.json` catalog files remain anywhere in `pep/`
- [ ] `pep/README.md` updated
- [ ] `BRAID_PEP_JOURNAL.md` updated
- [ ] No existing backend tests broken: `docker exec aishacrm-backend npm test` exits 0

---

## Notes for Copilot

1. **Use the `yaml` package** — `import { parse as parseYaml } from 'yaml'`. It is already installed. Do NOT install `js-yaml` or any other YAML library.
2. **Delete the old JSON files** — do not leave both formats in the directory.
3. **Content must be identical** — the YAML files must parse to the exact same JavaScript objects as the JSON files did. Run the tests to verify.
4. **Do not touch** — `pep/compiler/parser.js`, `pep/compiler/resolver.js`, `pep/compiler/emitter.js`, `pep/runtime/pepRuntime.js`, `cashflow.braid`, `types.braid`, any backend file, any frontend file, any migration.
5. **Compiled artifacts stay JSON** — `semantic_frame.json`, `braid_ir.json`, `plan.json`, `audit.json` are machine-generated outputs and remain JSON.
