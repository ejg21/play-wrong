const express = require('express');
const { addToQueue, startProcessing } = require('./queue');
const { processJob } = require('./worker');

const app = express();
const port = process.env.PORT || 3000;

app.get('/api/scrape', (req, res) => {
  const { url, filter, clickSelector, origin: customOrigin, referer, iframe, screenshot, waitFor } = req.query;

  if (!url) {
    return res.status(400).send('Please provide a URL parameter.');
  }

  const job = { url, filter, clickSelector, customOrigin, referer, iframe, screenshot, waitFor };
  addToQueue(job);
  startProcessing(processJob);

  res.status(202).send('Scraping job has been queued.');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});