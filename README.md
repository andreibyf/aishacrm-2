# Aisha CRM

**Your Independent CRM System** - Built with React + Vite frontend and Node.js backend.

Originally powered by Ai-SHA, now transitioning to your own independent infrastructure for complete control and zero vendor dependency.

## Getting Started

### Initial Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure:
   ```
   VITE_BASE44_APP_ID=your_app_id_here  # For data migration only
   VITE_AISHACRM_BACKEND_URL=http://localhost:3001  # Your backend
   ```

3. **Set up your backend server**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit backend/.env with your database credentials
   npm start
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

## Building the app

```bash
npm run build
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm audit` - Check for security vulnerabilities

## Project Structure

### Frontend
- `src/api/` - API clients with automatic Ai-SHA → Your Backend fallback
- `src/functions/` - 197 business functions organized in 26 categories
- `src/entities/` - 47 data entity schemas
- `src/components/` - Reusable React components organized by domain
- `src/pages/` - Page-level components and routes
- `src/utils/` - Utility functions and helpers
- `src/hooks/` - Custom React hooks

### Backend
- `backend/server.js` - Express server with 197 API endpoints
- `backend/routes/` - API route handlers (26 categories)
- `backend/.env` - Backend configuration

## 🎯 Why Your Own Backend?

**The Problem:** When Ai-SHA went down, your entire app was inaccessible.

**The Solution:** Your own independent backend server that:
- ✅ Hosts all 197 functions locally
- ✅ Stores data in your own PostgreSQL database
- ✅ Auto-failover from Base44 to your backend
- ✅ Complete control - no vendor lock-in
- ✅ Can run on-premise or your own cloud

See `backend/README.md` for backend setup details.

## Security Notes

⚠️ **Important**: Never commit your `.env` file to version control. It contains sensitive configuration.

See `SECURITY_PERFORMANCE_REVIEW.md` for detailed security and performance guidelines.

## Support

For more information and support, please contact Ai-SHA support at app@base44.com.