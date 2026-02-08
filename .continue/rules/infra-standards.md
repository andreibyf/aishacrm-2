---
description: Standards for Docker, Nginx, and Nixpacks infrastructure code.
---

# Infrastructure Standards

When generating infra code:
- Use multi-stage Docker builds.
- Use Nixpacks for deployment when possible.
- Use Nginx as a reverse proxy with gzip + caching.
- Never hardcode secrets; use Doppler.
- Follow production best practices for Node 22.
- Follow folder structure: infra/docker, infra/nginx, infra/nixpacks.
- Write clear comments for complex configurations.
- Ensure proper error handling and logging for infra components.