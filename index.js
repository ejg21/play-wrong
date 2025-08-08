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

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

app.get('/api/scrape', async (req, res) => {
  const { url, filter, clickSelector, origin: customOrigin, referer, iframe, screenshot, waitFor } = req.query;

  const cacheKey = req.originalUrl;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT,
        timestamp INTEGER
      );
    `);
    const rs = await db.execute({
      sql: "SELECT value, timestamp FROM cache WHERE key = ? AND timestamp > ?",
      args: [cacheKey, Date.now() - 86400 * 1000],
    });

    if (rs.rows.length > 0) {
      console.log(`Returning cached response for: ${url}`);
      return res.status(200).json(JSON.parse(rs.rows[0].value));
    }
  } catch (err) {
    console.error('Turso GET error:', err);
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

      requests.push({
        url: requestUrl,
        method: request.method(),
        headers: request.headers(),
      });
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

    const responseData = {
      message: `Successfully scraped ${url}`,
      requests,
      screenshot: screenshotBase64,
    };

    try {
      await db.execute({
        sql: "INSERT OR REPLACE INTO cache (key, value, timestamp) VALUES (?, ?, ?)",
        args: [cacheKey, JSON.stringify(responseData), Date.now()],
      });
    } catch (err) {
      console.error('Turso SET error:', err);
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).send(`An error occurred while scraping the page: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});