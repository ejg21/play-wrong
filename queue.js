const queue = [];
const MAX_CONCURRENT_REQUESTS = 5; // Example value, can be configured

const addJob = (job) => {
  queue.push(job);
};

const getJob = () => {
  if (queue.length > 0) {
    return queue.shift();
  }
  return null;
};

const getQueueSize = () => {
  return queue.length;
};

module.exports = {
  addJob,
  getJob,
  getQueueSize,
  MAX_CONCURRENT_REQUESTS
};