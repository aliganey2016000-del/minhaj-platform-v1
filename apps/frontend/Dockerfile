FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Use the npm client bundled with Node to avoid an extra network fetch during Docker builds.
RUN npm ci --no-audit --no-fund

COPY . .

# Frontend prebuild pins and downloads the self-hosted face runtime/models.
# No face API or third-party network call is required from the production browser.
ARG FACE_API_COMMIT=a86f011d72124e5fb93e59d5c4ab98f699dd5c9c
ENV FACE_API_COMMIT=$FACE_API_COMMIT

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.inc /etc/nginx/security-headers.inc
COPY docker-entrypoint.d/40-tenant-proxy-secret.sh /docker-entrypoint.d/40-tenant-proxy-secret.sh
RUN chmod +x /docker-entrypoint.d/40-tenant-proxy-secret.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
