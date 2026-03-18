import logging
from typing import Optional

from langfuse import Langfuse

from config import settings

logger = logging.getLogger(__name__)

_langfuse: Optional[Langfuse] = None


def get_langfuse() -> Optional[Langfuse]:
    """Return a Langfuse client if configured, otherwise None."""
    global _langfuse
    if _langfuse is not None:
        return _langfuse

    if not settings.LANGFUSE_PUBLIC_KEY or not settings.LANGFUSE_SECRET_KEY:
        logger.info("LangFuse not configured, skipping observability")
        return None

    try:
        host = settings.LANGFUSE_BASE_URL or settings.LANGFUSE_HOST
        _langfuse = Langfuse(
            public_key=settings.LANGFUSE_PUBLIC_KEY,
            secret_key=settings.LANGFUSE_SECRET_KEY,
            host=host,
        )
        logger.info("LangFuse initialized (host=%s)", host)
        return _langfuse
    except Exception:
        logger.exception("Failed to initialize LangFuse")
        return None
