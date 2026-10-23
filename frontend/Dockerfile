FROM node:22-alpine AS build

WORKDIR /app

# Accept Sentry DSN as build argument (optional)
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Build tools untuk dependensi native (mis. sharp) bila prebuilt musl untuk
# Node 22 tak tersedia. Stage build ini dibuang — image akhir tetap nginx:alpine.
COPY package.json package-lock.json* .npmrc* ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && (if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi) \
 && apk del .build-deps

COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
