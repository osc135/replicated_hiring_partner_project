import logging
import os
from pathlib import Path

import asyncpg

from config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def create_pool() -> asyncpg.Pool:
    """Create and store the asyncpg connection pool."""
    global _pool
    logger.info("Creating database connection pool")
    _pool = await asyncpg.create_pool(
        dsn=settings.asyncpg_url,
        min_size=2,
        max_size=10,
    )
    return _pool


def get_pool() -> asyncpg.Pool:
    """Return the current connection pool. Raises if not initialized."""
    if _pool is None:
        raise RuntimeError("Database pool has not been initialized. Call create_pool() first.")
    return _pool


async def close_pool() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")


async def init_db() -> None:
    """Run the init.sql script to create tables."""
    pool = get_pool()
    init_sql_path = Path(__file__).parent / "init.sql"
    sql = init_sql_path.read_text()
    async with pool.acquire() as conn:
        await conn.execute(sql)
    logger.info("Database initialized successfully")
