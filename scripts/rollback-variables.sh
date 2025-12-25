#!/bin/bash

# ====================================================================
# GitHub Variables Rollback Script
# ====================================================================
# 
# Rolls back the migration from GitHub Secrets to Variables by:
# 1. Deleting created GitHub Variables
# 2. Optionally restoring workflow files from backup
#
# Usage:
#   ./scripts/rollback-variables.sh                    # Interactive mode
#   ./scripts/rollback-variables.sh --dry-run          # Preview changes
#   ./scripts/rollback-variables.sh --yes              # Non-interactive
#   ./scripts/rollback-variables.sh --restore-workflows # Also restore workflow files
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
RESTORE_WORKFLOWS=false
REPO=""
BACKUP_DIR=".github/workflows-backup"

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
    --restore-workflows)
      RESTORE_WORKFLOWS=true
      shift
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --help|-h)
      cat << EOF
${CYAN}${BOLD}GitHub Variables Rollback Script${NC}

${YELLOW}Usage:${NC}
  $0 [options]

${YELLOW}Options:${NC}
  --dry-run              Preview changes without making them
  --yes, -y              Skip confirmation prompts
  --restore-workflows    Restore workflow files from backup
  --repo OWNER/REPO      Specify repository (default: auto-detect)
  --backup-dir PATH      Backup directory path (default: .github/workflows-backup)
  --help, -h             Show this help message

${YELLOW}Examples:${NC}
  # Preview rollback
  $0 --dry-run

  # Delete variables only
  $0

  # Delete variables and restore workflows
  $0 --restore-workflows

  # Non-interactive rollback
  $0 --yes --restore-workflows

${YELLOW}What this does:${NC}
  1. Deletes GitHub Variables created during migration
  2. Optionally restores workflow files from backup
  3. Validates rollback completion

${YELLOW}Variables to Delete:${NC}
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
  - VITE_AISHACRM_BACKEND_URL
  - SUPABASE_URL
  - TENANT_ID

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
    if git remote get-url origin &> /dev/null; then
      local remote_url=$(git remote get-url origin)
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
# Rollback Configuration
# ====================================================================

# Variables to delete
declare -a VARIABLES=(
  "VITE_SUPABASE_URL"
  "VITE_SUPABASE_ANON_KEY"
  "VITE_AISHACRM_BACKEND_URL"
  "SUPABASE_URL"
  "TENANT_ID"
)

# Workflow files to restore
declare -a WORKFLOW_FILES=(
  "docker-release.yml"
  "backend-tests.yml"
  "mcp-audit-test.yml"
  "e2e.yml"
  "secrets-audit.yml"
)

# ====================================================================
# Main Functions
# ====================================================================

delete_variables() {
  local repo="$1"
  
  print_header "Deleting GitHub Variables"
  
  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN MODE - No changes will be made"
    echo ""
  fi
  
  echo -e "${BOLD}Repository:${NC} $repo"
  echo ""
  
  local success_count=0
  local fail_count=0
  local not_found_count=0
  
  for var_name in "${VARIABLES[@]}"; do
    print_step "Processing: $var_name"
    
    # Check if variable exists
    if gh variable list -R "$repo" 2>/dev/null | grep -q "^$var_name"; then
      if [ "$DRY_RUN" = false ]; then
        if gh variable delete "$var_name" -R "$repo" 2>&1; then
          print_success "Deleted: $var_name"
          ((success_count++))
        else
          print_error "Failed to delete: $var_name"
          ((fail_count++))
        fi
      else
        print_info "[DRY RUN] Would delete: $var_name"
      fi
    else
      print_info "Not found: $var_name"
      ((not_found_count++))
    fi
    echo ""
  done
  
  return $((fail_count > 0 ? 1 : 0))
}

