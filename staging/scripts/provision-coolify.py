#!/usr/bin/env python3
"""
Provision the 5 Coolify Docker Compose resources for the staging environment.

WHAT THIS DOES (idempotent on second run via --reuse-project):
  1. Creates a Coolify project named "aishacrm-staging" on the App VPS server.
  2. For each of the 5 groups, creates a docker-compose application pointing at
     andreibyf/aishacrm-2:<branch> with the right docker_compose_location.
  3. Populates env vars on each app (DOPPLER_TOKEN/PROJECT/CONFIG + per-group
     overrides from staging/.env.example).
  4. Attaches FQDNs (groups 1, 2, 5 only) so Coolify Traefik provisions TLS.
  5. Writes staging/.coolify-manifest.json with all created UUIDs so the user
     (or this script) can manage them later.

WHY A SCRIPT INSTEAD OF MANUAL UI CLICKS:
  Five resources × 8–14 env vars each = ~50 form fields. Every typo costs a
  redeploy. The script is auditable, re-runnable, and survives token rotation.

USAGE:
  export COOLIFY_TOKEN=...
  export COOLIFY_BASE_URL=https://appspanel-631819.zap.cloud
  export STG_DOPPLER_TOKEN=dp.st.stg_stg.xxxxx
  python3 staging/scripts/provision-coolify.py --branch main

  # Dry run — print what would be created, don't hit Coolify:
  python3 staging/scripts/provision-coolify.py --branch main --dry-run

  # Tests:
  python3 staging/scripts/provision-coolify.py --test
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
from unittest.mock import patch, MagicMock

REPO = "https://github.com/andreibyf/aishacrm-2"
DEFAULT_TENANT_ID = "a11dfb63-4b18-4eb8-872e-747af2e37c46"
PROJECT_NAME = "aishacrm-staging"
SERVER_UUID = "f7uzrwlbqjtx6qamppma5xsz"  # beige-koala / 147.189.173.237

# ---- Group definitions -----------------------------------------------------
@dataclass
class Group:
    key: str                       # "01-backend-heavy" etc — used in compose path
    app_name: str                  # Coolify application name
    fqdn: str | None               # public URL or None for internal-only
    public_service: str | None = None  # compose service that the FQDN routes to
    extra_env: dict[str, str] = field(default_factory=dict)


def build_groups(stg_doppler_token: str, calcom_secrets: dict[str, str]) -> list[Group]:
    common = {
        "DOPPLER_TOKEN": stg_doppler_token,
        "DOPPLER_PROJECT": "aishacrm",
        "DOPPLER_CONFIG": "stg_stg",
        "BACKEND_IMAGE_TAG": "latest",
        "FRONTEND_IMAGE_TAG": "latest",
        "LITELLM_IMAGE_TAG": "latest",
        "MCP_IMAGE_TAG": "latest",
    }
    return [
        Group(
            key="01-backend-heavy",
            app_name="staging-backend-heavy",
            fqdn="https://staging-api.aishacrm.com",
            public_service="backend",
            extra_env={
                **common,
                "COMPOSE_PROFILES": "",   # Phase 1: Redis only — backend dormant
                "ALLOWED_ORIGINS": "https://staging-app.aishacrm.com",
                "PUBLIC_SCHEDULER_URL": "https://staging-scheduler.aishacrm.com",
                # Backend talks to the Cal.com DB directly — needs these
                "CALCOM_DB_USER": "calcom",
                "CALCOM_DB_NAME": "calcom",
                "CALCOM_DB_PASSWORD": calcom_secrets["CALCOM_DB_PASSWORD"],
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
                "VITE_OPENREPLAY_PROJECT_KEY": "",
                "VITE_OPENREPLAY_INGEST_POINT": "",
                "VITE_OPENREPLAY_DASHBOARD_URL": "https://replay.aishacrm.com",
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
        Group(
            key="05-scheduling-rare",
            app_name="staging-scheduling-rare",
            fqdn="https://staging-scheduler.aishacrm.com",
            public_service="calcom",
            extra_env={
                **common,
                "CALCOM_DB_USER": "calcom",
                "CALCOM_DB_NAME": "calcom",
                "CALCOM_DB_PASSWORD": calcom_secrets["CALCOM_DB_PASSWORD"],
                "CALCOM_NEXTAUTH_SECRET": calcom_secrets["CALCOM_NEXTAUTH_SECRET"],
                "CALCOM_ENCRYPTION_KEY": calcom_secrets["CALCOM_ENCRYPTION_KEY"],
                "CALCOM_PUBLIC_URL": "https://staging-scheduler.aishacrm.com",
                "CALCOM_ALLOWED_HOSTNAMES": "staging-scheduler.aishacrm.com",
                "CALCOM_LICENSE_KEY": "59c0bed7-8b21-4280-8514-e022fbfc24c7",
                "CALCOM_EMAIL_FROM": "noreply@aishacrm.com",
                "CALCOM_SMTP_HOST": "",
                "CALCOM_SMTP_PORT": "587",
                "CALCOM_SMTP_USER": "",
                "CALCOM_SMTP_PASSWORD": "",
            },
        ),
    ]


# ---- Coolify API client ----------------------------------------------------
class Coolify:
    def __init__(self, base_url: str, token: str, dry_run: bool = False):
        self.base = base_url.rstrip("/")
        self.token = token
        self.dry_run = dry_run

    def _req(self, method: str, path: str, body: dict | None = None) -> dict[str, Any]:
        if self.dry_run:
            print(f"[DRY] {method} {path}  body={json.dumps(body) if body else None}")
            return {"_dry_run": True}
        url = f"{self.base}{path}"
        data = json.dumps(body).encode() if body is not None else None
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                txt = resp.read().decode()
                return json.loads(txt) if txt.strip() else {}
        except urllib.error.HTTPError as e:
            txt = e.read().decode(errors="replace")
            try:
                err = json.loads(txt)
            except json.JSONDecodeError:
                err = {"raw": txt, "status": e.code}
            raise RuntimeError(f"{method} {path} → {e.code}: {err}") from None

    # --- Project management ---
    def find_project(self, name: str) -> dict[str, Any] | None:
        resp = self._req("GET", "/api/v1/projects")
        if not isinstance(resp, list):
            return None  # dry-run returns dict; nothing to find
        for p in resp:
            if p.get("name") == name:
                return p
        return None

    def create_project(self, name: str, description: str = "") -> dict[str, Any]:
        return self._req("POST", "/api/v1/projects",
                         body={"name": name, "description": description})

    def get_project_environments(self, project_uuid: str) -> list[dict[str, Any]]:
        proj = self._req("GET", f"/api/v1/projects/{project_uuid}")
        return proj.get("environments", [])

    # --- Application management ---
    def find_app(self, name: str) -> dict[str, Any] | None:
        """Find an application by name. Returns None if not found or in dry-run."""
        resp = self._req("GET", "/api/v1/applications")
        if not isinstance(resp, list):
            return None
        for a in resp:
            if a.get("name") == name:
                return a
        return None

    def create_dockercompose_app(
        self,
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
            "git_repository": REPO,
            "git_branch": git_branch,
            "build_pack": "dockercompose",
            "docker_compose_location": compose_path,
            "name": name,
            "instant_deploy": False,
        }
        # Coolify v4 rejects top-level `domains` for dockercompose builds.
        # Required shape: array of {name, domain} mapping each public service
        # in the compose to a public URL. Traefik handles TLS automatically.
        if fqdn and public_service:
            body["docker_compose_domains"] = [
                {"name": public_service, "domain": fqdn}
            ]
        return self._req("POST", "/api/v1/applications/public", body=body)

    def set_envs(self, app_uuid: str, env_vars: dict[str, str]) -> None:
        # Coolify v4 envs endpoint accepts only {key, value} on POST/PATCH.
        # is_preview / is_buildtime / is_runtime / is_literal default sensibly
        # server-side and aren't accepted as input fields (validator rejects them).
        # Conflict semantics: POST returns "already exists" → retry as PATCH.
        for k, v in env_vars.items():
            body = {"key": k, "value": str(v)}
            try:
                self._req("POST", f"/api/v1/applications/{app_uuid}/envs", body=body)
            except RuntimeError as e:
                if "already exists" in str(e).lower():
                    self._req("PATCH", f"/api/v1/applications/{app_uuid}/envs", body=body)
                else:
                    raise


# ---- Provisioning entrypoint ----------------------------------------------
def provision(branch: str, calcom_secrets: dict[str, str], dry_run: bool = False) -> dict[str, Any]:
    coolify_token = os.environ["COOLIFY_TOKEN"]
    coolify_base = os.environ["COOLIFY_BASE_URL"]
    stg_doppler = os.environ["STG_DOPPLER_TOKEN"]

    cf = Coolify(coolify_base, coolify_token, dry_run=dry_run)

    # 1. Find or create project
    proj = cf.find_project(PROJECT_NAME)
    if proj:
        print(f"ok: reusing project '{PROJECT_NAME}' uuid={proj['uuid']}")
        project_uuid = proj["uuid"]
    else:
        created = cf.create_project(PROJECT_NAME, description="AiSHA staging - managed by provision-coolify.py")
        project_uuid = created.get("uuid", "_dry_run_")
        print(f"ok: created project '{PROJECT_NAME}' uuid={project_uuid}")

    # 2. Get default environment ("production" is what Coolify auto-creates)
    if not dry_run:
        envs = cf.get_project_environments(project_uuid)
        env_name = envs[0]["name"] if envs else "production"
    else:
        env_name = "production"
    print(f"ok: target environment='{env_name}'")

    # 3. Create 5 applications
    groups = build_groups(stg_doppler, calcom_secrets)
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
        if existing:
            app_uuid = existing["uuid"]
            print(f"ok: reusing existing app uuid={app_uuid}")
        else:
            app = cf.create_dockercompose_app(
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
        if not dry_run:
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

    # 4. Save manifest
    if not dry_run:
        manifest_path = Path(__file__).resolve().parent.parent / ".coolify-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"\nok: wrote manifest to {manifest_path}")

    return manifest


# ---- Tests -----------------------------------------------------------------
class TestBuildGroups(unittest.TestCase):
    CALCOM = {
        "CALCOM_DB_PASSWORD": "x" * 40,
        "CALCOM_NEXTAUTH_SECRET": "y" * 64,
        "CALCOM_ENCRYPTION_KEY": "z" * 32,
    }

    def test_five_groups(self):
        gs = build_groups("dp.st.stg_stg.tok", self.CALCOM)
        self.assertEqual(len(gs), 5)
        keys = [g.key for g in gs]
        self.assertEqual(keys, [
            "01-backend-heavy", "02-app-fast", "03-ai-infra",
            "04-braid", "05-scheduling-rare",
        ])

    def test_only_groups_1_2_5_have_fqdn(self):
        gs = build_groups("dp.st.stg_stg.tok", self.CALCOM)
        fqdns = {g.key: g.fqdn for g in gs}
        self.assertEqual(fqdns["01-backend-heavy"], "https://staging-api.aishacrm.com")
        self.assertEqual(fqdns["02-app-fast"], "https://staging-app.aishacrm.com")
        self.assertEqual(fqdns["05-scheduling-rare"], "https://staging-scheduler.aishacrm.com")
        self.assertIsNone(fqdns["03-ai-infra"])
        self.assertIsNone(fqdns["04-braid"])

    def test_doppler_token_in_every_group(self):
        gs = build_groups("dp.st.stg_stg.tok", self.CALCOM)
        for g in gs:
            self.assertEqual(g.extra_env["DOPPLER_TOKEN"], "dp.st.stg_stg.tok")
            self.assertEqual(g.extra_env["DOPPLER_PROJECT"], "aishacrm")
            self.assertEqual(g.extra_env["DOPPLER_CONFIG"], "stg_stg")

    def test_phase1_redis_only(self):
        # Group 1's COMPOSE_PROFILES must be empty for Phase 1 (Redis only)
        gs = build_groups("dp.st.stg_stg.tok", self.CALCOM)
        g1 = next(g for g in gs if g.key == "01-backend-heavy")
        self.assertEqual(g1.extra_env["COMPOSE_PROFILES"], "")

    def test_calcom_only_in_groups_1_and_5(self):
        # Group 1 needs DB creds (backend reads Cal.com DB).
        # Group 5 needs all crypto + DB creds (Cal.com itself).
        # Other groups should not leak Cal.com secrets.
        gs = build_groups("dp.st.stg_stg.tok", self.CALCOM)
        env = {g.key: g.extra_env for g in gs}
        self.assertIn("CALCOM_DB_PASSWORD", env["01-backend-heavy"])
        self.assertIn("CALCOM_DB_PASSWORD", env["05-scheduling-rare"])
        self.assertIn("CALCOM_NEXTAUTH_SECRET", env["05-scheduling-rare"])
        self.assertNotIn("CALCOM_NEXTAUTH_SECRET", env["01-backend-heavy"])
        self.assertNotIn("CALCOM_DB_PASSWORD", env["02-app-fast"])
        self.assertNotIn("CALCOM_DB_PASSWORD", env["03-ai-infra"])
        self.assertNotIn("CALCOM_DB_PASSWORD", env["04-braid"])

    def test_calcom_lengths_pass_through(self):
        gs = build_groups("tok", self.CALCOM)
        g5 = next(g for g in gs if g.key == "05-scheduling-rare")
        self.assertEqual(len(g5.extra_env["CALCOM_DB_PASSWORD"]), 40)
        self.assertEqual(len(g5.extra_env["CALCOM_NEXTAUTH_SECRET"]), 64)
        self.assertEqual(len(g5.extra_env["CALCOM_ENCRYPTION_KEY"]), 32)


class TestCoolifyAPI(unittest.TestCase):
    def test_create_dockercompose_uses_public_endpoint(self):
        cf = Coolify("https://x", "tok")
        with patch.object(cf, "_req") as m:
            m.return_value = {"uuid": "abc"}
            cf.create_dockercompose_app(
                project_uuid="P", environment_name="production",
                name="staging-x", git_branch="main",
                compose_path="/staging/01-backend-heavy/docker-compose.yml",
                fqdn="https://staging-api.aishacrm.com",
                public_service="backend",
            )
            args = m.call_args
            self.assertEqual(args.args[0], "POST")
            self.assertEqual(args.args[1], "/api/v1/applications/public")
            body = args.kwargs["body"]
            self.assertEqual(body["build_pack"], "dockercompose")
            self.assertEqual(body["git_repository"], REPO)
            self.assertEqual(body["server_uuid"], SERVER_UUID)
            # Coolify rejects top-level `domains` — uses docker_compose_domains array
            self.assertNotIn("domains", body)
            self.assertEqual(
                body["docker_compose_domains"],
                [{"name": "backend", "domain": "https://staging-api.aishacrm.com"}],
            )
            self.assertFalse(body["instant_deploy"])

    def test_no_fqdn_means_no_domains_field(self):
        cf = Coolify("https://x", "tok")
        with patch.object(cf, "_req") as m:
            m.return_value = {"uuid": "abc"}
            cf.create_dockercompose_app(
                project_uuid="P", environment_name="production",
                name="staging-x", git_branch="main",
                compose_path="/staging/03-ai-infra/docker-compose.yml",
                fqdn=None,
            )
            body = m.call_args.kwargs["body"]
            self.assertNotIn("domains", body)
            self.assertNotIn("docker_compose_domains", body)

    def test_dry_run_does_not_call_api(self):
        cf = Coolify("https://x", "tok", dry_run=True)
        with patch("urllib.request.urlopen") as urlopen:
            r = cf._req("POST", "/api/v1/projects", body={"name": "test"})
            self.assertEqual(r["_dry_run"], True)
            urlopen.assert_not_called()


# ---- CLI ------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default="main", help="GitHub branch Coolify should track")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be created, don't hit Coolify")
    ap.add_argument("--test", action