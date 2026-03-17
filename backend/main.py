import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import close_pool, create_pool, init_db
from api.auth import router as auth_router
from api.bundles import router as bundles_router
from api.analysis import router as analysis_router
from api.chat import router as chat_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Starting up — initializing database pool")
    await create_pool()
    await init_db()
    logger.info("Database ready")
    yield
    logger.info("Shutting down — closing database pool")
    await close_pool()


app = FastAPI(
    title="K8s Support Bundle Analyzer",
    description="Analyze Kubernetes support bundles with AI-powered diagnostics",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(bundles_router)
app.include_router(analysis_router)
app.include_router(chat_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
