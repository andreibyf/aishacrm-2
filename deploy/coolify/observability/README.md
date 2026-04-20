# observability — OUT OF SCOPE

OpenReplay auto-manages its own stack (including its own Caddy) on the
production VPS under `/opt/openreplay` and is **not** part of this repo's
deployment split.

This folder is a tombstone. It can be safely deleted:

```
git rm -r deploy/coolify/observability
```

If anyone later needs to add true observability for aishacrm (metrics, traces,
logs pipeline), do it in a fresh domain folder with a clear scope — do not
resurrect this one.
