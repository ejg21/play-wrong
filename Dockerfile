# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates

# Copy package.json and package-lock.json
COPY package.json ./

# Set Puppeteer cache directory
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer

# Install app dependencies
RUN npm install
RUN npx puppeteer browsers install chrome
RUN ls -la $PUPPETEER_CACHE_DIR

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD [ "node", "index.js" ]