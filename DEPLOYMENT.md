# Deploying the Scraping Service on a VPS

This guide will walk you through deploying the web scraping service on a Virtual Private Server (VPS).

## 1. Prerequisites

- A VPS running a recent version of Debian or Ubuntu.
- `git` installed on your VPS.
- `node` (v18 or higher) and `npm` installed on your VPS.
- `docker` and `docker-compose` installed on your VPS.

## 2. Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run with Docker:**
    The provided `Dockerfile` is the recommended way to run this application. It handles all the necessary system dependencies for Chromium.

    Build the Docker image:
    ```bash
    docker build -t scraper-app .
    ```

    Run the Docker container:
    ```bash
    docker run -p 3000:3000 scraper-app
    ```

4.  **Run directly with Node.js (not recommended for production):**
    If you choose not to use Docker, you will need to install the dependencies for Chromium manually. The `Dockerfile` lists all the required packages.

    ```bash
    # Example for Debian/Ubuntu:
    sudo apt-get update && sudo apt-get install -y \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        # ... and all other packages from the Dockerfile
    
    npm start
    ```

## 3. Configuration

You can configure the maximum number of concurrent requests by changing the `MAX_CONCURRENT_REQUESTS` variable in `queue.js`.

The application now uses an internal queue to manage scraping jobs. When a request is made to the `/api/scrape` endpoint, the job is added to the queue and a `202 Accepted` response is returned. A pool of workers processes the jobs from the queue concurrently.
