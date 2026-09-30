FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Use the npm client bundled with Node to avoid an extra network fetch during Docker builds.
RUN npm ci --no-audit --no-fund

COPY . .

# Face recognition runs locally in the user's browser. Pin the upstream
# face-api.js runtime/models at build time, then serve them from our own
# frontend so production check-in makes no third-party API/runtime request.
ARG FACE_API_COMMIT=a86f011d72124e5fb93e59d5c4ab98f699dd5c9c
ENV FACE_API_COMMIT=$FACE_API_COMMIT
RUN node scripts/fetch-biometrics-assets.mjs

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
