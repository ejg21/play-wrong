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
  const { url, filter, clickSelector, origin: customOrigin, referer, iframe, screenshot, waitFor, waitForDomain } = queryParams;

  console.log(`Scraping url: ${url}`);

  if (!url) {
    const err = new Error('Please provide a URL parameter.');
    err.statusCode = 400;
    throw err;
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
      executablePath: '/usr/bin/chromium',
      headless: true,
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

      if (blockedResourceTypes.includes(resourceType) || blockedDomains.some(domain => requestUrl.includes(domain))) {
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
      // Wait for network idle to ensure all dynamic content is loaded
      await pageOrFrame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {
        console.log('waitForNavigation timed out, continuing execution.');
      });
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
        console.log(`Waiting for request ending with: ${waitFor}`);
        await page.waitForRequest(
          (request) => request.url().endsWith(waitFor),
          { timeout: 15000 }
        );
        console.log(`Found request ending with: ${waitFor}`);
      } catch (e) {
        console.log(`Did not find request ending with "${waitFor}" within the timeout.`);
      }
    } else if (waitForDomain) {
      try {
        console.log(`Waiting for request from domain: ${waitForDomain}`);
        await page.waitForRequest(
          (request) => request.url().includes(waitForDomain),
          { timeout: 15000 }
        );
        console.log(`Found request from domain: ${waitForDomain}`);
      } catch (e) {
        console.log(`Did not find request from domain "${waitForDomain}" within the timeout.`);
      }
    } else {
      // Wait for network idle to ensure all dynamic content is loaded
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {
        console.log('waitForNavigation timed out, continuing execution.');
      });
    }

    let screenshotBase64 = null;
    if (screenshot === 'true') {
      const screenshotBuffer = await page.screenshot({ encoding: 'base64' });
      screenshotBase64 = screenshotBuffer.toString('base64');
    }

    return {
      message: `Successfully scraped ${url}`,
      requests,
      screenshot: screenshotBase64,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
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