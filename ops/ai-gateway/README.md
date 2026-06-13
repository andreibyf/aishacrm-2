# AI Gateway (private Tailscale path to the AI Cloud Server)

Lets the CRM's **staging/prod LiteLLM reach the home AI server privately**, so the
agent fleet runs on the box (vLLM full tier + Ollama lite tiers) instead of paying
for cloud — without exposing the box to the public internet.

See [`docs/ai-server/failover.md`](../../docs/ai-server/failover.md) for the why.

## The problem & the design

The AI server is at home behind NAT, reachable only over **Tailscale**
(`100.81.132.118`). Remote VPS hosts are on the tailnet, but a **container** can't
route to a tailnet IP. So staging/prod LiteLLM tried `100.81.132.118:8000`, failed,
and silently fell back to cloud.

This stack fixes it (verified end-to-end on staging):

```
LiteLLM (container) ──docker net──▶ ai-gateway (Tailscale, kernel mode)
                                        └─ socat sidecars (share its netns)
   http://ai-gateway:8000/v1  ─────────▶  :8000 ─tailnet─▶ AI server vLLM :8000
   http://ai-gateway:11434    ─────────▶  :11434 ─tailnet─▶ AI server Ollama :11434
```

- `ai-gateway` = a Tailscale node in **kernel mode** (`NET_ADMIN` + `/dev/net/tun`;
  userspace mode can't TCP-forward). Joins the tailnet AND the env's docker network
  as `ai-gateway`.
- Two `socat` sidecars **share the gateway's network namespace** and forward :8000 /
  :11434 to the box's tailnet IP (reachable from inside that netns).
- **Not** `TS_DEST_IP` — that proxies tailnet-*inbound* traffic; we need docker→tailnet
  *egress*, which the socat sidecars do.

Private end-to-end. No public DNS, no open Ollama. If the gateway/box is down,
LiteLLM's fallback chains still route to cloud (no hard dependency).

> **Maintenance note:** keep `docker-compose.yml` **comment-light**. Coolify's
> "Docker Compose" build pack *shells* the file when reading it from the repo, so
> backticks or `$()` in YAML comments break the repo-read with
> `bash: syntax error near unexpected token`. All the design detail lives in this
> README instead — don't move it back into the compose as backtick'd comments.

## Auth: the Tailscale OAuth client secret (no expiry trap)

`TS_AUTHKEY` = the **OAuth client secret** (`tskey-client-…`, your
`TAILSCALE_CLIENT_SECRET`). It's long-lived, so unlike a 90-day auth key it can't
strand the gateway. The OAuth client must have the **Auth Keys** write scope and own
`tag:crm` (named via `--advertise-tags=tag:crm`). Set it as an env var on the env
that runs the gateway.

## Deploy (per remote env)

Set `TS_AUTHKEY`, `TS_GATEWAY_HOSTNAME` (`ai-gateway-staging`/`-prod`), and
`AISHANET_NAME` (`aishacrm_aishanet-staging` for staging, `aishanet` for prod), then
bring up this compose on the same docker network as that env's LiteLLM — either as a
**Coolify "Docker Compose" app** (image-only, so Coolify deploys all 3 services,
unlike a build app), or directly on the host. Then point LiteLLM at it in Doppler:

```
LOCAL_LLM_BASE_URL        = http://ai-gateway:8000/v1
LOCAL_LLM_OLLAMA_BASE_URL = http://ai-gateway:11434
```
and redeploy the LiteLLM app.

> **Current state:** staging is deployed as standalone `docker run` containers
> (`ai-gateway-staging` + `ai-gw-8000` + `ai-gw-11434`, `--restart unless-stopped`)
> and verified — `aisha-task` via LiteLLM hits the box's vLLM (counter climbs). They
> should be re-deployed from this compose (Coolify app) for clean management. Prod is
> pending (needs this stack deployed on Hetzner).
>
> **Healthcheck:** the compose defines one on `ai-gateway` (`tailscale status`), so
> Coolify/Dockhand surfaces "up but not on the tailnet" (e.g. a bad/expired `TS_AUTHKEY`)
> instead of only run-state. The standalone container has no probe — add it on the next
> `docker run` with:
> `--health-cmd "tailscale status" --health-interval 30s --health-timeout 10s --health-retries 3 --health-start-period 45s`

## Verify

From the LiteLLM container (or any container on the same network):
```sh
wget -qO- --timeout=8 http://ai-gateway:8000/health    # vLLM reachable (rc 0)
```
Then run an agent task and watch the box's `vllm:e2e_request_latency_seconds_count`
(on the AI server) climb — it was stuck at cloud-only before.
