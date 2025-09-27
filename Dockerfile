# Use an official Node.js runtime as a parent image
FROM node:18-slim AS builder

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install app dependencies
RUN npm cache clean --force && npm install --no-optional


# ---


# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install Chromium and clean up apt-get cache
RUN apt-get update && \
    apt-get install -y chromium --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy app source and dependencies from builder
COPY --from=builder /usr/src/app .

# Expose port
EXPOSE 3000

# Start the app
CMD [ "node", "index.js" ]