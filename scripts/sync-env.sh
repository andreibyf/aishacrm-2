#!/bin/bash
# Environment Sync Script
# Validates and syncs .env files across dev/prod environments
# Usage: ./sync-env.sh [validate|sync-to-prod|add-to-git-secrets]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths
BACKEND_ENV="./backend/.env"
ROOT_ENV="./.env"
MCP_ENV="./braid-mcp-node-server/.env"
ENV_SCHEMA="./env-schema.json"

# Function to print colored messages
print_error() { echo -e "${RED}ERROR: $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "ℹ $1"; }

# Function to extract variable names from .env file
get_env_vars() {
    local file=$1
    grep -E "^[A-Z_]+=" "$file" 2>/dev/null | cut -d'=' -f1 | sort
}

# Function to check if variable exists in file
has_var() {
    local file=$1
    local var=$2
    grep -q "^${var}=" "$file" 2>/dev/null
}

# Function to get variable value from file
get_var() {
    local file=$1
    local var=$2
    grep "^${var}=" "$file" 2>/dev/null | cut -d'=' -f2- | sed 's/^["'\'']\(.*\)["'\'']$/\1/'
}

# Validate: Check for required variables in each environment
validate() {
    print_info "Validating environment files..."
    
    local errors=0
    
    # Load schema if exists
    if [ ! -f "$ENV_SCHEMA" ]; then
        print_warning "env-schema.json not found, using basic validation"
    fi
    
    # Check backend/.env
    if [ ! -f "$BACKEND_ENV" ]; then
        print_error "backend/.env not found"
        errors=$((errors + 1))
    else
        print_info "Checking backend/.env..."
        
        # Critical backend vars
        local required_backend=(
            "SUPABASE_URL"
            "SUPABASE_SERVICE_ROLE_KEY"
            "SUPABASE_ANON_KEY"
            "JWT_SECRET"
            "OPENAI_API_KEY"
            "SYSTEM_TENANT_ID"
        )
        
        for var in "${required_backend[@]}"; do
            if ! has_var "$BACKEND_ENV" "$var"; then
                print_error "Missing required variable: $var"
                errors=$((errors + 1))
            fi
        done
    fi
    
    # Check MCP .env
    if [ ! -f "$MCP_ENV" ]; then
        print_error "braid-mcp-node-server/.env not found"
        errors=$((errors + 1))
    else
        print_info "Checking braid-mcp-node-server/.env..."
        
        # Critical MCP vars
        local required_mcp=(
            "SUPABASE_URL"
            "SUPABASE_SERVICE_ROLE_KEY"
            "OPENAI_API_KEY"
            "GITHUB_TOKEN"
            "DEFAULT_TENANT_ID"
        )
        
        for var in "${required_mcp[@]}"; do
            if ! has_var "$MCP_ENV" "$var"; then
                print_error "Missing required variable in MCP: $var"
                errors=$((errors + 1))
            fi
        done
    fi
    
    # Check for inconsistencies
    print_info "Checking for inconsistent values..."
    
    # SUPABASE_URL should match
    if has_var "$BACKEND_ENV" "SUPABASE_URL" && has_var "$MCP_ENV" "SUPABASE_URL"; then
        local backend_url=$(get_var "$BACKEND_ENV" "SUPABASE_URL")
        local mcp_url=$(get_var "$MCP_ENV" "SUPABASE_URL")
        
        if [ "$backend_url" != "$mcp_url" ]; then
            print_warning "SUPABASE_URL mismatch:"
            echo "  Backend: $backend_url"
            echo "  MCP:     $mcp_url"
        fi
    fi
    
    # Check for Docker-specific vars that shouldn't be in .env
    print_info "Checking for Docker-managed variables..."
    
    local docker_managed=(
        "NODE_ENV"
        "MCP_ROLE"
        "MCP_NODE_ID"
    )
    
    for var in "${docker_managed[@]}"; do
        if has_var "$MCP_ENV" "$var"; then
            print_warning "MCP .env contains Docker-managed variable: $var (compose will override)"
        fi
    done
    
    if [ $errors -eq 0 ]; then
        print_success "Validation passed!"
        return 0
    else
        print_error "Validation failed with $errors error(s)"
        return 1
    fi
}

# Sync: Copy common variables from backend to MCP
sync_to_mcp() {
    print_info "Syncing common variables from backend/.env to MCP .env..."
    
    local vars_to_sync=(
        "SUPABASE_URL"
        "SUPABASE_SERVICE_ROLE_KEY"
        "SUPABASE_ANON_KEY"
        "OPENAI_API_KEY"
        "ANTHROPIC_API_KEY"
        "GROQ_API_KEY"
    )
    
    # Backup MCP .env
    cp "$MCP_ENV" "${MCP_ENV}.backup.$(date +%Y%m%d_%H%M%S)"
    print_info "Created backup: ${MCP_ENV}.backup"
    
    for var in "${vars_to_sync[@]}"; do
        if has_var "$BACKEND_ENV" "$var"; then
            local value=$(get_var "$BACKEND_ENV" "$var")
            
            if has_var "$MCP_ENV" "$var"; then
                # Update existing
                sed -i.tmp "s|^${var}=.*|${var}=${value}|" "$MCP_ENV"
                print_success "Updated $var"
            else
                # Add new
                echo "${var}=${value}" >> "$MCP_ENV"
                print_success "Added $var"
            fi
        fi
    done
    
    # Set MCP-specific defaults
    if ! has_var "$MCP_ENV" "DEFAULT_TENANT_ID"; then
        local system_tenant=$(get_var "$BACKEND_ENV" "SYSTEM_TENANT_ID")
        echo "DEFAULT_TENANT_ID=${system_tenant}" >> "$MCP_ENV"
        print_success "Added DEFAULT_TENANT_ID"
    fi
    
    # Add USE_SUPABASE_PROD if missing
    if ! has_var "$MCP_ENV" "USE_SUPABASE_PROD"; then
        echo "USE_SUPABASE_PROD=true" >> "$MCP_ENV"
        print_success "Added USE_SUPABASE_PROD"
    fi
    
    rm -f "${MCP_ENV}.tmp"
    print_success "Sync complete!"
}

# Generate GitHub secrets list
generate_secrets_list() {
    print_info "Generating GitHub secrets checklist..."
    
    echo ""
    echo "=== Required GitHub Secrets ==="
    echo ""
    
    # Extract all secrets that should be in GitHub
    local secrets=(
        "SUPABASE_URL"
        "SUPABASE_SERVICE_ROLE_KEY"
        "VITE_SUPABASE_URL"
        "VITE_SUPABASE_ANON_KEY"
        "VITE_AISHACRM_BACKEND_URL"
        "VITE_SYSTEM_TENANT_ID"
        "OPENAI_API_KEY"
        "ANTHROPIC_API_KEY"
        "GROQ_API_KEY"
        "PROD_MCP_GITHUB_TOKEN"
        "PROD_VPS_HOST"
        "PROD_VPS_USER"
        "PROD_VPS_SSH_KEY"
    )
    
    for secret in "${secrets[@]}"; do
        # Check if value exists in backend .env
        local env_var="${secret/VITE_/}"  # Strip VITE_ for lookup
        env_var="${env_var/PROD_MCP_GITHUB_TOKEN/GITHUB_TOKEN}"  # Map PROD_MCP to GITHUB_TOKEN
        
        if has_var "$BACKEND_ENV" "$env_var"; then
            local value=$(get_var "$BACKEND_ENV" "$env_var")
            local masked_value="${value:0:10}..."
            echo "✓ $secret (exists in .env: $masked_value)"
        else
            echo "⚠ $secret (NOT in .env - set manually)"
        fi
    done
    
    echo ""
    echo "To add secrets to GitHub:"
    echo "  gh secret set SECRET_NAME -b \"value\""
    echo ""
}

# Interactive mode
interactive() {
    echo ""
    echo "=== Environment Sync Tool ==="
    echo ""
    echo "1. Validate all .env files"
    echo "2. Sync backend → MCP"
    echo "3. Generate GitHub secrets list"
    echo "4. Exit"
    echo ""
    read -p "Select option (1-4): " choice
    
    case $choice in
        1) validate ;;
        2) sync_to_mcp ;;
        3) generate_secrets_list ;;
        4) exit 0 ;;
        *) print_error "Invalid option"; exit 1 ;;
    esac
}

# Main
case "${1:-interactive}" in
    validate)
        validate
        ;;
    sync)
        sync_to_mcp
        ;;
    secrets)
        generate_secrets_list
        ;;
    interactive)
        interactive
        ;;
    *)
        echo "Usage: $0 [validate|sync|secrets|interactive]"
        echo ""
        echo "Commands:"
        echo "  validate     - Check all .env files for required variables"
        echo "  sync         - Sync common variables from backend to MCP"
        echo "  secrets      - Generate GitHub secrets checklist"
        echo "  interactive  - Run interactive menu (default)"
        exit 1
        ;;
esac
