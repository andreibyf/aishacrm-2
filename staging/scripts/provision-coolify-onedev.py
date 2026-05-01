#!/usr/bin/env python3
"""
Provision the 5 Coolify Docker Compose resources for staging — Path B (OneDev source).

DIFFERENCE FROM provision-coolify.py:
  - Source repo points at OneDev (https://repo.aishacrm.com/aishacrm.git) with
    embedded x-access-token credentials, not GitHub.
  - Adds --delete-existing flag that DELETEs apps matching the 5 staging names
    (+ the 2 known orphans fvwje8dn22hqf6g9i34xj5vt, pfm7cuevpylnm9z1q0im6a6u,
    + the obsolete `staging-scheduling-rare` group-05 app) before recreating.
  - Adds Group 6 (tunnel/cloudflared) which the original script omitted.

GROUP 05 (calcom/scheduling) IS NOT PROVISIONED HERE.
  Calcom moved off Staging server to the Services server (VPS-2) in 2026-05.
  That deploy is at staging/services/calcom/docker-compose.yml and runs via
  direct `docker compose up -d` on VPS-2 (mirroring prod calcom's deployment
  pattern), NOT via Coolify. See staging/services/calcom/README.md.

WHAT THIS DOES:
  1. Reuses existing Coolify project "aishacrm-staging" (uuid b78ljy1xtefe1vnaktddgk17).
  2. (Optional) DELETEs all existing apps matching our 5 active groups + 2 orphans
     + the obsolete `staging-scheduling-rare` (group 05) app.
  3. For each of the 5 active groups, creates a docker-compose application
     pointing at OneDev with the right docker_compose_location.
  4. Populates env vars per group (DOPPLER_TOKEN/PROJECT/CONFIG + per-group
     overrides matching provision-coolify.py).
  5. Attaches FQDNs (groups 1, 2) so Coolify Traefik provisions TLS.
  6. Writes staging/.coolify-manifest-onedev.json with all created UUIDs.

USAGE:
  $env:COOLIFY_TOKEN = "..."
  $env:COOLIFY_BASE_URL = "https://deploy.aishacrm.com"
  $env:STG_DOPPLER_TOKEN = "dp.st.stg_stg.xxxxx"
  $env:CALCOM_DB_PASSWORD = "..."
  $env:CALCOM_NEXTAUTH_SECRET = "..."
  $env:CALCOM_ENCRYPTION_KEY = "..."
  $env:TUNNEL_TOKEN = "..."
  $env:ONEDEV_TOKEN = "..."
  python staging/scripts/provision-coolify-onedev.py --branch main --delete-existing

  # Dry run (no API calls):
  python staging/scripts/provision-coolify-onedev.py --branch main --dry-run

  # Tests:
  python staging/scripts/provision-coolify-onedev.py --test
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import unittest
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from unittest.mock import patch

# OneDev source URL (replaces GitHub).
# Token is embedded in URL — Coolify stores it; rotate via OneDev settings if compromised.
def _build_repo_url(token: str) -> str:
    return f"https://x-access-token:{token}@repo.aishacrm.com/aishacrm.git"


DEFAULT_TENANT_ID = "a11dfb63-4b18-4eb8-872e-747af2e37c46"
PROJECT_NAME = "aishacrm-staging"
SERVER_UUID = "f7uzrwlbqjtx6qamppma5xsz"  # beige-koala / 147.189.173.237 (VPS-1)

# Names of the 5 active group apps + 2 known orphans created by earlier attempts.
ORPHAN_APP_UUIDS = [
    "fvwje8dn22hqf6g9i34xj5vt",  # auto-named "aishacrm-2:main-..."
    "pfm7cuevpylnm9z1q0im6a6u",  # docker-image-... (coollabsio/coolify)
]

# Apps from prior provisioning runs that are no longer part of the active set.
# `--delete-existing` removes these by name in addition to the orphan UUIDs and
# any current group apps. After calcom moved to VPS-2, the group-05 Coolify
# app (`staging-scheduling-rare`) is obsolete.
DEPRECATED_APP_NAMES = ["staging-scheduling-rare"]


# ---- Group definitions -----------------------------------------------------
@dataclass
class Group:
    key: str
    app_name: str
    fqdn: str | None
    public_service: str | None = None
    extra_env: dict[str, str] = field(default_factory=dict)


def build_groups(
    stg_doppler_token: str,
    calcom_secrets: dict[str, str],
    tunnel_token: str,
    onedev_token: str,
) -> list[Group]:
    common = {
        "DOPPLER_TOKEN": stg_doppler_token,
        "DOPPLER_PROJECT": "aishacrm",
        "DOPPLER_CONFIG": "stg_stg",
        # Image tags are local cache keys for `build:`. Default to "staging".
        "BACKEND_IMAGE_TAG": "staging",
        "FRONTEND_IMAGE_TAG": "staging",
        "LITELLM_IMAGE_TAG": "staging",
        "MCP_IMAGE_TAG": "staging",
        "CALCOM_DB_IMAGE_TAG": "staging",
    }
    return [
        Group(
            key="01-backend-heavy",
            app_name="staging-backend-heavy",
            fqdn="https://staging-api.aishacrm.com",
            public_service="backend",
            extra_env={
                **common,
                "COMPOSE_PROFILES": "app",  # Path B: build inline, run backend
                "ALLOWED_ORIGINS": "https://staging-app.aishacrm.com",
                "PUBLIC_SCHEDULER_URL": "https://staging-scheduler.aishacrm.com",
                # NOTE: CALCOM_DB_* removed — calcom moved to VPS-2 in 2026-05.
                # The staging backend's calcom-db connection now uses Doppler
                # `stg_stg.CALCOM_DB_URL` directly (postgres on 147.189.168.164:5433).
                # The compose template `${CALCOM_DB_PASSWORD}` in
                # staging/01-backend-heavy/docker-compose.yml resolves to empty,
                # then Doppler overrides at backend startup via `doppler run`.
                "NODE_OPTIONS": "--max-old-space-size=2048",
            },
        ),
        Group(
            key="02-app-fast",
            app_name="staging-app-fast",
            fqdn="https://staging-app.aishacrm.com",
            public_service="frontend",
            extra_env={
                **common,
                # Frontend build args — baked into bundle at build time
                "VITE_SUPABASE_URL": calcom_secrets.get("VITE_SUPABASE_URL", ""),
                "VITE_SUPABASE_ANON_KEY": calcom_secrets.get("VITE_SUPABASE_ANON_KEY", ""),
                "VITE_AISHACRM_BACKEND_URL": "https://staging-api.aishacrm.com",
                "VITE_CALCOM_URL": "https://staging-scheduler.aishacrm.com",
                "VITE_CURRENT_BRANCH": "main",
                "VITE_SYSTEM_TENANT_ID": DEFAULT_TENANT_ID,
                # OpenReplay disabled per task #11 (replaced by Microsoft Clarity)
                "VITE_OPENREPLAY_ENABLED": "false",
                "VITE_OPENREPLAY_PROJECT_KEY": "",
                "VITE_OPENREPLAY_INGEST_POINT": "",
                "VITE_OPENREPLAY_DASHBOARD_URL": "",
                "COMMUNICATIONS_WORKER_POLL_INTERVAL_MS": "60000",
                "NODE_OPTIONS": "--max-old-space-size=1024",
            },
        ),
        Group(
            key="03-ai-infra",
            app_name="staging-ai-infra",
            fqdn=None,
            extra_env={**common},
        ),
        Group(
            key="04-braid",
            app_name="staging-braid",
            fqdn=None,
            extra_env={**common, "DEFAULT_TENANT_ID": DEFAULT_TENANT_ID},
        ),
        # Group 05 (calcom) intentionally absent — see module docstring.
        # Calcom now runs on VPS-2 via staging/services/calcom/docker-compose.yml.
        Group(
            key="06-tunnel",
            app_name="staging-tunnel",
            fqdn=None,
            extra_env={
                "TUNNEL_TOKEN": tunnel_token,
            },
        ),
    ]


# ---- Coolify API client ----------------------------------------------------
class Coolify:
    def __init__(self, base_url: str, token: str, dry_run: bool = False):
        self.base = base_url.rstrip("/")
        self.token = token
        self.dry_run = dry_run

    def _req(self, method: str, path: str, body: dict | None = None) -> Any:
        if self.dry_run:
            print(f"[DRY] {method} {path}  body={json.dumps(body) if body else None}")
            return {"_dry_run": True}
        url = f"{self.base}{path}"
        data = json.dumps(body).encode() if body is not None else None
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            # Cloudflare bot filter (Error 1010) blocks default Python-urllib UA.
            # Use a Chromium-based UA so deploy.aishacrm.com lets the request through.
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                txt = resp.read().decode()
                return json.loads(txt) if txt.strip() else {}
        except urllib.error.HTTPError as e:
            txt = e.read().decode(errors="replace")
            try:
                err = json.loads(txt)
            except json.JSONDecodeError:
                err = {"raw": txt, "status": e.code}
            raise RuntimeError(f"{method} {path} -> {e.code}: {err}") from None

    def list_apps(self) -> list[dict[str, Any]]:
        r = self._req("GET", "/api/v1/applications")
        return r if isinstance(r, list) else []

    def find_app(self, name: str) -> dict[str, Any] | None:
        for a in self.list_apps():
            if a.get("name") == name:
                return a
        return None

    def find_app_by_uuid(self, uuid: str) -> dict[str, Any] | None:
        try:
            return self._req("GET", f"/api/v1/applications/{uuid}")
        except RuntimeError as e:
            if "404" in str(e):
                return None
            raise

    def delete_app(self, uuid: str) -> None:
        try:
            self._req("DELETE", f"/api/v1/applications/{uuid}")
        except RuntimeError as e:
            if "404" in str(e):
                return  # already gone
            raise

    def find_project(self, name: str) -> dict[str, Any] | None:
        r = self._req("GET", "/api/v1/projects")
        if not isinstance(r, list):
            return None
        for p in r:
            if p.get("name") == name:
                return p
        return None

    def get_project_environments(self, project_uuid: str) -> list[dict[str, Any]]:
        proj = self._req("GET", f"/api/v1/projects/{project_uuid}")
        return proj.get("environments", [])

    def create_dockercompose_app(
        self,
        repo_url: str,
        project_uuid: str,
        environment_name: str,
        name: str,
        git_branch: str,
        compose_path: str,
        fqdn: str | None,
        public_service: str | None = None,
    ) -> dict[str, Any]:
        body = {
            "project_uuid": project_uuid,
            "server_uuid": SERVER_UUID,
            "environment_name": environment_name,
            "git_repository": repo_url,
            "git_branch": git_branch,
            "build_pack": "dockercompose",
            "docker_compose_location": compose_path,
            "name": name,
            "instant_deploy": False,
            # Coolify keeps domain reservations after DELETE for a short window;
            # force override so we can recreate the same FQDN immediately.
            "force_domain_override": True,
        }
        if fqdn and public_service:
            body["docker_compose_domains"] = [
                {"name": public_service, "domain": fqdn}
            ]
        return self._req("POST", "/api/v1/applications/public", body=body)

    def set_envs(self, app_uuid: str, env_vars: dict[str, str]) -> None:
        for k, v in env_vars.items():
            body = {"key": k, "value": str(v)}
            try:
                self._req("POST", f"/api/v1/applications/{app_uuid}/envs", body=body)
            except RuntimeError as e:
                if "already exists" in str(e).lower():
                    self._req("PATCH", f"/api/v1/applications/{app_uuid}/envs", body=body)
                else:
                    raise


# ---- Provisioning ---------------------------------------------------------
def provision(
    branch: str,
    calcom_secrets: dict[str, str],
    tunnel_token: str,
    onedev_token: str,
    delete_existing: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    coolify_token = os.environ["COOLIFY_TOKEN"]
    coolify_base = os.environ.get("COOLIFY_BASE_URL", "https://deploy.aishacrm.com")
    stg_doppler = os.environ["STG_DOPPLER_TOKEN"]

    cf = Coolify(coolify_base, coolify_token, dry_run=dry_run)

    proj = cf.find_project(PROJECT_NAME)
    if not proj:
        raise RuntimeError(f"Project {PROJECT_NAME} not found in Coolify. Create it manually first.")
    project_uuid = proj["uuid"]
    print(f"ok: project '{PROJECT_NAME}' uuid={project_uuid}")

    if not dry_run:
        envs = cf.get_project_environments(project_uuid)
        env_name = envs[0]["name"] if envs else "production"
    else:
        env_name = "production"
    print(f"ok: target environment='{env_name}'")

    groups = build_groups(stg_doppler, calcom_secrets, tunnel_token, onedev_token)
    group_names = {g.app_name for g in groups}

    # ---- Delete existing apps (active groups + deprecated names + 2 known orphans) ----
    if delete_existing:
        print("\n--- DELETE phase ---")
        deletion_target_names = group_names | set(DEPRECATED_APP_NAMES)
        existing_apps = cf.list_apps() if not dry_run else []
        for app in existing_apps:
            if app.get("name") in deletion_target_names or app.get("uuid") in ORPHAN_APP_UUIDS:
                uuid = app["uuid"]
                name = app.get("name", "?")
                tag = " (deprecated)" if name in DEPRECATED_APP_NAMES else ""
                print(f"  DELETE app '{name}'{tag} uuid={uuid}")
                if not dry_run:
                    cf.delete_app(uuid)
        if dry_run:
            for u in ORPHAN_APP_UUIDS:
                print(f"  [DRY] would DELETE orphan uuid={u}")
            for g in groups:
                print(f"  [DRY] would DELETE app name='{g.app_name}' if exists")
            for n in DEPRECATED_APP_NAMES:
                print(f"  [DRY] would DELETE deprecated app name='{n}' if exists")

    # ---- Create phase ----
    repo_url = _build_repo_url(onedev_token)
    print(f"\n--- CREATE phase --- (repo={repo_url.split('@')[1] if '@' in repo_url else repo_url})")
    manifest = {
        "project": {"name": PROJECT_NAME, "uuid": project_uuid, "environment": env_name},
        "branch": branch,
        "server_uuid": SERVER_UUID,
        "applications": [],
    }
    for g in groups:
        compose_path = f"/staging/{g.key}/docker-compose.yml"
        print(f"\n--- {g.app_name} ---")
        existing = cf.find_app(g.app_name) if not dry_run else None
        if existing and not delete_existing:
            app_uuid = existing["uuid"]
            print(f"ok: reusing existing app uuid={app_uuid} (re-run with --delete-existing for clean swap)")
        else:
            app = cf.create_dockercompose_app(
                repo_url=repo_url,
                project_uuid=project_uuid,
                environment_name=env_name,
                name=g.app_name,
                git_branch=branch,
                compose_path=compose_path,
                fqdn=g.fqdn,
                public_service=g.public_service,
            )
            app_uuid = app.get("uuid", "_dry_run_")
            print(f"ok: created app uuid={app_uuid}")
        if not dry_run and app_uuid != "_dry_run_":
            cf.set_envs(app_uuid, g.extra_env)
            print(f"ok: set {len(g.extra_env)} env vars")
        manifest["applications"].append({
            "key": g.key,
            "name": g.app_name,
            "uuid": app_uuid,
            "fqdn": g.fqdn,
            "compose_path": compose_path,
            "env_var_count": len(g.extra_env),
        })

    if not dry_run:
        manifest_path = Path(__file__).resolve().parent.parent / ".coolify-manifest-onedev.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"\nok: wrote manifest to {manifest_path}")

    return manifest


# ---- Tests -----------------------------------------------------------------
class TestBuildGroups(unittest.TestCase):
    CALCOM = {
        "CALCOM_DB_PASSWORD": "x" * 40,
        "CALCOM_NEXTAUTH_SECRET": "y" * 64,
        "CALCOM_ENCRYPTION_KEY": "z" * 32,
        "VITE_SUPABASE_URL": "https://stg.supabase.co",
        "VITE_SUPABASE_ANON_KEY": "stg-anon",
    }

    def test_five_groups_calcom_excluded(self):
        # Group 05 (calcom) is intentionally absent — calcom runs on VPS-2 via
        # staging/services/calcom/docker-compose.yml, not as a Coolify app.
        gs = build_groups("dp.st.stg_stg.tok", self.CALCOM, "tunnel-tok", "onedev-tok")
        self.assertEqual(len(gs), 5)
        keys = [g.key for g in gs]
        self.assertEqual(keys, [
            "01-backend-heavy", "02-app-fast", "03-ai-infra",
            "04-braid", "06-tunnel",
        ])
        # Explicitly assert no group has the obsolete calcom name/key.
        self.assertNotIn("05-scheduling-rare", keys)
        for g in gs:
            self.assertNotEqual(g.app_name, "staging-scheduling-rare")

    def test_only_groups_1_2_have_fqdn(self):
        # After dropping group 05, only the public app groups (api, frontend)
        # carry FQDNs. Scheduler FQDN is owned by VPS-2 cloudflared, not Coolify.
        gs = build_groups("tok", self.CALCOM, "tunnel", "od")
        f = {g.key: g.fqdn for g in gs}
        self.assertEqual(f["01-backend-heavy"], "https://staging-api.aishacrm.com")
        self.assertEqual(f["02-app-fast"], "https://staging-app.aishacrm.com")
        self.assertIsNone(f["03-ai-infra"])
        self.assertIsNone(f["04-braid"])
        self.assertIsNone(f["06-tunnel"])
        # No group should claim the scheduler FQDN — that lives on VPS-2.
        for g in gs:
            self.assertNotEqual(g.fqdn, "https://staging-scheduler.aishacrm.com")

    def test_phase2_runs_backend(self):
        # Path B: backend MUST run (build inline, no GHCR images)
        gs = build_groups("tok", self.CALCOM, "tunnel", "od")
        g1 = next(g for g in gs if g.key == "01-backend-heavy")
        self.assertEqual(g1.extra_env["COMPOSE_PROFILES"], "app")

    def test_tunnel_token_only_in_group_6(self):
        gs = build_groups("tok", self.CALCOM, "tunnel-secret", "od")
        for g in gs:
            if g.key == "06-tunnel":
                self.assertEqual(g.extra_env["TUNNEL_TOKEN"], "tunnel-secret")
            else:
                self.assertNotIn("TUNNEL_TOKEN", g.extra_env)

    def test_repo_url_embeds_token(self):
        url = _build_repo_url("MYTOKEN")
        self.assertEqual(url, "https://x-access-token:MYTOKEN@repo.aishacrm.com/aishacrm.git")

    def test_doppler_token_in_app_groups(self):
        # All groups except 06-tunnel must have Doppler injection wired up.
        # The tunnel container runs cloudflared only, no AiSHA code.
        gs = build_groups("dp.st.stg_stg.tok", self.CALCOM, "tunnel", "od")
        for g in gs:
            if g.key == "06-tunnel":
                continue  # tunnel uses its own token only
            self.assertEqual(g.extra_env["DOPPLER_TOKEN"], "dp.st.stg_stg.tok")
            self.assertEqual(g.extra_env["DOPPLER_PROJECT"], "aishacrm")
            self.assertEqual(g.extra_env["DOPPLER_CONFIG"], "stg_stg")

    def test_no_calcom_secrets_in_any_group(self):
        # After moving calcom to VPS-2, no Coolify-managed group should carry
        # calcom secrets. The staging backend reaches calcom-db via Doppler-injected
        # CALCOM_DB_URL at runtime, not via Coolify env vars.
        gs = build_groups("tok", self.CALCOM, "tunnel", "od")
        for g in gs:
            for key in (
                "CALCOM_DB_PASSWORD",
                "CALCOM_DB_USER",
                "CALCOM_DB_NAME",
                "CALCOM_NEXTAUTH_SECRET",
                "CALCOM_ENCRYPTION_KEY",
                "CALCOM_ALLOWED_HOSTNAMES",
                "CALCOM_LICENSE_KEY",
                "CALCOM_SMTP_HOST",
                "CALCOM_SMTP_USER",
                "CALCOM_SMTP_PASSWORD",
            ):
                self.assertNotIn(
                    key, g.extra_env,
                    f"group {g.key} ({g.app_name}) carries {key} but calcom is now on VPS-2 — "
                    f"all calcom secrets come from Doppler stg_stg, not Coolify env",
                )

    def test_deprecated_apps_listed_for_deletion(self):
        # The provisioner must clean up the obsolete `staging-scheduling-rare`
        # app via --delete-existing so re-runs don't leave orphans.
        self.assertIn("staging-scheduling-rare", DEPRECATED_APP_NAMES)

    def test_frontend_build_args_present(self):
        gs = build_groups("tok", self.CALCOM, "tunnel", "od")
        g2 = next(g for g in gs if g.key == "02-app-fast")
        self.assertEqual(g2.extra_env["VITE_AISHACRM_BACKEND_URL"],
                         "https://staging-api.aishacrm.com")
        self.assertEqual(g2.extra_env["VITE_CALCOM_URL"],
                         "https://staging-scheduler.aishacrm.com")
        self.assertEqual(g2.extra_env["VITE_OPENREPLAY_ENABLED"], "false")


class TestCoolifyAPI(unittest.TestCase):
    def test_create_uses_onedev_url(self):
        cf = Coolify("https://x", "tok")
        with patch.object(cf, "_req") as m:
            m.return_value = {"uuid": "abc"}
            cf.create_dockercompose_app(
                repo_url="https://x-access-token:T@repo.aishacrm.com/aishacrm.git",
                project_uuid="P", environment_name="production",
                name="staging-x", git_branch="main",
                compose_path="/staging/01-backend-heavy/docker-compose.yml",
                fqdn="https://staging-api.aishacrm.com",
                public_service="backend",
            )
            body = m.call_args.kwargs["body"]
            self.assertIn("repo.aishacrm.com", body["git_repository"])
            self.assertNotIn("github.com", body["git_repository"])
            self.assertEqual(body["build_pack"], "dockercompose")

    def test_dry_run_does_not_call_api(self):
        cf = Coolify("https://x", "tok", dry_run=True)
        with patch("urllib.request.urlopen") as urlopen:
            r = cf._req("POST", "/api/v1/projects", body={"name": "test"})
            self.assertEqual(r["_dry_run"], True)
            urlopen.assert_not_called()


# ---- CLI ------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default="main", help="Branch Coolify should track")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be done; no API calls")
    ap.add_argument("--delete-existing", action="store_true",
                    help="DELETE the 6 group apps + 2 orphans before recreating")
    ap.add_argument("--test", action="store_true", help="Run unit tests and exit")
    args = ap.parse_args()

    if args.test:
        sys.argv = sys.argv[:1]
        unittest.main(verbosity=2)
        return

    calcom_secrets = {
        "CALCOM_DB_PASSWORD": os.environ.get("CALCOM_DB_PASSWORD", ""),
        "CALCOM_NEXTAUTH_SECRET": os.environ.get("CALCOM_NEXTAUTH_SECRET", ""),
        "CALCOM_ENCRYPTION_KEY": os.environ.get("CALCOM_ENCRYPTION_KEY", ""),
        "CALCOM_SMTP_HOST": os.environ.get("CALCOM_SMTP_HOST", ""),
        "CALCOM_SMTP_PORT": os.environ.get("CALCOM_SMTP_PORT", "465"),
        "CALCOM_SMTP_USER": os.environ.get("CALCOM_SMTP_USER", ""),
        "CALCOM_SMTP_PASSWORD": os.environ.get("CALCOM_SMTP_PASSWORD", ""),
        "VITE_SUPABASE_URL": os.environ.get("VITE_SUPABASE_URL", ""),
        "VITE_SUPABASE_ANON_KEY": os.environ.get("VITE_SUPABASE_ANON_KEY", ""),
    }
    tunnel_token = os.environ.get("TUNNEL_TOKEN", "")
    onedev_token = os.environ.get("ONEDEV_TOKEN", "")

    missing = []
    for k in ("COOLIFY_TOKEN", "STG_DOPPLER_TOKEN"):
        if not os.environ.get(k):
            missing.append(k)
    if not args.dry_run:
        if not calcom_secrets["CALCOM_DB_PASSWORD"]:
            missing.append("CALCOM_DB_PASSWORD")
        if not calcom_secrets["CALCOM_NEXTAUTH_SECRET"]:
            missing.append("CALCOM_NEXTAUTH_SECRET")
        if not calcom_secrets["CALCOM_ENCRYPTION_KEY"]:
            missing.append("CALCOM_ENCRYPTION_KEY")
        if not tunnel_token:
            missing.append("TUNNEL_TOKEN")
        if not onedev_token:
            missing.append("ONEDEV_TOKEN")
    if missing:
        print(f"ERROR: missing env vars: {missing}", file=sys.stderr)
        sys.exit(1)

    provision(
        branch=args.branch,
        calcom_secrets=calcom_secrets,
        tunnel_token=tunnel_token,
        onedev_token=onedev_token,
        delete_existing=args.delete_existing,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
