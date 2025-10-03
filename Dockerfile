# Use an official Node.js runtime as a parent image
FROM node:18-slim AS builder

# Set the working directory in the container
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package-lock.json ./
RUN npm cache clean --force && npm install --no-optional

# Copy app source
COPY . .

# New stage for the final image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install Chromium and clean up apt-get cache
RUN apt-get update && \
    apt-get install -y chromium --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy dependencies and source from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app ./

# Expose port
EXPOSE 3000

# Start the app
CMD [ "node", "index.js" ]
