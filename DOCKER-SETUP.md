# Supabase Local Docker - README

## 🚀 Quick Start

Your local Supabase environment is now running!

### Services Running:
- **PostgreSQL**: `localhost:5432`
- **Supabase API**: `localhost:8000`

### Credentials:
- **Username**: `postgres`
- **Password**: `postgres`
- **Database**: `postgres`

### Connection String:
```
postgresql://postgres:postgres@localhost:5432/postgres
```

## 📋 Docker Commands

### Start containers:
```powershell
docker-compose up -d
```

### Stop containers:
```powershell
docker-compose down
```

### View logs:
```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f db
docker-compose logs -f supabase
```

### Connect to PostgreSQL:
```powershell
docker exec -it ai-sha-crm-copy-c872be53-db-1 psql -U postgres
```

### Run sanity check:
```powershell
.\sanity-check.ps1
```

## 🔧 Database Management

### Access pgAdmin or other tools:
- **Host**: `localhost`
- **Port**: `5432`
- **User**: `postgres`
- **Password**: `postgres`
- **Database**: `postgres`

### Run SQL directly:
```powershell
docker exec ai-sha-crm-copy-c872be53-db-1 psql -U postgres -c "YOUR SQL HERE"
```

## 📊 Applying Your Schema

If you have migration files, you can apply them:

```powershell
# Example: Apply a SQL file
docker exec -i ai-sha-crm-copy-c872be53-db-1 psql -U postgres < your-schema.sql
```

## 🧹 Clean Up

### Remove containers and volumes:
```powershell
docker-compose down -v
```

### Remove only containers (keep data):
```powershell
docker-compose down
```

## ⚠️ Important Notes

1. **Data Persistence**: Database data is stored in the `postgres_data` Docker volume
2. **Port Conflicts**: Ensure ports 5432 and 8000 are not in use by other services
3. **Production Warning**: This is for LOCAL DEVELOPMENT ONLY - never use in production

## 🔍 Troubleshooting

### Container won't start:
```powershell
# Check logs
docker-compose logs

# Restart containers
docker-compose restart
```

### Connection refused:
```powershell
# Verify containers are running
docker-compose ps

# Check if ports are accessible
netstat -ano | findstr ":5432"
netstat -ano | findstr ":8000"
```

### Reset everything:
```powershell
# Stop and remove everything
docker-compose down -v

# Start fresh
docker-compose up -d
```

## 🔗 Next Steps

1. Update your `.env.local` with local connection string
2. Apply your database migrations
3. Run your application pointing to `localhost:5432`
4. Use the sanity check script to verify setup: `.\sanity-check.ps1`

---

**Status**: ✅ All checks passed! Local Supabase is ready to use.
