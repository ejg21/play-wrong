const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const chromium = require('@sparticuz/chromium');
const { createClient } = require('@libsql/client');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const app = express();
const port = process.env.PORT || 3000;

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const createCacheTable = async () => {
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS scrape_cache (
        url TEXT PRIMARY KEY,
        data TEXT,
        screenshot TEXT,
        createdAt INTEGER
      );
    `);
    console.log('Cache table is ready.');
  } catch (error) {
    console.error('Failed to create cache table:', error);
  }
};

app.get('/api/scrape', async (req, res) => {
  const { url, filter, clickSelector, origin: customOrigin, referer, iframe, screenshot, waitFor } = req.query;

  if (!url) {
    return res.status(400).send('Please provide a URL parameter.');
  }

  try {
    const cacheResult = await turso.execute({
      sql: 'SELECT data, screenshot, createdAt FROM scrape_cache WHERE url = ?',
      args: [url],
    });

    if (cacheResult.rows.length > 0) {
      const row = cacheResult.rows;
      const cacheAge = Date.now() - row.createdAt;
      if (cacheAge < 3600000) { // 1 hour TTL
        console.log(`Returning cached response for ${url}`);
        return res.status(200).json({
          message: `Successfully returned cached scrape for ${url}`,
          requests: JSON.parse(row.data),
          screenshot: row.screenshot,
        });
      }
    }
  } catch (error) {
    console.error('Cache check failed:', error);
  }

  console.log(`Scraping url: ${url}`);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0');
    const headers = {
      'Accept-Language': 'en-US,en;q=0.5',
      'Sec-GPC': '1',
    };
    if (customOrigin) headers['Origin'] = customOrigin;
    if (referer) headers['Referer'] = referer;
    await page.setExtraHTTPHeaders(headers);

    let requests = [];
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const requestUrl = request.url();
      const blockedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.css', '.woff', '.woff2', '.ttf', '.otf'];
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font' || blockedExtensions.some(ext => requestUrl.endsWith(ext))) {
        request.abort();
        return;
      }
      if (requestUrl.includes('google-analytics') || requestUrl.includes('googletagmanager')) {
        request.abort();
        return;
      }
      requests.push({ url: requestUrl, method: request.method(), headers: request.headers() });
      request.continue();
    });

    let pageOrFrame = page;
    if (iframe === 'true') {
      await page.setContent(`<iframe src="${url}" style="width:100%; height:100vh;" frameBorder="0"></iframe>`);
      const iframeElement = await page.waitForSelector('iframe');
      pageOrFrame = await iframeElement.contentFrame();
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }

    if (clickSelector) {
      try {
        const element = await pageOrFrame.waitForSelector(clickSelector, { timeout: 5000 });
        if (element) {
          await element.click();
          console.log(`Clicked element with selector: ${clickSelector}`);
        }
      } catch (e) {
        console.log(`Could not find or click the element with selector "${clickSelector}".`);
      }
    }

    if (waitFor) {
      try {
        console.log(`Waiting for request containing: ${waitFor}`);
        await page.waitForRequest(request => request.url().includes(waitFor), { timeout: 15000 });
        console.log(`Found request: ${waitFor}`);
      } catch (e) {
        console.log(`Did not find request containing "${waitFor}" within the timeout.`);
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    let screenshotBase64 = null;
    if (screenshot === 'true') {
      const screenshotBuffer = await page.screenshot({ encoding: 'base64' });
      screenshotBase64 = screenshotBuffer.toString('base64');
    }

    try {
      await turso.execute({
        sql: 'INSERT INTO scrape_cache (url, data, screenshot, createdAt) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET data = excluded.data, screenshot = excluded.screenshot, createdAt = excluded.createdAt',
        args: [url, JSON.stringify(requests), screenshotBase64, Date.now()],
      });
    } catch (error) {
      console.error('Failed to cache result:', error);
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({
      message: `Successfully scraped ${url}`,
      requests,
      screenshot: screenshotBase64,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(`An error occurred while scraping the page: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

const startServer = async () => {
  await createCacheTable();
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};

startServer();