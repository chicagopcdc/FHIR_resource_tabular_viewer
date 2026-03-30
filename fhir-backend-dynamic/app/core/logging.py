import logging
import time
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


logger = logging.getLogger("app.request")

class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        
        start_time = time.perf_counter()
        
        try:
            response = await call_next(request)
        except Exception as e:
           
            logger.error("Request Failed | ID: %s | Error: %s", request_id, str(e))
            raise e
        finally:
            
            process_time = (time.perf_counter() - start_time) * 1000
            logger.info(
                "%s %s | Status: %s | Latency: %.2fms | ID: %s",
                request.method,
                request.url.path,
                getattr(response, 'status_code', '500'),
                process_time,
                request_id
            )
        
        
        response.headers["x-request-id"] = request_id
        return response

def setup_logging(app):
    # Use a cleaner format for Cloud Log Explorers
    logging.basicConfig(
        level=logging.INFO, 
        format="%(levelname)s: [%(name)s] %(message)s"
    )
    app.add_middleware(RequestContextMiddleware)
