# Base Image
FROM node:20-alpine

#Set working dir
WORKDIR /app

# Copy package files 
COPY package*.json ./

RUN npm ci --only=production

# ── App Source 
# Copy all source folders
COPY src/ ./src/
COPY public/ ./public/
COPY server.js ./

# ── Config 
EXPOSE 8080

# Start server
CMD ["node", "server.js"]