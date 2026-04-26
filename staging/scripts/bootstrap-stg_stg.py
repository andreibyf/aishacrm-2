#!/usr/bin/env python3
"""
Bootstrap stg_stg in Doppler — pure-REST equivalent of bootstrap-stg_stg.sh.

WHY THIS EXISTS:
  bootstrap-stg_stg.sh requires the `doppler` CLI plus an interactive `doppler
  login` flow. In CI/sandboxed environments where the CLI cannot be installed
  and there is no browser for the OAuth dance, that script cannot run. This
  script does the same six steps directly against api.doppler.com/v3 using a
  workplace-admin Personal Access Token (dp.pt.*) supplied via env var.

WHAT IT DOES (idempotent, re-runnable):
  1. Verifies the dp.pt.* token authenticates.
  2. Creates aishacrm/stg_stg if missing.
  3. Clones every secret from prd_prd → stg_stg (excluding Doppler meta keys).
  4. Applies staging-specific URL overrides + TELEMETRY_ENABLED=false.
  5. With --rotate-calcom: regenerates CALCOM_DB_PASSWORD,
     CALCOM_NEXTAUTH_SECRET, CALCOM_ENCRYPTION_KEY.
  6. Mints (or reissues) a service token named coolify-staging-YYYYMMDD,
     scoped read-only to stg_stg, and prints the plaintext token.

USAGE:
  export DOPPLER_PERSONAL_TOKEN=dp.pt.xxxxxxxx
  python3 staging/scripts/bootstrap-stg_stg.py --rotate-calcom

EXIT CODES:
  0 success, 1 auth failure, 2 source-config unreadable, 3 unexpected API error.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import secrets as pysecrets
import sys
import urllib.error
import urllib.request
from typing import Any

API = "https://api.doppler.com/v3"
PROJECT = "aishacrm"
SOURCE_CONFIG = "prd_prd"
TARGET_CONFIG = "stg_stg"
TARGET_ENV = "stg"

# Doppler auto-manages these per config; never overwrite.
SKIP_KEYS = {"DOPPLER_PROJECT", "DOPPLER_CONFIG", "DOPPLER_ENVIRONMENT"}

OVERRIDES: dict[str, str] = {
    "PUBLIC_SCHEDULER_URL": "https://staging-scheduler.aishacrm.com",
    "CALCOM_PUBLIC_URL": "https://staging-scheduler.aishacrm.com",
    "ALLOWED_ORIGINS": "https://staging-app.aishacrm.com",
    "VITE_AISHACRM_BACKEND_URL": "https://staging-api.aishacrm.com",
    "VITE_CALCOM_URL": "https://staging-scheduler.aishacrm.com",
    "CALCOM_ALLOWED_HOSTNAMES": "staging-scheduler.aishacrm.com",
    "NODE_ENV": "production",
    "TELEMETRY_ENABLED": "false",
}


def _request(method: str, path: str, token: str, body: dict | None = None) -> dict[str, Any]:
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    auth = base64.b64encode(f"{token}:".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth}",
        "Accept": "application/json",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode(errors="replace")
        try:
            return json.loads(body_txt)
        except json.JSONDecodeError:
            raise RuntimeError(f"{method} {path} → {e.code} {body_txt}") from None


def step1_verify_auth(token: str) -> None:
    print("=== 1. Verify Doppler auth ===")
    me = _request("GET", "/me", token)
    if not me.get("success", True) or me.get("type") != "personal":
        sys.exit(f"FAIL: token is not a personal access token: {me}")
    print(f"ok: authenticated as workplace_user in {me['workplace']['name']}")
    src = _request(
        "GET",
        f"/configs/config?project={PROJECT}&config={SOURCE_CONFIG}",
        token,
    )
    if not src.get("config"):
        sys.exit(2)
    print(f"ok: can read {SOURCE_CONFIG}")


def step2_create_target(token: str) -> None:
    print(f"\n=== 2. Create {TARGET_CONFIG} (if missing) ===")
    configs = _request("GET", f"/configs?project={PROJECT}", token).get("configs", [])
    if any(c["name"] == TARGET_CONFIG for c in configs):
        print(f"ok: {TARGET_CONFIG} already exists — secrets will be OVERWRITTEN")
        return
    # Doppler's POST /v3/configs requires the FULL config name with environment
    # prefix (e.g. "stg_stg"), not just the suffix. The API rejects names that
    # don't start with "<env>_" — verified empirically 2026-04-25.
    resp = _request(
        "POST",
        "/configs",
        token,
        body={"project": PROJECT, "environment": TARGET_ENV, "name": TARGET_CONFIG},
    )
    if not resp.get("config"):
        sys.exit(f"FAIL: create config: {resp}")
    print(f"ok: created {resp['config']['name']} in environment {TARGET_ENV}")


def step3_clone(token: str) -> int:
    print(f"\n=== 3. Clone secrets {SOURCE_CONFIG} → {TARGET_CONFIG} ===")
    src = _request(
        "GET",
        f"/configs/config/secrets?project={PROJECT}&config={SOURCE_CONFIG}"
        "&include_dynamic_secrets=false",
        token,
    )
    secrets_in = src.get("secrets", {})
    print(f"Source secret count: {len(secrets_in)}")
    payload = {
        k: v["raw"]
        for k, v in secrets_in.items()
        if k not in SKIP_KEYS
    }
    print(f"Pushing {len(payload)} secrets to {TARGET_CONFIG} (excluding meta keys)…")
    resp = _request(
        "POST",
        f"/configs/config/secrets?project={PROJECT}&config={TARGET_CONFIG}",
        token,
        body={"project": PROJECT, "config": TARGET_CONFIG, "secrets": payload},
    )
    if not resp.get("secrets"):
        sys.exit(f"FAIL: bulk set: {resp}")
    print(f"ok: cloned {len(payload)} secrets")
    return len(payload)


def step4_overrides(token: str) -> None:
    print("\n=== 4. Apply staging URL overrides ===")
    payload = dict(OVERRIDES)
    resp = _request(
        "POST",
        f"/configs/config/secrets?project={PROJECT}&config={TARGET_CONFIG}",
        token,
        body={"project": PROJECT, "config": TARGET_CONFIG, "secrets": payload},
    )
    if not resp.get("secrets"):
        sys.exit(f"FAIL: overrides: {resp}")
    print(f"ok: applied {len(OVERRIDES)} URL/env overrides")


def step5_rotate_calcom(token: str) -> None:
    print("\n=== 5. Rotate Cal.com cryptographic secrets ===")
    # 40-char DB password (alnum-safe), 64-char NextAuth secret, 32-char encryption key.
    # `secrets.token_urlsafe` returns ~1.3 chars per byte; trim to required length.
    pwd = pysecrets.token_urlsafe(40)[:40]
    nextauth = pysecrets.token_urlsafe(64)[:64]
    encrypt = pysecrets.token_urlsafe(32)[:32]
    payload = {
        "CALCOM_DB_PASSWORD": pwd,
        "CALCOM_NEXTAUTH_SECRET": nextauth,
        "CALCOM_ENCRYPTION_KEY": encrypt,
    }
    resp = _request(
        "POST",
        f"/configs/config/secrets?project={PROJECT}&config={TARGET_CONFIG}",
        token,
        body={"project": PROJECT, "config": TARGET_CONFIG, "secrets": payload},
    )
    if not resp.get("secrets"):
        sys.exit(f"FAIL: rotate calcom: {resp}")
    print("ok: rotated CALCOM_DB_PASSWORD, CALCOM_NEXTAUTH_SECRET, CALCOM_ENCRYPTION_KEY")
    print("    (values written to Doppler — not printed here)")


def step6_mint_token(token: str) -> str:
    print("\n=== 6. Mint Coolify service token ===")
    name = f"coolify-staging-{dt.date.today().strftime('%Y%m%d')}"
    existing = _request(
        "GET",
        f"/configs/config/tokens?project={PROJECT}&config={TARGET_CONFIG}",
        token,
    ).get("tokens", [])
    for t in existing:
        if t["name"] == name:
            print(f"Token '{name}' already exists — revoking and reissuing")
            _request(
                "DELETE",
                f"/configs/config/tokens?project={PROJECT}&config={TARGET_CONFIG}",
                token,
                body={"project": PROJECT, "config": TARGET_CONFIG, "slug": t["slug"]},
            )
            break
    resp = _request(
        "POST",
        f"/configs/config/tokens?project={PROJECT}&config={TARGET_CONFIG}",
        token,
        body={
            "project": PROJECT,
            "config": TARGET_CONFIG,
            "name": name,
            "access": "read",
        },
    )
    # API nests the new token under resp.token.key; older docs claim resp.key.
    # Accept either shape so the script tolerates Doppler API revisions.
    plaintext = resp.get("key") or (resp.get("token") or {}).get("key")
    if not plaintext:
        sys.exit(f"FAIL: mint token: {resp}")
    print(f"ok: minted '{name}' (read-only on {TARGET_CONFIG})")
    return plaintext


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--rotate-calcom", action="store_true",
                   help="Regenerate Cal.com DB password, NextAuth secret, encryption key.")
    args = p.parse_args()

    token = os.environ.get("DOPPLER_PERSONAL_TOKEN") or os.environ.get("DOPPLER_ACCESS_TOKEN")
    if not token or not token.startswith("dp.pt."):
        sys.exit(
            "FAIL: set DOPPLER_PERSONAL_TOKEN (or DOPPLER_ACCESS_TOKEN) to a dp.pt.* "
            "personal access token. Service tokens (dp.st.*) cannot create configs or "
            "read configs they aren't scoped to."
        )

    step1_verify_auth(token)
    step2_create_target(token)
    cloned = step3_clone(token)
    step4_overrides(token)
    if args.rotate_calcom:
        step5_rotate_calcom(token)
    else:
        print("\n=== 5. Cal.com rotation skipped (pass --rotate-calcom on first run) ===")
    coolify_token = step6_mint_token(token)

    print("\n=== DONE ===\n")
    print("Coolify env-var values to paste into EVERY staging resource:")
    print(f"  DOPPLER_TOKEN={coolify_token}")
    print(f"  DOPPLER_PROJECT={PROJECT}")
    print(f"  DOPPLER_CONFIG={TARGET_CONFIG}")
    print()
    print(f"Verify: GET {API}/configs/config/secrets?project={PROJECT}&config={TARGET_CONFIG}")
    print(f"  (expect ~{cloned + len(OVERRIDES)} keys including overrides)")


if __name__ == "__main__":
    main()
