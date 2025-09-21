const express = require('express');
const { addJob, getJob, getQueueSize, MAX_CONCURRENT_REQUESTS } = require('./queue');
const { processJob } = require('./worker');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

let activeWorkers = 0;
const jobResults = {};

const startWorker = () => {
  if (activeWorkers < MAX_CONCURRENT_REQUESTS) {
    const job = getJob();
    if (job) {
      activeWorkers++;
      console.log(`Starting job ${job.jobId}. Active workers: ${activeWorkers}. Queue size: ${getQueueSize()}`);
      processJob(job).then(result => {
        jobResults[job.jobId] = { status: 'completed', result };
      }).catch(error => {
        jobResults[job.jobId] = { status: 'failed', error: error.message };
      }).finally(() => {
        activeWorkers--;
        console.log(`Finished job ${job.jobId}. Active workers: ${activeWorkers}. Queue size: ${getQueueSize()}`);
        startWorker(); // Check for next job
      });
      startWorker(); // Try to start another worker immediately
    }
  }
};

app.get('/api/scrape', async (req, res) => {
  const { url, filter, clickSelector, origin: customOrigin, referer, iframe, screenshot, waitFor } = req.query;

  if (!url) {
    return res.status(400).send('Please provide a URL parameter.');
  }

  const jobId = uuidv4();
  const job = { url, filter, clickSelector, origin: customOrigin, referer, iframe, screenshot, waitFor, jobId };
  
  addJob(job);
  jobResults[jobId] = { status: 'queued' };
  console.log(`Job ${jobId} added to queue. Queue size: ${getQueueSize()}`);
  
  res.status(202).json({
    message: `Scraping job ${jobId} has been queued.`,
    jobId,
    queuePosition: getQueueSize(),
    status_endpoint: `/api/scrape/status/${jobId}`
  });

  startWorker();
});

app.get('/api/scrape/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const result = jobResults[jobId];

    if (!result) {
        return res.status(404).json({ message: 'Job not found.' });
    }

    if (result.status === 'completed') {
        res.status(200).json(result.result);
        delete jobResults[jobId]; // Clean up after retrieval
    } else if (result.status === 'failed') {
        res.status(500).json({ message: 'Job failed.', error: result.error });
        delete jobResults[jobId]; // Clean up after retrieval
    } else {
        res.status(202).json({ message: 'Job is still being processed.', status: result.status });
    }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  // Start initial workers
  for (let i = 0; i < MAX_CONCURRENT_REQUESTS; i++) {
    startWorker();
  }
});