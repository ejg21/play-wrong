# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package.json ./

# Install app dependencies
RUN npm install

# Install Playwright browsers and dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/src/app/pw-browsers
RUN npx playwright install --with-deps

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD [ "node", "index.js" ]