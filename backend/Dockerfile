FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code
COPY src/ ./src/
COPY .sequelizerc ./
COPY uploads/ ./uploads/

# Create uploads directories
RUN mkdir -p uploads/photos uploads/audio uploads/signatures uploads/exports

EXPOSE 3000

CMD ["node", "src/app.js"]
