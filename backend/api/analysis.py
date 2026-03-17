import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from api.auth import get_current_user
from db.database import get_pool
from db.models import AnalysisResponse, SimilarIncident
from db.queries import get_analysis_by_bundle, get_analysis_by_id, find_similar_analyses

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


@router.get("/analysis/{bundle_id}", response_model=AnalysisResponse)
async def get_analysis(bundle_id: UUID, user: dict = Depends(get_current_user)):
    """Get the completed analysis for a bundle."""
    pool = get_pool()
    analysis = await get_analysis_by_bundle(pool, bundle_id, user["id"])
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return analysis


@router.get("/similar/{analysis_id}", response_model=list[SimilarIncident])
async def get_similar_incidents(analysis_id: UUID, user: dict = Depends(get_current_user)):
    """Find similar past incidents using vector similarity."""
    pool = get_pool()

    # Get the analysis to retrieve its embedding
    analysis = await get_analysis_by_id(pool, analysis_id, user["id"])
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")

    # We need the embedding to find similar; re-generate if needed
    # Fetch the raw embedding from DB
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT embedding FROM analyses WHERE id = $1 AND user_id = $2",
            analysis_id,
            user["id"],
        )

    if not row or row["embedding"] is None:
        return []

    # pgvector returns embedding as a string like "[0.1,0.2,...]"
    embedding_raw = row["embedding"]
    if isinstance(embedding_raw, str):
        embedding = [float(x) for x in embedding_raw.strip("[]").split(",")]
    elif isinstance(embedding_raw, (list, tuple)):
        embedding = list(embedding_raw)
    else:
        # numpy array or other format from pgvector
        embedding = list(embedding_raw)

    similar = await find_similar_analyses(
        pool,
        embedding=embedding,
        user_id=user["id"],
        exclude_analysis_id=analysis_id,
        limit=5,
    )

    return similar
