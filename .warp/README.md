# Warp customization for AiSHA CRM

Solo-operator workflow shortcuts, AI assistant rules, and runbooks tuned to
the AiSHA CRM stack. Imported into [Warp Drive](https://www.warp.dev/drive).

## Layout

```
.warp/
├── README.md           # this file
├── env.yaml            # environment variables to set in Warp Drive
├── workflows/          # parameterized command shortcuts (YAML)
└── notebooks/          # multi-step runbooks (Markdown)
```

**AI assistant rules** live in the repo-root `AGENTS.md` (Warp + Codex +
other AI tools all read that file by convention). Don't put rules here.

## How to import

**Workflows:** Warp Drive sidebar → click `+` → `Import` → select all `.yaml`
files in `workflows/`. They appear under "Personal" by default; drag into a
folder named "AiSHA" to keep them grouped.

**Rules:** No import needed. Warp's AI agent reads `AGENTS.md` from the
repo root automatically — the operational rules section there is the
canonical source.

**Notebooks:** Warp Drive sidebar → click `+` → `Import` → select files in
`notebooks/`. Notebooks are runnable — click each command block to execute.

**Environment variables:** Warp Drive sidebar → click `+` → `Environment
variables` → paste the contents of `env.yaml` and replace placeholder
values with your actual ones.

## Conventions

All workflows are prefixed `aisha` so typing `aisha` in Warp's command
launcher surfaces the full set. Naming pattern:

- `aisha {host} health` — SSH + diagnostic snapshot
- `aisha {host} logs {service}` — tail logs
- `aisha {host} reboot` — reboot recovery
- `aisha {action}` — repo/deploy actions

## When workflows fail

If a workflow errors, the most common causes:

1. **Env vars not set** — check Warp Drive → Environment variables
2. **SSH key not loaded** — `ssh-add ~/.ssh/your_key` on Windows after each reboot
3. **VPS-1 locked** — that's the known recurring issue; run `aisha staging reboot`
4. **Coolify down** — `aisha services health` to check VPS-2 (where Coolify runs)

## Maintenance

These files are version-controlled. When you tweak a workflow in Warp's UI,
also update the corresponding YAML here and commit. Otherwise the next
machine you set up will get the old version.
