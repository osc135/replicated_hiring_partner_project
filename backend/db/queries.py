import json
import logging
from typing import Any, Optional
from uuid import UUID

import asyncpg

logger = logging.getLogger(__name__)


# --- Users ---

async def create_user(pool: asyncpg.Pool, email: str, hashed_password: str) -> dict:
    """Create a new user and return their record."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, hashed_password)
            VALUES ($1, $2)
            RETURNING id, email, created_at
            """,
            email,
            hashed_password,
        )
    return dict(row)


async def get_user_by_email(pool: asyncpg.Pool, email: str) -> Optional[dict]:
    """Look up a user by email."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, hashed_password, created_at FROM users WHERE email = $1",
            email,
        )
    return dict(row) if row else None


async def get_user_by_id(pool: asyncpg.Pool, user_id: UUID) -> Optional[dict]:
    """Look up a user by id."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, created_at FROM users WHERE id = $1",
            user_id,
        )
    return dict(row) if row else None


# --- Bundles ---

async def create_bundle(pool: asyncpg.Pool, user_id: UUID, filename: str) -> dict:
    """Create a new bundle record."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO bundles (user_id, filename)
            VALUES ($1, $2)
            RETURNING id, user_id, filename, uploaded_at, status
            """,
            user_id,
            filename,
        )
    return dict(row)


async def get_bundles_by_user(pool: asyncpg.Pool, user_id: UUID) -> list[dict]:
    """List all bundles for a user, with severity from analysis."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT b.id, b.filename, b.uploaded_at, b.status, a.severity
            FROM bundles b
            LEFT JOIN analyses a ON a.bundle_id = b.id
            WHERE b.user_id = $1
            ORDER BY b.uploaded_at DESC
            """,
            user_id,
        )
    return [dict(r) for r in rows]


async def get_bundle_by_id(pool: asyncpg.Pool, bundle_id: UUID, user_id: UUID) -> Optional[dict]:
    """Get a specific bundle, scoped to user."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT b.id, b.filename, b.uploaded_at, b.status, a.severity
            FROM bundles b
            LEFT JOIN analyses a ON a.bundle_id = b.id
            WHERE b.id = $1 AND b.user_id = $2
            """,
            bundle_id,
            user_id,
        )
    return dict(row) if row else None


async def update_bundle_status(pool: asyncpg.Pool, bundle_id: UUID, status: str) -> None:
    """Update the status of a bundle."""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE bundles SET status = $1 WHERE id = $2",
            status,
            bundle_id,
        )


# --- Analyses ---

async def create_analysis(
    pool: asyncpg.Pool,
    bundle_id: UUID,
    user_id: UUID,
    rule_findings: dict,
    llm_diagnosis: str,
    severity: str,
    embedding: Optional[list[float]] = None,
    cluster_data: Optional[dict] = None,
) -> dict:
    """Create a new analysis record."""
    findings_json = json.dumps(rule_findings)
    cluster_data_json = json.dumps(cluster_data) if cluster_data else None
    embedding_str = None
    if embedding:
        embedding_str = "[" + ",".join(str(f) for f in embedding) + "]"

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO analyses (bundle_id, user_id, rule_findings, llm_diagnosis, severity, embedding, cluster_data)
            VALUES ($1, $2, $3::jsonb, $4, $5, $6::vector, $7::jsonb)
            RETURNING id, bundle_id, user_id, rule_findings, llm_diagnosis, severity, created_at
            """,
            bundle_id,
            user_id,
            findings_json,
            llm_diagnosis,
            severity,
            embedding_str,
            cluster_data_json,
        )
    result = dict(row)
    if result.get("rule_findings") and isinstance(result["rule_findings"], str):
        result["rule_findings"] = json.loads(result["rule_findings"])
    return result


async def get_analysis_by_bundle(pool: asyncpg.Pool, bundle_id: UUID, user_id: UUID) -> Optional[dict]:
    """Get analysis for a bundle, scoped to user."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, bundle_id, user_id, rule_findings, llm_diagnosis, severity, created_at
            FROM analyses
            WHERE bundle_id = $1 AND user_id = $2
            """,
            bundle_id,
            user_id,
        )
    if not row:
        return None
    result = dict(row)
    if result.get("rule_findings") and isinstance(result["rule_findings"], str):
        result["rule_findings"] = json.loads(result["rule_findings"])
    return result


async def get_analysis_by_id(pool: asyncpg.Pool, analysis_id: UUID, user_id: UUID) -> Optional[dict]:
    """Get analysis by its own ID, scoped to user."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, bundle_id, user_id, rule_findings, llm_diagnosis, severity, created_at
            FROM analyses
            WHERE id = $1 AND user_id = $2
            """,
            analysis_id,
            user_id,
        )
    if not row:
        return None
    result = dict(row)
    if result.get("rule_findings") and isinstance(result["rule_findings"], str):
        result["rule_findings"] = json.loads(result["rule_findings"])
    return result


async def update_analysis(
    pool: asyncpg.Pool,
    analysis_id: UUID,
    llm_diagnosis: str,
    severity: str,
    embedding: Optional[list[float]] = None,
) -> None:
    """Update an existing analysis with LLM results."""
    embedding_str = None
    if embedding:
        embedding_str = "[" + ",".join(str(f) for f in embedding) + "]"

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE analyses
            SET llm_diagnosis = $1, severity = $2, embedding = $3::vector
            WHERE id = $4
            """,
            llm_diagnosis,
            severity,
            embedding_str,
            analysis_id,
        )


