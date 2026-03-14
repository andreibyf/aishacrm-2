Title: Communications Platform Foundation

Epic:
Provider-Agnostic Communications Module

Goal:
Establish the Docker, network, provider-adapter, configuration, security, and Braid contracts required for provider-agnostic communications.

Description:
Define the base runtime needed by all later stories: communications-worker, communications-dispatcher, meeting-scheduler, provider connection configuration, queue topology, backend internal routes, and Braid tool boundaries. This story is complete only when the platform skeleton can be started in Docker and all persistence paths are explicitly routed through backend/Braid.

Acceptance Criteria:
- Docker topology is documented and reproducible
- all AiSHA-owned services attach to the shared app network
- tenant mailbox/provider configuration has an explicit schema
- backend internal API contract exists for inbound and outbound worker callbacks
- Braid tools required by the communications module are defined
- provider adapters are explicitly modeled without hard-coding a single vendor
