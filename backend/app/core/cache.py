import json
import logging
import time
from typing import Any

import redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class CacheManager:
    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._is_redis = redis_url.startswith("redis://")
        self._memory_store: dict[str, tuple[str, float | None]] = {}
        self._redis_client: redis.Redis | None = None

        if self._is_redis:
            try:
                self._redis_client = redis.Redis.from_url(
                    redis_url, decode_responses=True, socket_timeout=2
                )
            except Exception as e:
                logger.warning("Failed to initialize Redis client: %s", e)
                self._redis_client = None

    def get(self, key: str) -> str | None:
        if self._redis_client:
            try:
                return self._redis_client.get(key)
            except Exception as e:
                logger.warning("Redis GET error for key %s: %s", key, e)

        # Fallback to memory
        item = self._memory_store.get(key)
        if item is not None:
            val, expiry = item
            if expiry is None or expiry > time.time():
                return val
            del self._memory_store[key]
        return None

    def get_json(self, key: str) -> Any | None:
        raw = self.get(key)
        if raw is not None:
            try:
                return json.loads(raw)
            except Exception:
                return None
        return None

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        if self._redis_client:
            try:
                self._redis_client.set(key, value, ex=ex)
                return
            except Exception as e:
                logger.warning("Redis SET error for key %s: %s", key, e)

        # Fallback to memory
        expiry = time.time() + ex if ex is not None else None
        self._memory_store[key] = (value, expiry)

    def set_json(self, key: str, value: Any, ex: int | None = None) -> None:
        try:
            serialized = json.dumps(value)
            self.set(key, serialized, ex=ex)
        except Exception as e:
            logger.warning("Cache serialization error for key %s: %s", key, e)

    def delete(self, *keys: str) -> None:
        if not keys:
            return
        if self._redis_client:
            try:
                self._redis_client.delete(*keys)
            except Exception as e:
                logger.warning("Redis DELETE error: %s", e)

        for k in keys:
            self._memory_store.pop(k, None)


_cache_instance: CacheManager | None = None


def get_cache() -> CacheManager:
    global _cache_instance
    if _cache_instance is None:
        settings = get_settings()
        _cache_instance = CacheManager(settings.redis_url)
    return _cache_instance
