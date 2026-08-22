FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Use the npm client bundled with Node to avoid an extra network fetch during Docker builds.
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
