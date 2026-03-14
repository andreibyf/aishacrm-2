Title: Define Docker Topology and Network Contract

Epic:
Provider-Agnostic Communications Module

Story:
Communications Platform Foundation

Estimate:
1 hour

Description:
Document the container topology, network attachments, ports, volumes, and service dependencies for communications-worker, communications-dispatcher, meeting-scheduler, backend, Redis, and optional Redpanda integration.

Acceptance Criteria:
- one topology document or issue description defines all services and dependencies
- shared network contract is explicit
- hostname expectations between services are listed
- secrets and persistent volumes are identified
- external provider boundaries are documented separately from AiSHA-owned containers
