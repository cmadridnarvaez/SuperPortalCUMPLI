# ---- Build (SPA Superportal TitanTech) ----
FROM node:20-alpine AS build
WORKDIR /app
# URL de la app principal (para abrir /impersonate?token=... desde la consola)
ARG VITE_APP_URL=https://dev.cumplisign.com
ENV VITE_APP_URL=$VITE_APP_URL
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Serve (Nginx) ----
FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
