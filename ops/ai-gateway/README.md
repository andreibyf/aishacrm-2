# AI Gateway (private Tailscale proxy to the AI Cloud Server)

Lets the CRM's **staging/prod LiteLLM reach the home AI server privately**, so your
agent team can run tasks on the box (vLLM full tier + Ollama lite tiers) instead of
paying for cloud — without exposing the box to the public internet.

See [`docs/ai-server/failover.md`](../../docs/ai-server/failover.md) for the why.

## The problem it solves

The AI server is at home behind NAT, reachable only over **Tailscale**
(`100.81.132.118`). The host VPSes are on the tailnet, but a **container** can't
route to a tailnet IP (Tailscale is host-level). So staging/prod LiteLLM tries
`100.81.132.118:8000`, fails, and silently falls back to cloud. This gateway joins
the tailnet and proxies to the box, so LiteLLM reaches it by docker name.

```
LiteLLM (container) ──docker net──▶ ai-gateway (tailnet node) ──tailnet──▶ AI server
   http://ai-gateway:8000/v1                                          vLLM :8000
   http://ai-gateway:11434                                            Ollama :11434
```

Private end-to-end. No public DNS, no open Ollama. If the gateway or box is down,
LiteLLM's fallback chains still route to cloud (no hard dependency).

## Auth: the existing OAuth client secret (no key to mint)

The gateway authenticates to the tailnet using the **OAuth client secret you already
have** — `TAILSCALE_CLIENT_SECRET` in `.env` (the `tskey-client-…` value). No minted
auth key to manage, and the OAuth secret is long-lived, so there's no key-expiry trap.
The `--advertise-tags=tag:crm` in the compose names the tag (required with OAuth auth).

Set it in **Doppler** for each env that runs a gateway:
- `stg_stg`: `TS_AUTHKEY = <TAILSCALE_CLIENT_SECRET value>`, `TS_GATEWAY_HOSTNAME = ai-gateway-staging`
- `prd_prd`: `TS_AUTHKEY = <TAILSCALE_CLIENT_SECRET value>`, `TS_GATEWAY_HOSTNAME = ai-gateway-prod`

(The OAuth client must own `tag:crm` — it's in the tailnet's `tagOwners`. Nodes auth'd
via an OAuth secret are ephemeral, which is fine: the long-lived secret re-registers
the node on every restart, and the gateway's *docker* name `ai-gateway` is what LiteLLM
resolves — stable regardless of the node's churn.)

## Deploy (per remote env)

1. **Add this `docker-compose.yml` as a new Coolify app** on the right host
   (staging→VPS-1, prod→Hetzner), on the **same network as that env's LiteLLM** so
   the `ai-gateway` name resolves. (No public FQDN — it's internal only.)
2. Deploy it. Confirm it joined the tailnet: it should appear in the Tailscale admin
   console as `ai-gateway-staging` / `ai-gateway-prod` (tagged `tag:crm`).
3. **Point LiteLLM at it** in that env's Doppler, then redeploy LiteLLM:
   - `LOCAL_LLM_BASE_URL = http://ai-gateway:8000/v1`
   - `LOCAL_LLM_OLLAMA_BASE_URL = http://ai-gateway:11434`
4. **Verify** the box is now actually used: run an agent task, then check the AI
   server monitor (`:7860` By Model / Audit) or `vllm:e2e_request_latency_seconds_count`
   on the box — it should increment (it was stuck at cloud-only before).

## Verifying reachability from inside the env

From the LiteLLM container (or any container on the same network):
```sh
wget -qO- --timeout=5 http://ai-gateway:8000/health || echo UNREACHABLE
```
`UNREACHABLE` ⇒ the gateway isn't joined to the tailnet (check `TS_AUTHKEY`/tag) or
isn't on the same docker network as the caller.
