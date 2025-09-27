# ---- Base ----
FROM node:18-slim AS base

# Set the working directory in the container
WORKDIR /usr/src/app

# Install Chromium & clean up
RUN apt-get update && apt-get install -y chromium --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ---- Dependencies ----
FROM base AS dependencies

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install app dependencies
RUN npm install --no-optional && npm install pm2 -g

# ---- Release ----
FROM base AS release
WORKDIR /usr/src/app

# Copy dependencies
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=dependencies /usr/local/bin/pm2 /usr/local/bin/pm2
COPY --from=dependencies /usr/local/lib/node_modules/pm2 /usr/local/lib/node_modules/pm2


# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD [ "pm2-runtime", "start", "index.js", "--name", "scraper" ]