# --- Chat Messages ---

async def create_chat_message(
    pool: asyncpg.Pool,
    analysis_id: UUID,
    user_id: UUID,
    role: str,
    content: str,
) -> dict:
    """Save a chat message."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO chat_messages (analysis_id, user_id, role, content)
            VALUES ($1, $2, $3, $4)
            RETURNING id, analysis_id, user_id, role, content, created_at
            """,
            analysis_id,
            user_id,
            role,
            content,
        )
    return dict(row)


async def get_chat_history(pool: asyncpg.Pool, analysis_id: UUID, user_id: UUID) -> list[dict]:
    """Get chat history for an analysis, scoped to user."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, role, content, created_at
            FROM chat_messages
            WHERE analysis_id = $1 AND user_id = $2
            ORDER BY created_at ASC
            """,
            analysis_id,
            user_id,
        )
    return [dict(r) for r in rows]


# --- Similar Analyses (pgvector) ---

async def find_similar_analyses(
    pool: asyncpg.Pool,
    embedding: list[float],
    user_id: UUID,
    exclude_analysis_id: Optional[UUID] = None,
    limit: int = 5,
) -> list[dict]:
    """Find similar analyses using cosine distance via pgvector."""
    embedding_str = "[" + ",".join(str(f) for f in embedding) + "]"

    query = """
        SELECT
            a.id AS analysis_id,
            b.filename AS bundle_filename,
            a.severity,
            1 - (a.embedding <=> $1::vector) AS similarity_score,
            LEFT(a.llm_diagnosis, 200) AS summary
        FROM analyses a
        JOIN bundles b ON b.id = a.bundle_id
        WHERE a.user_id = $2
          AND a.embedding IS NOT NULL
    """
    params: list[Any] = [embedding_str, user_id]

    if exclude_analysis_id:
        query += " AND a.id != $3"
        params.append(exclude_analysis_id)

    query += f"""
        ORDER BY a.embedding <=> $1::vector
        LIMIT {limit}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return [dict(r) for r in rows]


# --- Dashboard ---

async def get_latest_analysis_with_cluster_data(
    pool: asyncpg.Pool, user_id: UUID
) -> Optional[dict]:
    """Get the most recent completed analysis with cluster_data for the dashboard."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT a.id, a.bundle_id, a.severity, a.cluster_data, a.rule_findings, a.created_at,
                   b.filename
            FROM analyses a
            JOIN bundles b ON b.id = a.bundle_id
            WHERE a.user_id = $1 AND b.status = 'completed'
            ORDER BY a.created_at DESC
            LIMIT 1
            """,
            user_id,
        )
    if not row:
        return None
    result = dict(row)
    if result.get("rule_findings") and isinstance(result["rule_findings"], str):
        result["rule_findings"] = json.loads(result["rule_findings"])
    if result.get("cluster_data") and isinstance(result["cluster_data"], str):
        result["cluster_data"] = json.loads(result["cluster_data"])
    return result


async def get_analyses_summary(pool: asyncpg.Pool, user_id: UUID) -> list[dict]:
    """Get all analyses with bundle info for the history table."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT a.id AS analysis_id, a.bundle_id, a.severity, a.rule_findings, a.created_at,
                   b.filename, b.uploaded_at
            FROM analyses a
            JOIN bundles b ON b.id = a.bundle_id
            WHERE a.user_id = $1 AND b.status = 'completed'
            ORDER BY b.uploaded_at DESC
            """,
            user_id,
        )
    results = []
    for r in rows:
        d = dict(r)
        findings = d.get("rule_findings")
        if findings and isinstance(findings, str):
            findings = json.loads(findings)
        finding_list = findings.get("findings", []) if isinstance(findings, dict) else []
        d["finding_counts"] = {
            "critical": sum(1 for f in finding_list if f.get("severity") == "critical"),
            "warning": sum(1 for f in finding_list if f.get("severity") == "warning"),
            "info": sum(1 for f in finding_list if f.get("severity") == "info"),
        }
        del d["rule_findings"]  # Don't send full findings to history table
        results.append(d)
    return results
