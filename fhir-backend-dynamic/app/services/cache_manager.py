"""
Cache Manager for Aggregate Datasets
Provides abstraction layer for memory and Redis backends with TTL and LRU management
"""

import asyncio
import json
import logging
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from abc import ABC, abstractmethod
import uuid

logger = logging.getLogger(__name__)

class CacheBackend(ABC):
    """Abstract base class for cache backends"""
    
    @abstractmethod
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        pass
    
    @abstractmethod
    async def set(self, key: str, value: Dict[str, Any], ttl_seconds: int) -> bool:
        pass
    
    @abstractmethod
    async def delete(self, key: str) -> bool:
        pass
    
    @abstractmethod
    async def get_keys_for_user(self, user_id: str) -> List[str]:
        pass
    
    @abstractmethod
    async def clear_expired(self) -> int:
        pass

class MemoryCacheBackend(CacheBackend):
    """In-memory cache backend with TTL and LRU eviction"""
    
    def __init__(self, max_datasets_per_user: int = 10, max_memory_mb: int = 512):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._expiry: Dict[str, datetime] = {}
        self._access_order: Dict[str, datetime] = {}
        self.max_datasets_per_user = max_datasets_per_user
        self.max_memory_mb = max_memory_mb
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            if key in self._cache:
                if datetime.now() < self._expiry.get(key, datetime.min):
                    self._access_order[key] = datetime.now()
                    logger.debug(f"Cache hit: {key}")
                    return self._cache[key]
                else:
                    # Expired
                    await self._remove_key(key)
                    logger.debug(f"Cache expired: {key}")
            
            logger.debug(f"Cache miss: {key}")
            return None
    
    async def set(self, key: str, value: Dict[str, Any], ttl_seconds: int) -> bool:
        async with self._lock:
            # Check memory limits before adding
            await self._enforce_memory_limits()
            
            # Enforce per-user dataset limits
            user_id = self._extract_user_from_key(key)
            if user_id:
                await self._enforce_user_limits(user_id)
            
            self._cache[key] = value
            self._expiry[key] = datetime.now() + timedelta(seconds=ttl_seconds)
            self._access_order[key] = datetime.now()
            
            logger.debug(f"Cache set: {key} (TTL: {ttl_seconds}s)")
            return True
    
    async def delete(self, key: str) -> bool:
        async with self._lock:
            if key in self._cache:
                await self._remove_key(key)
                logger.debug(f"Cache deleted: {key}")
                return True
            return False
    
    async def get_keys_for_user(self, user_id: str) -> List[str]:
        async with self._lock:
            return self._get_keys_for_user_unlocked(user_id)
    
    async def clear_expired(self) -> int:
        async with self._lock:
            expired_keys = []
            now = datetime.now()
            
            for key, expiry in self._expiry.items():
                if now >= expiry:
                    expired_keys.append(key)
            
            for key in expired_keys:
                await self._remove_key(key)
            
            logger.info(f"Cleared {len(expired_keys)} expired cache entries")
            return len(expired_keys)
    
    async def _remove_key(self, key: str):
        """Remove key from all internal dictionaries"""
        self._cache.pop(key, None)
        self._expiry.pop(key, None)
        self._access_order.pop(key, None)
    
    def _extract_user_from_key(self, key: str) -> Optional[str]:
        """Extract user ID from cache key format: env:serverId:userId:resourceType:filterHash"""
        parts = key.split(":")
        return parts[2] if len(parts) >= 3 else None

    def _get_keys_for_user_unlocked(self, user_id: str) -> List[str]:
        """Get user-specific cache keys while the caller holds the lock."""
        return [key for key in self._cache.keys() if self._extract_user_from_key(key) == user_id]
    
    async def _enforce_user_limits(self, user_id: str):
        """Enforce max datasets per user using LRU eviction"""
        user_keys = self._get_keys_for_user_unlocked(user_id)
        
        if len(user_keys) >= self.max_datasets_per_user:
            # Sort by access time, evict oldest
            user_keys.sort(key=lambda k: self._access_order.get(k, datetime.min))
            keys_to_remove = user_keys[:len(user_keys) - self.max_datasets_per_user + 1]
            
            for key in keys_to_remove:
                await self._remove_key(key)
                logger.info(f"Evicted dataset for user limit: {key}")
    
    async def _enforce_memory_limits(self):
        """Rough memory limit enforcement by dataset count"""
        # Simplified: assume average dataset is ~1MB, evict LRU when over limit
        max_datasets = self.max_memory_mb
        
        if len(self._cache) >= max_datasets:
            # Evict oldest accessed datasets
            sorted_keys = sorted(self._cache.keys(), key=lambda k: self._access_order.get(k, datetime.min))
            keys_to_remove = sorted_keys[:len(sorted_keys) - max_datasets + 10]  # Remove extras for headroom
            
            for key in keys_to_remove:
                await self._remove_key(key)
                logger.info(f"Evicted dataset for memory limit: {key}")

