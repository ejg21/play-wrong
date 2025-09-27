# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install Chromium
RUN apt-get update && apt-get install -y chromium --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set env to skip Puppeteer's browser download
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install app dependencies
RUN npm cache clean --force && npm install --no-optional && npm install pm2 -g

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD [ "pm2-runtime", "start", "index.js", "--name", "scraper" ]