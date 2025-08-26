import httpx
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception_type
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)
TIMEOUT = httpx.Timeout(20.0, read=30.0, connect=10.0)

@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=0.2, max=2.0),
    retry=retry_if_exception_type(httpx.HTTPError),
)
async def get_json(url: str, reg=None, params: Optional[Dict[str, str]] = None) -> Dict:
    headers = {"Accept": "application/fhir+json"}

    # FIXED: Log the actual URL being requested for debugging
    logger.debug(f"Making request to: {url}")
    if params:
        logger.debug(f"With params: {params}")

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        try:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            # FIXED: Better error logging
            logger.error(f"HTTP {e.response.status_code} for URL: {e.request.url}")
            logger.error(f"Response content: {e.response.text if hasattr(e.response, 'text') else 'No content'}")
            raise
        except Exception as e:
            logger.error(f"Request failed for {url}: {str(e)}")
            raise