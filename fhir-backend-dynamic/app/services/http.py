import httpx
import logging
import os
from typing import Dict, Optional, Any
from tenacity import (
    retry, 
    stop_after_attempt, 
    wait_exponential_jitter, 
    retry_if_exception_type
)
logger = logging.getLogger("app.fhir_client")
DEFAULT_TIMEOUT_READ = float(os.getenv("FHIR_READ_TIMEOUT", "30.0"))
DEFAULT_TIMEOUT_CONN = float(os.getenv("FHIR_CONNECT_TIMEOUT", "10.0"))
class FHIRClient:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client
    @retry(
        reraise=True,
        stop=stop_after_attempt(int(os.getenv("MAX_RETRIES", "3"))),
        wait=wait_exponential_jitter(initial=0.2, max=2.0),
        retry=retry_if_exception_type(httpx.HTTPError),
    )
    async def get_json(
        self, 
        url: str, 
        params: Optional[Dict[str, Any]] = None, 
        timeout_override: Optional[float] = None,
        auth_token: Optional[str] = None
    ) -> Dict:
        
        # 2. Cloud-Standard Headers
        headers = {
            "Accept": "application/fhir+json",
            "X-Cloud-Provider": os.getenv("CLOUD_PROVIDER", "unknown")
        }
        # Inject Bearer token if using Cloud Auth (GCP Healthcare API / Azure API for FHIR)
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

       
        timeout = httpx.Timeout(
            timeout_override or DEFAULT_TIMEOUT_READ, 
            connect=DEFAULT_TIMEOUT_CONN
        )
        logger.debug("Requesting FHIR Resource: %s | Params: %s", url, params)
        try:
            # Connection Re-use (Connection Pooling)
            response = await self.client.get(
                url, 
                params=params, 
                headers=headers, 
                timeout=timeout,
                follow_redirects=True
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            error_body = e.response.text[:500] 
            logger.error(
                "HTTP %s Error | URL: %s | Details: %s", 
                status_code, url, error_body
            )
            raise
        except httpx.RequestError as e:
            logger.error("Network Connectivity Issue | URL: %s | Message: %s", url, str(e))
            raise
                    except Exception as e:
            logger.error(f"Request failed for {url}: {str(e)}")
            raise
