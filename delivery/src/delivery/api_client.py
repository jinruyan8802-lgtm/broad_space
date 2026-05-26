import os
from typing import Optional

import requests


class ApiClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or os.environ.get("API_URL", "http://localhost:8000")

    def fetch_top_content(self, limit: int = 10, min_signal: float = 0.0) -> list[dict]:
        resp = requests.get(
            f"{self.base_url}/content",
            params={"limit": limit, "min_signal": min_signal},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