restore_workflows() {
  print_header "Restoring Workflow Files"
  
  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN MODE - No changes will be made"
    echo ""
  fi
  
  if [ ! -d "$BACKUP_DIR" ]; then
    print_warning "Backup directory not found: $BACKUP_DIR"
    echo ""
    echo "Workflow files were not backed up automatically."
    echo "You'll need to manually restore them from git history:"
    echo ""
    echo "  git log --oneline .github/workflows/"
    echo "  git checkout <commit> -- .github/workflows/"
    echo ""
    return 1
  fi
  
  local success_count=0
  local fail_count=0
  
  for workflow in "${WORKFLOW_FILES[@]}"; do
    local backup_file="$BACKUP_DIR/$workflow"
    local target_file=".github/workflows/$workflow"
    
    print_step "Processing: $workflow"
    
    if [ ! -f "$backup_file" ]; then
      print_warning "Backup not found: $workflow"
      ((fail_count++))
      echo ""
      continue
    fi
    
    if [ "$DRY_RUN" = false ]; then
      if cp "$backup_file" "$target_file"; then
        print_success "Restored: $workflow"
        ((success_count++))
      else
        print_error "Failed to restore: $workflow"
        ((fail_count++))
      fi
    else
      print_info "[DRY RUN] Would restore: $workflow"
    fi
    echo ""
  done
  
  if [ "$DRY_RUN" = false ] && [ $success_count -gt 0 ]; then
    print_info "Restored $success_count workflow file(s)"
    echo ""
    echo -e "${YELLOW}Remember to commit the restored files:${NC}"
    echo "  git add .github/workflows/"
    echo "  git commit -m 'Rollback: Restore workflow files to use secrets'"
  fi
  
  return $((fail_count > 0 ? 1 : 0))
}

validate_rollback() {
  local repo="$1"
  
  print_header "Validating Rollback"
  
  local all_clear=true
  
  # Check that variables are deleted
  print_step "Checking variables..."
  
  for var_name in "${VARIABLES[@]}"; do
    if gh variable list -R "$repo" 2>/dev/null | grep -q "^$var_name"; then
      print_warning "Variable still exists: $var_name"
      all_clear=false
    fi
  done
  
  if [ "$all_clear" = true ]; then
    print_success "All variables have been deleted"
  fi
  
  echo ""
  
  # Check workflow files if restored
  if [ "$RESTORE_WORKFLOWS" = true ]; then
    print_step "Checking workflow files..."
    
    local vars_still_referenced=false
    for workflow in "${WORKFLOW_FILES[@]}"; do
      if grep -q "vars\." ".github/workflows/$workflow" 2>/dev/null; then
        print_warning "Workflow still references vars.*: $workflow"
        vars_still_referenced=true
      fi
    done
    
    if [ "$vars_still_referenced" = false ]; then
      print_success "No workflow files reference vars.*"
    fi
    
    echo ""
  fi
  
  if [ "$all_clear" = true ]; then
    print_success "Rollback validation passed!"
  else
    print_warning "Some issues detected during validation"
  fi
}

# ====================================================================
# Main Execution
# ====================================================================

main() {
  print_header "GitHub Variables Rollback"
  
  # Pre-flight checks
  print_step "Running pre-flight checks..."
  check_gh_cli
  check_gh_auth
  
  local repo=$(get_repo)
  print_success "Repository: $repo"
  echo ""
  
  # Show what will be done
  echo -e "${BOLD}Rollback Plan:${NC}"
  echo "  1. Delete ${#VARIABLES[@]} GitHub Variables"
  if [ "$RESTORE_WORKFLOWS" = true ]; then
    echo "  2. Restore ${#WORKFLOW_FILES[@]} workflow files from backup"
  fi
  echo ""
  
  if [ "$DRY_RUN" = false ]; then
    print_warning "This action cannot be undone!"
    if ! confirm "Do you want to continue?" "n"; then
      echo "Rollback cancelled"
      exit 0
    fi
    echo ""
  fi
  
  # Execute rollback
  local exit_code=0
  
  if ! delete_variables "$repo"; then
    exit_code=1
  fi
  
  if [ "$RESTORE_WORKFLOWS" = true ]; then
    if ! restore_workflows; then
      exit_code=1
    fi
  fi
  
  # Validate
  if [ "$DRY_RUN" = false ]; then
    validate_rollback "$repo"
  fi
  
  # Summary
  print_header "Rollback Complete"
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN COMPLETE${NC}"
    echo ""
    echo "No changes were made. Run without --dry-run to execute rollback."
  else
    if [ $exit_code -eq 0 ]; then
      print_success "Rollback completed successfully!"
      echo ""
      echo -e "${BOLD}Next steps:${NC}"
      echo "  1. Verify workflows are using secrets.* instead of vars.*"
      echo "  2. Ensure secrets are still configured in GitHub"
      echo "  3. Test workflows to confirm they work"
    else
      print_warning "Rollback completed with some errors"
      echo ""
      echo "Review the output above for details."
    fi
  fi
  
  exit $exit_code
}

# Run main function
main
