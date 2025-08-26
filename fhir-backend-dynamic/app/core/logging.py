import logging, time, uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        start = time.time()
        try:
            response = await call_next(request)
        finally:
            duration = (time.time() - start) * 1000
            logging.getLogger("app").info(
                f"{request.method} {request.url.path} -> {getattr(response, 'status_code', None)} in {duration:.1f}ms",
            )
        response.headers["x-request-id"] = request_id
        return response

def setup_logging(app):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s :: %(message)s")
    app.add_middleware(RequestContextMiddleware)
