import httpx
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception_type
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)
TIMEOUT = httpx.Timeout(20.0, read=30.0, connect=10.0)

# --- NEW: Shared connection pool ---
_client: httpx.AsyncClient | None = None

async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client

async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
# -----------------------------------

@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=0.2, max=2.0),
    retry=retry_if_exception_type(httpx.HTTPError),
)
async def get_json(url: str, reg=None, params: Optional[Dict[str, str]] = None, timeout_override: Optional[float] = None) -> Dict:
    headers = {"Accept": "application/fhir+json"}

    logger.debug(f"Making request to: {url}")
    if params:
        logger.debug(f"With params: {params}")

    timeout_to_use = httpx.Timeout(timeout_override or 20.0, read=timeout_override or 30.0, connect=10.0) if timeout_override else TIMEOUT
    
    # FIXED: Use the shared client instead of creating a new one
    client = await get_client()
    try:
        # We can override the client's default timeout per request
        r = await client.get(url, params=params, headers=headers, timeout=timeout_to_use)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP {e.response.status_code} for URL: {e.request.url}")
        logger.error(f"Response content: {e.response.text if hasattr(e.response, 'text') else 'No content'}")
        raise
    except Exception as e:
        logger.error(f"Request failed for {url}: {str(e)}")
        raise