class RedisCacheBackend(CacheBackend):
    """Redis cache backend - placeholder for future implementation"""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        # TODO: Implement Redis backend when needed
        raise NotImplementedError("Redis backend not yet implemented - use memory backend")
    
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError()
    
    async def set(self, key: str, value: Dict[str, Any], ttl_seconds: int) -> bool:
        raise NotImplementedError()
    
    async def delete(self, key: str) -> bool:
        raise NotImplementedError()
    
    async def get_keys_for_user(self, user_id: str) -> List[str]:
        raise NotImplementedError()
    
    async def clear_expired(self) -> int:
        raise NotImplementedError()

class CacheManager:
    """Main cache manager interface"""
    
    def __init__(self, backend_type: str = "memory", **kwargs):
        if backend_type == "memory":
            self.backend = MemoryCacheBackend(**kwargs)
        elif backend_type == "redis":
            self.backend = RedisCacheBackend(**kwargs)
        else:
            raise ValueError(f"Unknown cache backend: {backend_type}")
        
        logger.info(f"Initialized cache manager with {backend_type} backend")
    
    def generate_cache_key(self, env: str, server_id: str, user_id: str, 
                          resource_type: str, filters: Dict[str, Any]) -> str:
        """Generate deterministic cache key from parameters"""
        # Normalize filters for consistent hashing
        normalized_filters = self._normalize_filters(filters)
        filter_hash = hashlib.sha256(json.dumps(normalized_filters, sort_keys=True).encode()).hexdigest()[:16]
        
        return f"{env}:{server_id}:{user_id}:{resource_type}:{filter_hash}"
    
    def _normalize_filters(self, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize filter parameters for consistent cache keys"""
        normalized = {}
        
        for key, value in filters.items():
            if value is None:
                continue
            
            # Normalize common filter patterns
            if isinstance(value, str):
                value = value.strip().lower()
            elif isinstance(value, bool):
                value = str(value).lower()
            elif isinstance(value, list):
                value = sorted([str(v).strip().lower() for v in value])
        
            normalized[key] = value
        
        return normalized
    
    async def get_dataset(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get dataset from cache"""
        return await self.backend.get(cache_key)
    
    async def store_dataset(self, cache_key: str, dataset: Dict[str, Any], ttl_seconds: int) -> bool:
        """Store dataset in cache"""
        return await self.backend.set(cache_key, dataset, ttl_seconds)
    
    async def delete_dataset(self, cache_key: str) -> bool:
        """Delete dataset from cache"""
        return await self.backend.delete(cache_key)
    
    async def get_user_datasets(self, user_id: str) -> List[str]:
        """Get all dataset keys for a user"""
        return await self.backend.get_keys_for_user(user_id)
    
    async def cleanup_expired(self) -> int:
        """Clean up expired datasets"""
        return await self.backend.clear_expired()
    
    def get_dataset_id(self) -> str:
        """Generate unique dataset ID"""
        return str(uuid.uuid4())

# Global cache manager instance
_cache_manager: Optional[CacheManager] = None

def get_cache_manager() -> CacheManager:
    """Get global cache manager instance"""
    global _cache_manager
    if _cache_manager is None:
        from app.config import config
        _cache_manager = CacheManager(
            backend_type=config.cache_backend,
            max_datasets_per_user=config.cache_max_datasets_per_user,
            max_memory_mb=config.aggregate_max_memory_mb,
            redis_url=getattr(config, 'cache_redis_url', None)
        )
    return _cache_manager
