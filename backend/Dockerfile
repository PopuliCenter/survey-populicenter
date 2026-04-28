FROM node:20-alpine

WORKDIR /app

# Install dependencies (include devDependencies for sequelize-cli migrations)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY .sequelizerc ./
COPY uploads/ ./uploads/

# Create uploads directories
RUN mkdir -p uploads/photos uploads/audio uploads/signatures uploads/exports

EXPOSE 3000

CMD ["node", "src/app.js"]
