require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const CryptoJS = require('crypto-js');
const cors = require('cors');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error('FATAL: ENCRYPTION_KEY environment variable is not set.');
  process.exit(1);
}

async function scrapeUrl(queryParams) {
  const { url, clickSelector, origin: customOrigin, referer, iframe, screenshot, waitFor, waitForDomain } = queryParams;

  if (!url) {
    const err = new Error('Please provide a URL parameter.');
    err.statusCode = 400;
    throw err;
  }

  console.log(`Scraping url: ${url}`);
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
      // Let Puppeteer download Chromium automatically
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
      const blockedResourceTypes = ['image', 'stylesheet', 'font', 'media'];
      const blockedDomains = [
        'google-analytics.com',
        'googletagmanager.com',
        'facebook.net',
        'twitter.com',
        'linkedin.com',
        'doubleclick.net',
        'youtube.com',
      ];

      if (blockedResourceTypes.includes(resourceType) || blockedDomains.some(d => requestUrl.includes(d))) {
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
      const iframeElement = await page.waitForSelector('iframe', { timeout: 5000 });
      pageOrFrame = await iframeElement.contentFrame();

      // Wait for network idle safely
      try {
        await pageOrFrame.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        console.log('Iframe network idle timeout, continuing...');
      }
    } else {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (e) {
        console.log('Page.goto failed or timed out, continuing...');
      }
    }

    if (clickSelector) {
      try {
        const el = await pageOrFrame.waitForSelector(clickSelector, { timeout: 5000 });
        if (el) await el.click();
        console.log(`Clicked element: ${clickSelector}`);
      } catch {
        console.log(`Could not find or click element: ${clickSelector}`);
      }
    }

    if (waitFor) {
      try {
        await page.waitForRequest(r => r.url().endsWith(waitFor), { timeout: 15000 });
        console.log(`Found request ending with: ${waitFor}`);
      } catch {
        console.log(`Did not find request ending with: ${waitFor}`);
      }
    } else if (waitForDomain) {
      try {
        await page.waitForRequest(r => r.url().includes(waitForDomain), { timeout: 15000 });
        console.log(`Found request from domain: ${waitForDomain}`);
      } catch {
        console.log(`Did not find request from domain: ${waitForDomain}`);
      }
    } else {
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch {
        console.log('Final network idle wait timed out, continuing...');
      }
    }

    let screenshotBase64 = null;
    if (screenshot === 'true') {
      screenshotBase64 = await page.screenshot({ encoding: 'base64' });
    }

    return { message: `Successfully scraped ${url}`, requests, screenshot: screenshotBase64 };

  } finally {
    if (browser) await browser.close();
  }
}

app.get('/api/scrape', async (req, res) => {
  try {
    const responseData = await scrapeUrl(req.query);
    const encryptedResponse = CryptoJS.AES.encrypt(JSON.stringify(responseData), ENCRYPTION_KEY).toString();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ data: encryptedResponse });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).send(error.message || 'An error occurred while scraping the page.');
  }
});

app.get('/api/scrape/secret', async (req, res) => {
  try {
    const responseData = await scrapeUrl(req.query);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(responseData);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).send(error.message || 'An error occurred while scraping the page.');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
