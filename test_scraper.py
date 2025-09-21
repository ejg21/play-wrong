import requests
import time
import threading
import json

BASE_URL = "http://localhost:3000"
URL_TO_SCRAPE = "https://www.google.com/search?q=puppeteer"  # Example URL

def scrape(url):
    print(f"Requesting scrape for {url}")
    response = requests.get(f"{BASE_URL}/api/scrape", params={"url": url})
    if response.status_code == 202:
        job_info = response.json()
        print(f"Job queued: {job_info['jobId']}")
        poll_status(job_info['status_endpoint'])
    else:
        print(f"Error queuing job: {response.text}")

def poll_status(status_endpoint):
    while True:
        print(f"Polling {status_endpoint}")
        response = requests.get(f"{BASE_URL}{status_endpoint}")
        if response.status_code == 200:
            print("Job completed:")
            try:
                print(json.dumps(response.json(), indent=2))
            except json.JSONDecodeError:
                print(response.text)
            break
        elif response.status_code == 500:
            print(f"Job failed: {response.text}")
            break
        elif response.status_code != 202:
            print(f"Unexpected status code: {response.status_code}")
            break
        
        time.sleep(5)

if __name__ == "__main__":
    threads = []
    for i in range(10):  # Number of concurrent requests
        thread = threading.Thread(target=scrape, args=(f"{URL_TO_SCRAPE}&page={i}",))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    print("All scraping requests have been processed.")