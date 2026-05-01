#!/usr/bin/env python3
"""
Provision the `staging-braid` Coolify Application on the beige-koala
(Staging) server pointing at OneDev with /staging/04-braid/docker-compose.yml.
Then trigger first deploy and verify.

Phase 2 service #2: mcp (Braid MCP server + 2 workers).
Mirrors provision-and-deploy-staging-litellm.py exactly — same lessons applied.
"""
import json, os, sys, time, urllib.request, urllib.error

TOKEN = os.environ["COOLIFY_TOKEN"]
BASE = os.environ.get("COOLIFY_BASE_URL", "https://deploy.aishacrm.com").rstrip("/")
ONEDEV_TOKEN = os.environ["ONEDEV_TOKEN"]
DOPPLER_TOKEN_STAGING = os.environ.get("DOPPLER_TOKEN_STAGING") or os.environ.get("STG_DOPPLER_TOKEN", "")
HDRS = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

STAGING_SERVER_UUID = "f7uzrwlbqjtx6qamppma5xsz"   # beige-koala
STAGING_PROJECT_UUID = "b78ljy1xtefe1vnaktddgk17"  # aishacrm-staging
APP_NAME = "staging-braid"
COMPOSE_PATH = "/staging/04-braid/docker-compose.yml"
FULL_REPO_URL = f"https://x-access-token:{ONEDEV_TOKEN}@repo.aishacrm.com/aishacrm.git"


def cf(method, path, body=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=HDRS)
    if data: req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {body[:300]}") from None


print("=== 1. Verify Staging server reachable in Coolify ===")
srv = cf("GET", f"/api/v1/servers/{STAGING_SERVER_UUID}")
reachable = srv.get("settings", {}).get("is_reachable") if isinstance(srv.get("settings"), dict) else srv.get("is_reachable")
print(f"  beige-koala: name={srv.get('name')!r} reachable={reachable}")
if not reachable:
    print("  WARNING: Staging server not reachable in Coolify — deploy may fail. Continuing anyway.")
print()

print("=== 2. Get staging project's environment ===")
proj = cf("GET", f"/api/v1/projects/{STAGING_PROJECT_UUID}")
envs = proj.get("environments", [])
env_name = envs[0]["name"] if envs else "production"
print(f"  using environment: {env_name}")
print()

print(f"=== 3. Check for existing app named {APP_NAME!r} ===")
apps = cf("GET", "/api/v1/applications")
existing = next((a for a in apps if a.get("name") == APP_NAME), None)
if existing:
    app_uuid = existing["uuid"]
    print(f"  found existing: uuid={app_uuid}")
    print(f"    git_repository (current): {(existing.get('git_repository') or '')[:80]}...")
    print(f"    docker_compose_location:  {existing.get('docker_compose_location')}")
else:
    print("  not found, creating...")
    body = {
        "project_uuid": STAGING_PROJECT_UUID,
        "server_uuid": STAGING_SERVER_UUID,
        "environment_name": env_name,
        "git_repository": FULL_REPO_URL,
        "git_branch": "main",
        "build_pack": "dockercompose",
        "docker_compose_location": COMPOSE_PATH,
        "name": APP_NAME,
        "description": "Coolify-native MCP (Braid) build on Staging — Phase 2 svc #2. 3-container distributed pattern (server + 2 workers). Side-by-side with manually-deployed aishacrm-braid-mcp-staging until cutover.",
        "instant_deploy": False,
    }
    created = cf("POST", "/api/v1/applications/public", body=body)
    app_uuid = created.get("uuid")
    print(f"  created: uuid={app_uuid}")
print()

print("=== 4. PATCH git_repository + compose location (Coolify API truncates on initial create) ===")
cf("PATCH", f"/api/v1/applications/{app_uuid}", body={
    "git_repository": FULL_REPO_URL,
    "docker_compose_location": COMPOSE_PATH,
    "git_branch": "main",
})
app = cf("GET", f"/api/v1/applications/{app_uuid}")
print(f"  git_repository now:        {(app.get('git_repository') or '')[:80]}...")
print(f"  docker_compose_location:   {app.get('docker_compose_location')}")
print(f"  git_branch:                {app.get('git_branch')}")
print()

print("=== 5. Set Doppler env vars ===")
env_vars = {
    "DOPPLER_TOKEN": DOPPLER_TOKEN_STAGING,
    "DOPPLER_PROJECT": "aishacrm",
    "DOPPLER_CONFIG": "stg_stg",
}
for k, v in env_vars.items():
    if not v:
        print(f"  WARNING: {k} not provided"); continue
    body = {"key": k, "value": str(v)}
    try:
        cf("POST", f"/api/v1/applications/{app_uuid}/envs", body=body)
        print(f"  set {k}")
    except RuntimeError as e:
        if "422" in str(e):
            cf("PATCH", f"/api/v1/applications/{app_uuid}/envs", body=body)
            print(f"  updated {k}")
        else:
            print(f"  ERR {k}: {str(e)[:120]}")
print()

print("=== 6. Trigger deploy ===")
result = cf("POST", f"/api/v1/deploy?uuid={app_uuid}&force=true")
print(f"  {result}")
deployment_uuid = result.get("deployments", [{}])[0].get("deployment_uuid") if isinstance(result, dict) else None
print(f"  deployment_uuid: {deployment_uuid}")
print()

print("=== 7. Poll deployment (max 8 min — mcp build is heavier than litellm) ===")
last_status = None
for i in range(48):
    time.sleep(10)
    if deployment_uuid:
        try:
            d = cf("GET", f"/api/v1/deployments/{deployment_uuid}")
        except RuntimeError as e:
            print(f"  err: {str(e)[:80]}"); continue
        status = d.get("status") if isinstance(d, dict) else None
        if status != last_status:
            print(f"  [{(i+1)*10:>3}s] status={status}")
            last_status = status
        if status in ("finished", "failed", "error", "cancelled-by-user"):
            print(f"  TERMINAL: {status}")
            break
print()

print("=== 8. Final state ===")
app = cf("GET", f"/api/v1/applications/{app_uuid}")
print(f"  uuid:    {app_uuid}")
print(f"  name:    {app.get('name')}")
print(f"  status:  {app.get('status')}")
print(f"  fqdn:    {app.get('fqdn')}")
