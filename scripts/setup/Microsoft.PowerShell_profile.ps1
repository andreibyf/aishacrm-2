# ============================================================
#  PowerShell Profile  -  AiSHA CRM + Docker shortcuts
#  To install, run:
#    Copy-Item "$env:USERPROFILE\Documents\GitHub\aishacrm-2\scripts\setup\Microsoft.PowerShell_profile.ps1" $PROFILE
# ============================================================

# ---- Paths --------------------------------------------------
$AISHA = "C:\Users\andre\Documents\GitHub\aishacrm-2"

# ---- AiSHA CRM shortcuts ------------------------------------

# Start all services detached
function aisha-up {
    docker compose -f "$AISHA\docker-compose.yml" up -d @args
}

# Rebuild backend + frontend then start all
function aisha-build {
    docker compose -f "$AISHA\docker-compose.yml" up -d --build backend frontend @args
}

# Stop all services
function aisha-down {
    docker compose -f "$AISHA\docker-compose.yml" down @args
}

# Restart one or all services
# Usage: aisha-restart          (all)
#        aisha-restart backend  (one)
function aisha-restart {
    docker compose -f "$AISHA\docker-compose.yml" restart @args
}

# Compact status table: Name / Status / Ports
function aisha-ps {
    docker compose -f "$AISHA\docker-compose.yml" ps --format "table {{.Name}}`t{{.Status}}`t{{.Ports}}"
}

# Follow logs for one service or all
# Usage: aisha-logs                    (all, 150 lines)
#        aisha-logs backend            (service, 150 lines)
#        aisha-logs backend 300        (service, 300 lines)
function aisha-logs {
    param(
        [string]$Service = "",
        [int]$Tail = 150
    )
    if ($Service) {
        docker compose -f "$AISHA\docker-compose.yml" logs -f --tail $Tail $Service
    } else {
        docker compose -f "$AISHA\docker-compose.yml" logs -f --tail $Tail
    }
}

# ---- Agent-Office shortcuts ----------------------------------
# Set this to wherever your agent-office repo lives
$AGENT_OFFICE = "C:\Users\andre\Documents\GitHub\agent-office"

# Rebuild & start all agent-office containers
function aisha-office-build {
    docker compose -f "$AGENT_OFFICE\docker-compose.yml" up -d --build @args
}

# Stop all agent-office containers
function aisha-office-down {
    docker compose -f "$AGENT_OFFICE\docker-compose.yml" down @args
}

# Show agent-office container status
function aisha-office-ps {
    docker compose -f "$AGENT_OFFICE\docker-compose.yml" ps --format "table {{.Name}}`t{{.Status}}`t{{.Ports}}"
}

# Tail agent-office logs (150 lines default)
# Usage: aisha-office-logs              (all services)
#        aisha-office-logs worker       (one service)
#        aisha-office-logs worker 300   (custom tail)
function aisha-office-logs {
    param(
        [string]$Service = "",
        [int]$Tail = 150
    )
    if ($Service) {
        docker compose -f "$AGENT_OFFICE\docker-compose.yml" logs -f --tail $Tail $Service
    } else {
        docker compose -f "$AGENT_OFFICE\docker-compose.yml" logs -f --tail $Tail
    }
}

# ---- Generic docker compose shortcuts -----------------------

# dc  -> docker compose (passthrough)
function dc      { docker compose @args }

# dcu -> docker compose up -d
function dcu     { docker compose up -d @args }

# dcb -> docker compose up -d --build
function dcb     { docker compose up -d --build @args }

# dcd -> docker compose down
function dcd     { docker compose down @args }

# dcr -> docker compose restart
function dcr     { docker compose restart @args }

# dcl -> docker compose logs -f --tail 150
function dcl     { docker compose logs -f --tail 150 @args }

# dps -> compact docker ps (running only)
function dps {
    docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
}

# dpsa -> compact docker ps -a (all containers)
function dpsa {
    docker ps -a --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
}

# dlogs <container> [tail]  -> follow a raw container's logs
# Usage: dlogs aishacrm-backend
#        dlogs aishacrm-backend 300
function dlogs {
    param(
        [Parameter(Mandatory, Position = 0)]
        [string]$Container,
        [Parameter(Position = 1)]
        [int]$Tail = 150
    )
    docker logs -f --tail $Tail $Container
}

# dcplogs [service] [tail]  -> compose logs for cwd project
# Usage: dcplogs                 (all services)
#        dcplogs backend         (one service)
#        dcplogs backend 300     (custom tail)
function dcplogs {
    param(
        [Parameter(Position = 0)]
        [string]$Service = "",
        [Parameter(Position = 1)]
        [int]$Tail = 150
    )
    if ($Service) {
        docker compose logs -f --tail $Tail $Service
    } else {
        docker compose logs -f --tail $Tail
    }
}

# ---- Done ---------------------------------------------------
Write-Host "  AiSHA shortcuts loaded  " -ForegroundColor DarkGray
