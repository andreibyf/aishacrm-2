#!/usr/bin/env sh
set -e

# Create a runtime env.js in the served dist directory using container env vars
# Only includes non-secret, public variables intended for the frontend
: "${PORT:=3000}"

cat > /app/dist/env.js << EOF
window.__ENV = {
  VITE_SUPABASE_URL: '${VITE_SUPABASE_URL}',
  VITE_SUPABASE_PUBLISHABLE_KEY: '${VITE_SUPABASE_PUBLISHABLE_KEY}',
  VITE_SUPABASE_PUBLIC_KEY: '${VITE_SUPABASE_PUBLIC_KEY}',
  VITE_SUPABASE_PUBLIC_ANON_KEY: '${VITE_SUPABASE_PUBLIC_ANON_KEY}',
  VITE_SUPABASE_PK: '${VITE_SUPABASE_PK}',
  VITE_SUPABASE_ANON_KEY: '${VITE_SUPABASE_ANON_KEY}',
  VITE_AISHACRM_BACKEND_URL: '${VITE_AISHACRM_BACKEND_URL}',
  VITE_CURRENT_BRANCH: '${VITE_CURRENT_BRANCH:-main}'
};
EOF

# Inject env.js script tag into index.html (before the closing </head> tag)
# This ensures env.js loads before the Vite bundle without interfering with Vite's build process
sed -i 's|</head>|  <script src="/env.js"></script>\n  </head>|' /app/dist/index.html

# Start static server
exec sh -c "serve -s dist -l ${PORT}"
