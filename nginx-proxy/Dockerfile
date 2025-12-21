# Nginx Reverse Proxy for Aisha CRM
# Routes /api/* to backend, everything else to frontend

FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Custom error page
RUN echo '<!DOCTYPE html><html><head><title>Service Unavailable</title></head><body><h1>503 Service Temporarily Unavailable</h1><p>Please try again in a moment.</p></body></html>' > /usr/share/nginx/html/50x.html

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/nginx-health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
