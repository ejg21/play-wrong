const MAX_CONCURRENT_REQUESTS = 5;
const queue = [];
let activeRequests = 0;

function canProcess() {
  return activeRequests < MAX_CONCURRENT_REQUESTS;
}

function addToQueue(job) {
  queue.push(job);
  console.log(`Job added to queue. Queue size: ${queue.length}`);
}

function getFromQueue() {
  if (queue.length === 0) {
    return null;
  }
  return queue.shift();
}

function startProcessing(processJob) {
  if (queue.length > 0 && canProcess()) {
    const job = getFromQueue();
    if (job) {
      activeRequests++;
      console.log(`Processing job. Active requests: ${activeRequests}`);
      processJob(job).finally(() => {
        activeRequests--;
        console.log(`Finished processing job. Active requests: ${activeRequests}`);
        startProcessing(processJob);
      });
    }
  }
}

module.exports = {
  addToQueue,
  startProcessing,
};