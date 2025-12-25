#!/bin/bash

# ====================================================================
# GitHub Secrets to Variables Migration Script
# ====================================================================
# 
# Migrates non-sensitive configuration values from GitHub Secrets to
# GitHub Variables for better transparency and management.
#
# Usage:
#   ./scripts/migrate-to-variables.sh              # Interactive mode
#   ./scripts/migrate-to-variables.sh --dry-run    # Preview changes
#   ./scripts/migrate-to-variables.sh --yes        # Non-interactive
#   ./scripts/migrate-to-variables.sh --rollback   # Undo migration
#
# Requirements:
#   - GitHub CLI (gh) installed and authenticated
#   - Repository admin permissions
#
# ====================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Parse command line arguments
DRY_RUN=false
AUTO_YES=false
ROLLBACK=false
REPO=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --yes|-y)
      AUTO_YES=true
      shift
      ;;
    --rollback)
      ROLLBACK=true
      shift
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --help|-h)
      cat << EOF
${CYAN}${BOLD}GitHub Secrets to Variables Migration Script${NC}

${YELLOW}Usage:${NC}
  $0 [options]

${YELLOW}Options:${NC}
  --dry-run           Preview changes without making them
  --yes, -y           Skip confirmation prompts
  --rollback          Undo the migration (delete variables)
  --repo OWNER/REPO   Specify repository (default: auto-detect)
  --help, -h          Show this help message

${YELLOW}Examples:${NC}
  # Preview what would be migrated
  $0 --dry-run

  # Run migration interactively
  $0

  # Run migration without prompts
  $0 --yes

  # Rollback the migration
  $0 --rollback

${YELLOW}Values to Migrate:${NC}
  ${CYAN}VITE_SUPABASE_URL${NC}         - Supabase project URL (public)
  ${CYAN}VITE_SUPABASE_ANON_KEY${NC}    - Anonymous/publishable key (public)
  ${CYAN}VITE_AISHACRM_BACKEND_URL${NC} - Backend API URL (public)
  ${CYAN}SUPABASE_URL${NC}              - Supabase project URL (non-sensitive)
  ${CYAN}TENANT_ID${NC}                 - Default test tenant ID (non-sensitive)

${YELLOW}Values Remaining as Secrets:${NC}
  - SUPABASE_SERVICE_ROLE_KEY (admin access)
  - PROD_VPS_* (deployment credentials)
  - DATABASE_URL (connection string)
  - JWT_SECRET, SESSION_SECRET (encryption keys)
  - All other sensitive values

EOF
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# ====================================================================
# Helper Functions
# ====================================================================

print_header() {
  echo ""
  echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}${BOLD}  $1${NC}"
  echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

