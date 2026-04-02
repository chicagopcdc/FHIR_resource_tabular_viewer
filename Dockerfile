# --- Stage 1: Base (shared dependencies) ---
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .

# --- Stage 2: Development (Vite HMR) ---
FROM base AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Stage 3: Build ---
FROM base AS build
RUN npm run build

# --- Stage 4: Production (serve static files) ---
FROM node:24-alpine AS prod
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]