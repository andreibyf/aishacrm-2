"""Probe to confirm STRIPE_PLATFORM_SECRET_KEY is present and a test key.

Prints only the detected mode (TEST/LIVE/UNKNOWN) and a rough length
bucket. Does NOT print any characters of the key itself -- even partial
prefix/suffix disclosure in CI logs is avoidable, so it's avoided.

Exit codes:
  0 = test-mode key found (safe to proceed with sandbox operations)
  1 = no key set
  2 = live-mode or unknown-mode key (refuse to proceed)
"""
import os
import sys

k = os.environ.get("STRIPE_PLATFORM_SECRET_KEY", "")
if not k:
    print("MISSING: STRIPE_PLATFORM_SECRET_KEY not set")
    sys.exit(1)

if k.startswith("sk_test_"):
    mode = "TEST"
elif k.startswith("sk_live_"):
    mode = "LIVE"
else:
    mode = "UNKNOWN"

# Length buckets -- useful for distinguishing real Stripe keys (~107 chars)
# from placeholders like "sk_live_xxx" (length ~11) without revealing the
# exact length of a real secret.
if len(k) < 30:
    bucket = "placeholder"
elif len(k) < 80:
    bucket = "short"
else:
    bucket = "full"

print(f"mode={mode} length_bucket={bucket}")
if mode != "TEST":
    sys.exit(2)