print_step() {
  echo -e "${BLUE}▶${NC} ${BOLD}$1${NC}"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_info() {
  echo -e "${GRAY}ℹ${NC} $1"
}

check_gh_cli() {
  if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed"
    echo ""
    echo "Install it from: https://cli.github.com/"
    echo ""
    echo "Or use:"
    echo "  macOS:   brew install gh"
    echo "  Linux:   See https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
    echo "  Windows: choco install gh"
    exit 1
  fi
}

check_gh_auth() {
  if ! gh auth status &> /dev/null; then
    print_error "GitHub CLI is not authenticated"
    echo ""
    echo "Run: gh auth login"
    exit 1
  fi
}

get_repo() {
  if [ -n "$REPO" ]; then
    echo "$REPO"
  else
    # Try to auto-detect from git remote
    if git remote get-url origin &> /dev/null; then
      local remote_url=$(git remote get-url origin)
      # Extract owner/repo from SSH or HTTPS URL
      echo "$remote_url" | sed -E 's|.*github\.com[:/]||' | sed 's|\.git$||'
    else
      print_error "Could not auto-detect repository"
      echo "Use --repo OWNER/REPO to specify"
      exit 1
    fi
  fi
}

confirm() {
  if [ "$AUTO_YES" = true ]; then
    return 0
  fi
  
  local prompt="$1"
  local default="${2:-n}"
  
  if [ "$default" = "y" ]; then
    prompt="$prompt [Y/n] "
  else
    prompt="$prompt [y/N] "
  fi
  
  read -p "$(echo -e ${YELLOW}${prompt}${NC})" response
  response=${response:-$default}
  
  if [[ "$response" =~ ^[Yy]$ ]]; then
    return 0
  else
    return 1
  fi
}

# ====================================================================
# Migration Variables Configuration
# ====================================================================

# Variables to migrate from secrets to variables
# Format: "VARIABLE_NAME|Description|Example Value (not used, for display only)"
declare -a MIGRATE_VARS=(
  "VITE_SUPABASE_URL|Supabase project URL (public)|https://xxxxx.supabase.co"
  "VITE_SUPABASE_ANON_KEY|Supabase anonymous/publishable key (public)|eyJhbGci..."
  "VITE_AISHACRM_BACKEND_URL|Backend API URL (public)|https://api.example.com"
  "SUPABASE_URL|Supabase project URL (non-sensitive)|https://xxxxx.supabase.co"
  "TENANT_ID|Default test tenant ID (non-sensitive)|a11dfb63-4b18-4eb8-872e-747af2e37c46"
)

# ====================================================================
# Main Functions
# ====================================================================

list_migration_plan() {
  print_header "Migration Plan"
  
  echo -e "${BOLD}The following values will be migrated from Secrets to Variables:${NC}"
  echo ""
  
  for var_spec in "${MIGRATE_VARS[@]}"; do
    IFS='|' read -r name desc example <<< "$var_spec"
    echo -e "  ${CYAN}$name${NC}"
    echo -e "    ${GRAY}$desc${NC}"
    echo -e "    ${GRAY}Example: $example${NC}"
    echo ""
  done
  
  echo -e "${BOLD}These values will ${RED}remain as secrets${NC}${BOLD}:${NC}"
  echo -e "  ${GRAY}- SUPABASE_SERVICE_ROLE_KEY (admin access)${NC}"
  echo -e "  ${GRAY}- PROD_VPS_SSH_KEY, PROD_VPS_HOST, etc. (deployment)${NC}"
  echo -e "  ${GRAY}- DATABASE_URL (connection string)${NC}"
  echo -e "  ${GRAY}- JWT_SECRET, SESSION_SECRET (encryption)${NC}"
  echo -e "  ${GRAY}- PROD_MCP_GITHUB_TOKEN (authentication)${NC}"
  echo ""
}

get_secret_value() {
  local repo="$1"
  local secret_name="$2"
  
  # Note: gh CLI cannot retrieve secret values (they're encrypted)
  # We'll need the user to provide them or we read from a source
  echo ""
}

create_variable() {
  local repo="$1"
  local name="$2"
  local value="$3"
  
  if [ "$DRY_RUN" = true ]; then
    print_info "[DRY RUN] Would create variable: $name"
    return 0
  fi
  
  # Create the variable
  if echo "$value" | gh variable set "$name" -R "$repo" 2>&1; then
    return 0
  else
    return 1
  fi
}

delete_variable() {
  local repo="$1"
  local name="$2"
  
  if [ "$DRY_RUN" = true ]; then
    print_info "[DRY RUN] Would delete variable: $name"
    return 0
  fi
  
  if gh variable delete "$name" -R "$repo" 2>&1; then
    return 0
  else
    return 1
  fi
}

perform_migration() {
  local repo="$1"
  
  print_header "Performing Migration"
  
  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN MODE - No changes will be made"
    echo ""
  fi
  
  echo -e "${BOLD}Repository:${NC} $repo"
  echo ""
  
  if [ "$DRY_RUN" = false ]; then
    print_warning "IMPORTANT: This script will create GitHub Variables"
    print_warning "You'll need to manually provide values for each variable"
    print_warning "You can copy these from your current secrets if needed"
    echo ""
    
    if ! confirm "Do you want to continue?" "n"; then
      echo "Migration cancelled"
      exit 0
    fi
    echo ""
  fi
  
  local success_count=0
  local fail_count=0
  local skip_count=0
  
  for var_spec in "${MIGRATE_VARS[@]}"; do
    IFS='|' read -r name desc example <<< "$var_spec"
    
    print_step "Processing: $name"
    echo -e "  ${GRAY}$desc${NC}"
    
    if [ "$DRY_RUN" = false ]; then
      # Check if variable already exists
      if gh variable list -R "$repo" 2>/dev/null | grep -q "^$name"; then
        print_warning "Variable $name already exists"
        if ! confirm "  Overwrite existing value?" "n"; then
          print_info "Skipped $name"
          ((skip_count++))
          echo ""
          continue
        fi
      fi
      
      # Prompt for value
      echo -e "  ${YELLOW}Enter value for $name:${NC}"
      echo -e "  ${GRAY}(or press Enter to skip)${NC}"
      read -r value
      
      if [ -z "$value" ]; then
        print_info "Skipped $name (no value provided)"
        ((skip_count++))
        echo ""
        continue
      fi
      
      # Create the variable
      if create_variable "$repo" "$name" "$value"; then
        print_success "Created variable: $name"
        ((success_count++))
      else
        print_error "Failed to create variable: $name"
        ((fail_count++))
      fi
    else
      print_info "[DRY RUN] Would prompt for value"
      print_info "[DRY RUN] Would create variable: $name"
    fi
    
    echo ""
  done
  
  print_header "Migration Summary"
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN COMPLETE${NC}"
    echo ""
    echo "Would have processed ${#MIGRATE_VARS[@]} variables"
  else
    echo -e "${GREEN}Successfully created: $success_count${NC}"
    echo -e "${YELLOW}Skipped: $skip_count${NC}"
    echo -e "${RED}Failed: $fail_count${NC}"
    echo ""
    
    if [ $success_count -gt 0 ]; then
      print_success "Variables created successfully!"
      echo ""
      echo -e "${BOLD}Next steps:${NC}"
      echo "  1. Update workflow files to use vars.VARIABLE_NAME"
      echo "  2. Test workflows with new variables"
      echo "  3. Delete old secrets once verified"
      echo "  4. Update Doppler sync configuration"
      echo ""
      echo "See docs/GITHUB_VARIABLES_MIGRATION.md for details"
    fi
  fi
}

perform_rollback() {
  local repo="$1"
  
  print_header "Rolling Back Migration"
  
  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN MODE - No changes will be made"
    echo ""
  fi
  
  echo -e "${BOLD}Repository:${NC} $repo"
  echo ""
  echo "This will DELETE the following variables:"
  echo ""
  
  for var_spec in "${MIGRATE_VARS[@]}"; do
    IFS='|' read -r name desc example <<< "$var_spec"
    echo -e "  ${CYAN}$name${NC}"
  done
  
  echo ""
  
  if [ "$DRY_RUN" = false ]; then
    print_warning "This action cannot be undone!"
    if ! confirm "Do you want to continue with rollback?" "n"; then
      echo "Rollback cancelled"
      exit 0
    fi
    echo ""
  fi
  
  local success_count=0
  local fail_count=0
  local not_found_count=0
  
  for var_spec in "${MIGRATE_VARS[@]}"; do
    IFS='|' read -r name desc example <<< "$var_spec"
    
    print_step "Deleting: $name"
    
    # Check if variable exists
    if gh variable list -R "$repo" 2>/dev/null | grep -q "^$name"; then
      if delete_variable "$repo" "$name"; then
        print_success "Deleted variable: $name"
        ((success_count++))
      else
        print_error "Failed to delete variable: $name"
        ((fail_count++))
      fi
    else
      print_info "Variable not found: $name"
      ((not_found_count++))
    fi
    echo ""
  done
  
  print_header "Rollback Summary"
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN COMPLETE${NC}"
  else
    echo -e "${GREEN}Successfully deleted: $success_count${NC}"
    echo -e "${GRAY}Not found: $not_found_count${NC}"
    echo -e "${RED}Failed: $fail_count${NC}"
    echo ""
    
    if [ $success_count -gt 0 ]; then
      print_success "Rollback completed!"
      echo ""
      echo -e "${BOLD}Note:${NC} You may need to:"
      echo "  - Restore workflow files from backup"
      echo "  - Re-add values to secrets if needed"
    fi
  fi
}

# ====================================================================
# Main Execution
# ====================================================================

main() {
  print_header "GitHub Secrets to Variables Migration"
  
  # Pre-flight checks
  print_step "Running pre-flight checks..."
  check_gh_cli
  check_gh_auth
  
  local repo=$(get_repo)
  print_success "Repository: $repo"
  echo ""
  
  if [ "$ROLLBACK" = true ]; then
    perform_rollback "$repo"
  else
    list_migration_plan
    perform_migration "$repo"
  fi
}

# Run main function
main
