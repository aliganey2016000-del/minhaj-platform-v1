FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Use the npm client bundled with Node to avoid an extra network fetch during Docker builds.
RUN npm ci --no-audit --no-fund

# The face runtime/models are pinned to one commit and self-hosted (no third-party call from the
# production browser). They are fetched in their own layer, before the source is copied, so a normal
# deploy reuses the cached layer instead of downloading ~10 files from GitHub again; the prebuild step
# then finds them and skips.
ARG FACE_API_COMMIT=a86f011d72124e5fb93e59d5c4ab98f699dd5c9c
ENV FACE_API_COMMIT=$FACE_API_COMMIT
COPY scripts/fetch-biometrics-assets.mjs ./scripts/
RUN node scripts/fetch-biometrics-assets.mjs

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
