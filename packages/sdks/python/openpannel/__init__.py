from typing import Dict, Optional
from .api import Api, ApiConfig

class OpenPannel:
    def __init__(self, api_key: str, base_url: str = "https://api.openpanel.com/v1", client_id: str = None, client_secret: str = None, sdk: str = "python", sdk_version: str = None):
        self.api_key = api_key
        self.base_url = base_url
        self.client_id = client_id
        self.client_secret = client_secret
        self.sdk = sdk
        self.sdk_version = sdk_version
        self.profile_id = None
        self.global_properties = {}
        self.queue = []
        self.api = Api(ApiConfig(base_url=self.base_url, default_headers=self._get_default_headers()))

    def _get_default_headers(self) -> Dict[str, str]:
        headers = {}
        if self.client_id:
            headers["openpanel-client-id"] = self.client_id
        if self.client_secret:
            headers["openpanel-client-secret"] = self.client_secret
        headers["openpanel-sdk-name"] = self.sdk
        headers["openpanel-sdk-version"] = self.sdk_version or "unknown"
        return headers

    def _send(self, payload: Dict) -> Optional[Dict]:
        if self.profile_id is None:
            self.queue.append(payload)
            return None
        return self.api.fetch("/track", payload)

    def track(self, name: str, properties: Dict = None, profile_id: Optional[str] = None):
        payload = {
            "type": "track",
            "payload": {
                "name": name,
                "properties": {
                    **(self.global_properties or {}),
                    **(properties or {}),
                },
                "profile_id": profile_id or self.profile_id,
            }
        }
        return self._send(payload)

    def identify(self, profile_id: str, properties: Dict = None):
        if profile_id:
            self.profile_id = profile_id
            self.flush()
        payload = {
            "type": "identify",
            "payload": {
                "profile_id": profile_id,
                "properties": {
                    **(self.global_properties or {}),
                    **(properties or {}),
                },
            }
        }
        return self._send(payload)

    def alias(self, profile_id: str, alias: str):
        payload = {
            "type": "alias",
            "payload": {
                "profile_id": profile_id,
                "alias": alias,
            }
        }
        return self._send(payload)

    def increment(self, profile_id: str, property: str, value: int = 1):
        payload = {
            "type": "increment",
            "payload": {
                "profile_id": profile_id,
                "property": property,
                "value": value,
            }
        }
        return self._send(payload)

    def decrement(self, profile_id: str, property: str, value: int = 1):
        payload = {
            "type": "decrement",
            "payload": {
                "profile_id": profile_id,
                "property": property,
                "value": value,
            }
        }
        return self._send(payload)

    def set_global_properties(self, properties: Dict):
        self.global_properties = {
            **(self.global_properties or {}),
            **properties,
        }

    def flush(self):
        for item in self.queue:
            self._send(item)
        self.queue = []