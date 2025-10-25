# Playwright E2E Test Setup Script
# Run this after npm install to set up Playwright browsers

Write-Host "Setting up Playwright E2E tests..." -ForegroundColor Cyan

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Install Playwright browsers
Write-Host "Installing Playwright browsers (Chromium, Firefox, WebKit)..." -ForegroundColor Yellow
npx playwright install

# Verify installation
Write-Host "`nVerifying Playwright installation..." -ForegroundColor Cyan
npx playwright --version

Write-Host "`n✅ Playwright E2E tests are ready!" -ForegroundColor Green
Write-Host "`nAvailable commands:" -ForegroundColor Cyan
Write-Host "  npm run test:e2e          - Run all tests (headless)"
Write-Host "  npm run test:e2e:ui       - Run tests with UI (interactive)"
Write-Host "  npm run test:e2e:debug    - Debug tests step-by-step"
Write-Host "  npm run test:e2e:report   - View last test report"
Write-Host "`nSee tests/e2e/README.md for full documentation" -ForegroundColor Gray
