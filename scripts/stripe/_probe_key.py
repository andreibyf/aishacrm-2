"""Probe to confirm STRIPE_PLATFORM_SECRET_KEY is present and a test key."""
import os
import sys

k = os.environ.get("STRIPE_PLATFORM_SECRET_KEY", "")
if not k:
    print("MISSING: STRIPE_PLATFORM_SECRET_KEY not set")
    sys.exit(1)
mode = "TEST" if k.startswith("sk_test_") else ("LIVE" if k.startswith("sk_live_") else "UNKNOWN")
print(f"prefix={k[:12]} suffix={k[-4:]} len={len(k)} mode={mode}")
if mode != "TEST":
    sys.exit(2)
