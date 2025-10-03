# Use an official Node.js runtime as a parent image
FROM node:18-slim AS builder

# Set the working directory in the container
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package-lock.json ./
RUN npm cache clean --force && npm install --no-optional

# Copy app source
COPY . .

# Install Puppeteer Chromium
RUN npx puppeteer install chromium

# New stage for the final image
FROM node:18-slim

WORKDIR /usr/src/app

# Copy dependencies and source from the builder stage
COPY --from=builder /usr/src/app /usr/src/app

# Expose port
EXPOSE 3000

# Start the app
CMD [ "node", "index.js" ]
