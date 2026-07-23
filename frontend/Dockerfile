FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Serve with nginx ----
FROM nginx:1.25-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Proxy API calls to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
