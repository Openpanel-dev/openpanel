import time
import requests
from typing import Dict, Any, Optional

class ApiConfig:
    def __init__(self, base_url: str, default_headers: Optional[Dict[str, str]] = None, max_retries: int = 3, initial_retry_delay: int = 500):
        self.base_url = base_url
        self.default_headers = default_headers or {}
        self.max_retries = max_retries
        self.initial_retry_delay = initial_retry_delay

class Api:
    def __init__(self, config: ApiConfig):
        self.base_url = config.base_url
        self.headers = {
            'Content-Type': 'application/json',
            **config.default_headers
        }
        self.max_retries = config.max_retries
        self.initial_retry_delay = config.initial_retry_delay

    def add_header(self, key: str, value: str):
        self.headers[key] = value

    def _post(self, url: str, data: Dict[str, Any], options: Dict[str, Any], attempt: int = 0) -> Optional[Dict[str, Any]]:
        try:
            response = requests.post(url, headers=self.headers, json=data, **options)

            if response.status_code == 401:
                return None

            if response.status_code != 200 and response.status_code != 202:
                raise Exception(f"HTTP error! status: {response.status_code}")

            return response.json() if response.text else None

        except Exception as error:
            if attempt < self.max_retries:
                delay = self.initial_retry_delay * 2**attempt
                time.sleep(delay)
                return self._post(url, data, options, attempt + 1)
            print('Max retries reached:', error)
            return None

    def fetch(self, path: str, data: Dict[str, Any], options: Dict[str, Any] = {}) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}{path}"
        return self._post(url, data, options)