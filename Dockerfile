# syntax=docker/dockerfile:1

# --- dev: Vite dev server with hot reload ---
FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# --- build: produce static assets ---
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Fail closed before npm ci / npm run build when public args are absent or loopback.
# Full URL/key-shape validation still runs in vite build via deploymentConfig.ts.
# Error messages name variables only — never values.
RUN node -e "\
const required=['VITE_API_BASE_URL','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'];\
for (const name of required) {\
  if (!String(process.env[name]||'').trim()) {\
    console.error('Production Docker build is missing a required public environment variable.');\
    process.exit(1);\
  }\
}\
for (const name of ['VITE_API_BASE_URL','VITE_SUPABASE_URL']) {\
  const value=String(process.env[name]||'').trim().toLowerCase();\
  if (!value.startsWith('https://') || value.includes('localhost') || value.includes('127.0.0.1')) {\
    console.error(name + ' must be a public HTTPS URL for production Docker builds.');\
    process.exit(1);\
  }\
}\
"

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- prod: serve the built SPA with nginx ---
FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
