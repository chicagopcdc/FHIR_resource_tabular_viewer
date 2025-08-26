import time
from typing import Dict, Tuple

# Simple token bucket in-memory: (tokens, last_refill)
_BUCKETS: Dict[Tuple[str, str], Tuple[float, float]] = {}
RATE = 10          # tokens per second
BURST = 30         # max bucket size

def allow(key: str) -> bool:
    now = time.monotonic()
    tokens, last = _BUCKETS.get(key, (BURST, now))
    # refill
    delta = now - last
    tokens = min(BURST, tokens + delta * RATE)
    if tokens >= 1:
        tokens -= 1
        _BUCKETS[key] = (tokens, now)
        return True
    _BUCKETS[key] = (tokens, now)
    return False
