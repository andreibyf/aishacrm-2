"""
AishaCRM Stripe Subscription Tiers Setup (SANDBOX / TEST MODE ONLY)

Creates 4 Products (Starter, Growth, Pro, Enterprise) and 8 Prices
(1 flat base + 1 per-seat add-on per tier). Metadata on every object
lets the backend webhook handler map Stripe -> billing_plans by plan_code.

Idempotent: re-running updates in place, never creates duplicates.
  - Products matched by metadata[plan_code]
  - Prices matched by lookup_key (aishacrm_<plan_code>_<base|seat>)
  - If a price already exists with matching amount+product -> kept, metadata refreshed
  - If amount drifted -> old price archived, new one created (Stripe prices are
    immutable on amount)

Safety:
  - Hard refuses non-sk_test_ keys
  - Double-checks livemode flag before mutating

Usage (from aishacrm-2 root):
  doppler run --project aishacrm --config dev_personal \\
    --only-secrets STRIPE_PLATFORM_SECRET_KEY \\
    -- python scripts\\stripe\\setup_subscription_tiers.py --dry-run
  # then without --dry-run once output looks right
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API_BASE = "https://api.stripe.com/v1"
TRIAL_DAYS = 14

# ---- 4 tiers (plan_code MUST match billing_plans.code in Supabase) ----
TIERS = [
    {
        "plan_code": "starter_monthly",
        "name": "AishaCRM Starter",
        "description": (
            "CRM core + AiSHA AI assistant (web). Includes 3 users."
        ),
        "base_amount_cents": 19900,
        "included_seats": 3,
        "seat_amount_cents": 4900,
    },
    {
        "plan_code": "growth_monthly",
        "name": "AishaCRM Growth",
        "description": (
            "Starter + WhatsApp AiSHA + BRAID workflows + AI campaigns. "
            "Includes 5 users."
        ),
        "base_amount_cents": 29700,
        "included_seats": 5,
        "seat_amount_cents": 4900,
    },
    {
        "plan_code": "pro_monthly",
        "name": "AishaCRM Pro",
        "description": (
            "Growth + AI email drafting + CARE Autonomy + Cal.com + "
            "multi-team visibility. Includes 10 users."
        ),
        "base_amount_cents": 49700,
        "included_seats": 10,
        "seat_amount_cents": 4900,
    },
    {
        "plan_code": "enterprise_monthly",
        "name": "AishaCRM Enterprise",
        "description": (
            "All Pro features + priority AI + priority support. "
            "Includes 25 users."
        ),
        "base_amount_cents": 99700,
        "included_seats": 25,
        "seat_amount_cents": 4900,
    },
]


class StripeAPI:
    """Minimal Stripe REST client (stdlib-only, no deps)."""

    def __init__(self, api_key, dry_run=False):
        self.api_key = api_key
        self.dry_run = dry_run

    def _call(self, method, path, params=None):
        url = f"{API_BASE}{path}"
        data = None
        if params is not None:
            data = urllib.parse.urlencode(params, doseq=True).encode("utf-8")
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Stripe-Version", "2024-06-20")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            print(f"  !! HTTP {e.code} on {method} {path}", file=sys.stderr)
            print(f"     {body}", file=sys.stderr)
            raise

    def get(self, path):
        return self._call("GET", path)

    def post(self, path, params):
        if self.dry_run:
            print(f"  [DRY-RUN] POST {path}")
            for k, v in sorted(params.items()):
                print(f"             {k} = {v}")
            # Return a plausible stub so downstream logic keeps working
            stub_id = "dryrun_" + path.strip("/").replace("/", "_")
            return {"id": stub_id, "product": stub_id, "unit_amount": 0, **params}
        return self._call("POST", path, params)


def find_product_by_plan_code(api, plan_code):
    """List active products; filter client-side by metadata[plan_code].

    We avoid Stripe Search API here because it requires indexing to be
    enabled on the account and takes up to 60s to reflect new writes.
    Listing is reliable for catalogs of this size.
    """
    starting_after = None
    while True:
        suffix = "?limit=100&active=true"
        if starting_after:
            suffix += f"&starting_after={starting_after}"
        result = api.get(f"/products{suffix}")
        for p in result.get("data", []):
            if p.get("metadata", {}).get("plan_code") == plan_code:
                return p
        if not result.get("has_more"):
            return None
        starting_after = result["data"][-1]["id"]


def find_price_by_lookup_key(api, lookup_key):
    encoded = urllib.parse.quote(lookup_key)
    result = api.get(
        f"/prices?lookup_keys[]={encoded}&active=true&limit=10"
    )
    data = result.get("data", [])
    return data[0] if data else None


def upsert_product(api, tier):
    existing = find_product_by_plan_code(api, tier["plan_code"])
    params = {
        "name": tier["name"],
        "description": tier["description"],
        "metadata[plan_code]": tier["plan_code"],
        "metadata[included_seats]": str(tier["included_seats"]),
        "metadata[source]": "aishacrm",
    }
    if existing:
        print(f"  [product] update  {existing['id']}  ({tier['plan_code']})")
        return api.post(f"/products/{existing['id']}", params)
    print(f"  [product] create  ({tier['plan_code']})")
    return api.post("/products", params)


def upsert_price(api, product_id, tier, role):
    """role: 'base' (flat fee, includes N seats) or 'seat' (per extra user)."""
    lookup_key = f"aishacrm_{tier['plan_code']}_{role}"
    amount = (
        tier["base_amount_cents"] if role == "base" else tier["seat_amount_cents"]
    )
    nickname = (
        f"{tier['name']} -- Base (flat, incl. {tier['included_seats']} seats)"
        if role == "base"
        else f"{tier['name']} -- Additional seat"
    )

    existing = find_price_by_lookup_key(api, lookup_key)
    if existing:
        if (
            existing.get("unit_amount") == amount
            and existing.get("product") == product_id
        ):
            print(
                f"  [price]   keep    {existing['id']}  ({lookup_key})  "
                f"${amount / 100:.2f}"
            )
            # Metadata IS mutable; refresh it on kept prices
            api.post(
                f"/prices/{existing['id']}",
                {
                    "metadata[plan_code]": tier["plan_code"],
                    "metadata[role]": role,
                    "metadata[included_seats]": (
                        str(tier["included_seats"]) if role == "base" else "0"
                    ),
                    "metadata[trial_days]": str(TRIAL_DAYS),
                    "nickname": nickname,
                },
            )
            return existing
        # Amount or product drift -- price is immutable on amount, so archive
        print(f"  [price]   archive {existing['id']}  (amount/product drift)")
        api.post(
            f"/prices/{existing['id']}",
            {"active": "false", "lookup_key": ""},
        )


    # Create fresh price
    params = {
        "product": product_id,
        "currency": "usd",
        "unit_amount": str(amount),
        "recurring[interval]": "month",
        # Both base and seat are quantity-based (subscription quantity controls
        # how many seats are billed). usage_type=licensed is correct here.
        "recurring[usage_type]": "licensed",
        "lookup_key": lookup_key,
        "nickname": nickname,
        "metadata[plan_code]": tier["plan_code"],
        "metadata[role]": role,
        "metadata[included_seats]": (
            str(tier["included_seats"]) if role == "base" else "0"
        ),
        "metadata[trial_days]": str(TRIAL_DAYS),
        "tax_behavior": "exclusive",
    }
    created = api.post("/prices", params)
    print(
        f"  [price]   create  {created.get('id')}  ({lookup_key})  "
        f"${amount / 100:.2f}"
    )
    return created


def verify_mode(api):
    """Refuse to run unless we are unambiguously in test mode."""
    if api.dry_run:
        return
    bal = api.get("/balance")
    if bal.get("livemode"):
        print("!! LIVE MODE DETECTED. Aborting.", file=sys.stderr)
        sys.exit(2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print planned API calls without sending them",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("STRIPE_PLATFORM_SECRET_KEY")
                 or os.environ.get("STRIPE_API_KEY"),
        help="Stripe secret key (defaults to STRIPE_PLATFORM_SECRET_KEY)",
    )
    parser.add_argument(
        "--out",
        default=os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "stripe_tier_ids.json",
        ),
        help="Path to write the plan_code->price_id mapping JSON",
    )
    args = parser.parse_args()

    if not args.api_key:
        print(
            "ERROR: no key. Set STRIPE_PLATFORM_SECRET_KEY via `doppler run`, "
            "or pass --api-key sk_test_...",
            file=sys.stderr,
        )
        sys.exit(1)
    if not args.api_key.startswith("sk_test_"):
        print(
            "ERROR: refusing to run with non-sk_test_ key "
            "(test-mode safeguard).",
            file=sys.stderr,
        )
        sys.exit(1)

    api = StripeAPI(args.api_key, dry_run=args.dry_run)
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'TEST (live API calls)'}")
    verify_mode(api)
    print(f"Trial days (metadata only): {TRIAL_DAYS}")
    print()

    summary = []
    for tier in TIERS:
        print(f"== {tier['name']} ({tier['plan_code']}) ==")
        product = upsert_product(api, tier)
        pid = product["id"]
        base = upsert_price(api, pid, tier, "base")
        seat = upsert_price(api, pid, tier, "seat")
        summary.append({
            "plan_code": tier["plan_code"],
            "product_id": pid,
            "price_id_base": base["id"],
            "price_id_seat": seat["id"],
            "included_seats": tier["included_seats"],
            "base_amount_cents": tier["base_amount_cents"],
            "seat_amount_cents": tier["seat_amount_cents"],
            "trial_days": TRIAL_DAYS,
        })
        print()

    print("=" * 70)
    print("SUMMARY (feeds Migration 155 seeding):")
    print("=" * 70)
    print(json.dumps(summary, indent=2))

    if not api.dry_run:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(f"\nWrote mapping to: {args.out}")


if __name__ == "__main__":
    main()
