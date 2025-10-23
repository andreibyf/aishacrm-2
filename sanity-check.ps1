# Supabase Local Docker - Sanity Check Script
# Run this to verify your local Supabase setup

Write-Host "🔍 Supabase Local Docker Sanity Check" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan

# 1. Check Docker containers
Write-Host "`n1️⃣  Checking Docker containers..." -ForegroundColor Yellow
docker-compose ps

# 2. Check PostgreSQL connection
Write-Host "`n2️⃣  Testing PostgreSQL connection..." -ForegroundColor Yellow
$pgTest = docker exec ai-sha-crm-copy-c872be53-db-1 psql -U postgres -c "SELECT 'PostgreSQL is running! ✓' as status;" -t 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL:" $pgTest.Trim() -ForegroundColor Green
} else {
    Write-Host "❌ PostgreSQL connection failed" -ForegroundColor Red
    exit 1
}

# 3. Check database
Write-Host "`n3️⃣  Checking database 'postgres'..." -ForegroundColor Yellow
$dbCheck = docker exec ai-sha-crm-copy-c872be53-db-1 psql -U postgres -c "\l" | Select-String "postgres"
if ($dbCheck) {
    Write-Host "✅ Database 'postgres' exists" -ForegroundColor Green
} else {
    Write-Host "❌ Database 'postgres' not found" -ForegroundColor Red
}

# 4. Check Supabase services
Write-Host "`n4️⃣  Checking Supabase services..." -ForegroundColor Yellow
$supabaseLogs = docker-compose logs supabase --tail 5 2>&1 | Out-String
if ($supabaseLogs -match "Connection successful") {
    Write-Host "✅ Supabase connected to PostgreSQL" -ForegroundColor Green
} else {
    Write-Host "⚠️  Supabase may still be initializing..." -ForegroundColor Yellow
}

# 5. Check ports
Write-Host "`n5️⃣  Checking exposed ports..." -ForegroundColor Yellow
$port5432 = netstat -ano | findstr ":5432" | Select-String "LISTENING"
$port8000 = netstat -ano | findstr ":8000" | Select-String "LISTENING"

if ($port5432) {
    Write-Host "✅ PostgreSQL port 5432 is open" -ForegroundColor Green
} else {
    Write-Host "❌ Port 5432 is not listening" -ForegroundColor Red
}

if ($port8000) {
    Write-Host "✅ Supabase port 8000 is open" -ForegroundColor Green
} else {
    Write-Host "❌ Port 8000 is not listening" -ForegroundColor Red
}

# 6. Summary
Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
Write-Host "📋 Summary" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host "PostgreSQL:  localhost:5432" -ForegroundColor White
Write-Host "Username:    postgres" -ForegroundColor White
Write-Host "Password:    postgres" -ForegroundColor White
Write-Host "Database:    postgres" -ForegroundColor White
Write-Host "Supabase:    http://localhost:8000" -ForegroundColor White
Write-Host "`n💡 Connection string:" -ForegroundColor Yellow
Write-Host "postgresql://postgres:postgres@localhost:5432/postgres" -ForegroundColor Green

Write-Host "`n🔧 Useful commands:" -ForegroundColor Cyan
Write-Host "  Stop:     docker-compose down" -ForegroundColor White
Write-Host "  Start:    docker-compose up -d" -ForegroundColor White
Write-Host "  Logs:     docker-compose logs -f" -ForegroundColor White
Write-Host "  Connect:  docker exec -it ai-sha-crm-copy-c872be53-db-1 psql -U postgres" -ForegroundColor White
Write-Host ""
