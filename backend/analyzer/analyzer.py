import json
import logging
import os
import re
from typing import Any, AsyncGenerator, Optional

import asyncpg
from openai import AsyncOpenAI

from config import settings
from db.queries import find_similar_analyses

logger = logging.getLogger(__name__)

# File reading priority
PRIORITY_PATTERNS = [
    ("cluster-resources/events", 0),
    ("cluster-resources/pods", 1),
    ("pod-logs", 2),
    ("deployments", 3),
    ("replicasets", 3),
    ("analysis.json", 4),
]

MAX_FILE_CHARS = 4000
MAX_CONTEXT_CHARS = 100_000


def _file_priority(rel_path: str) -> int:
    """Assign a priority to a file based on its path (lower is higher priority)."""
    lower = rel_path.lower()
    # Prefer previous container logs
    if "previous" in lower and "pod-logs" in lower:
        return 1  # before regular pod-logs
    for pattern, prio in PRIORITY_PATTERNS:
        if pattern in lower:
            return prio
    return 10


def _collect_prioritized_files(extracted_path: str) -> list[tuple[str, str]]:
    """
    Walk the extracted bundle and return (relative_path, absolute_path) pairs
    sorted by priority.
    """
    files = []
    for root, _dirs, filenames in os.walk(extracted_path):
        for fname in filenames:
            abs_path = os.path.join(root, fname)
            rel_path = os.path.relpath(abs_path, extracted_path)
            files.append((rel_path, abs_path))

    files.sort(key=lambda x: _file_priority(x[0]))
    return files


def _read_file_truncated(abs_path: str, max_chars: int = MAX_FILE_CHARS) -> Optional[str]:
    """Read a file, tail-truncating if over max_chars."""
    try:
        size = os.path.getsize(abs_path)
        if size > 10 * 1024 * 1024:
            return None  # skip very large files

        with open(abs_path, "r", errors="ignore") as f:
            content = f.read()

        if len(content) > max_chars:
            # Tail-truncate: keep the last max_chars characters
            content = "... [truncated, showing last portion] ...\n" + content[-max_chars:]

        return content
    except (OSError, UnicodeDecodeError):
        return None


def _build_file_context(extracted_path: str) -> str:
    """Build the file context string from prioritized files, staying under token limit."""
    files = _collect_prioritized_files(extracted_path)
    context_parts = []
    total_chars = 0

    for rel_path, abs_path in files:
        if total_chars >= MAX_CONTEXT_CHARS:
            break

        content = _read_file_truncated(abs_path)
        if not content or not content.strip():
            continue

        remaining = MAX_CONTEXT_CHARS - total_chars
        if len(content) > remaining:
            content = content[:remaining]

        section = f"### File: {rel_path}\n```\n{content}\n```\n"
        context_parts.append(section)
        total_chars += len(section)

    return "\n".join(context_parts)


def _format_rule_findings(rule_findings: dict[str, Any]) -> str:
    """Format rule findings into a readable string for the LLM prompt."""
    if not rule_findings or not rule_findings.get("findings"):
        return "No automated findings detected."

    parts = []
    for finding in rule_findings["findings"]:
        matches_str = ""
        if finding.get("matches"):
            match_lines = [f"  - Line {m['line_number']}: {m['line']}" for m in finding["matches"][:3]]
            matches_str = "\n".join(match_lines)

        parts.append(
            f"- **{finding['rule']}** ({finding['severity']}): {finding['description']}\n"
            f"  File: {finding['file']}\n{matches_str}"
        )

    summary = f"Scanned {rule_findings.get('scanned_files', 0)} of {rule_findings.get('total_files', 0)} files.\n\n"
    return summary + "\n".join(parts)


def _format_similar_incidents(incidents: list[dict]) -> str:
    """Format similar past incidents for the prompt."""
    if not incidents:
        return "No previous incidents found."

    parts = []
    for inc in incidents:
        parts.append(
            f"- Bundle: {inc.get('bundle_filename', 'unknown')} | "
            f"Severity: {inc.get('severity', 'unknown')} | "
            f"Similarity: {inc.get('similarity_score', 0):.2f}\n"
            f"  Summary: {inc.get('summary', 'N/A')}"
        )
    return "\n".join(parts)


def _extract_severity(diagnosis: str) -> str:
    """Extract the severity from the LLM diagnosis text."""
    match = re.search(r"SEVERITY:\s*(critical|warning|info)", diagnosis, re.IGNORECASE)
    if match:
        return match.group(1).lower()
    # Fallback: guess from content
    lower = diagnosis.lower()
    if "critical" in lower[:200]:
        return "critical"
    if "warning" in lower[:200]:
        return "warning"
    return "info"


async def _get_embedding(text: str) -> list[float]:
    """Generate an embedding for the given text using OpenAI."""
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    # Truncate to avoid token limits for embedding model
    truncated = text[:8000]
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=truncated,
    )
    return response.data[0].embedding


async def analyze_bundle(
    extracted_path: str,
    rule_findings: dict[str, Any],
    pool: asyncpg.Pool,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Run LLM analysis on a support bundle. Yields SSE-formatted events.

    Event types:
      - {"type": "rule_findings", "content": {...}}
      - {"type": "token", "content": "..."}
      - {"type": "done"}
    """
    # First yield rule findings
    yield f"data: {json.dumps({'type': 'rule_findings', 'content': rule_findings})}\n\n"

    # Build context from files
    file_context = _build_file_context(extracted_path)

    # Look up similar incidents (need a temporary embedding from rule findings summary)
    similar_incidents: list[dict] = []
    try:
        if rule_findings.get("findings"):
            summary_text = _format_rule_findings(rule_findings)
            temp_embedding = await _get_embedding(summary_text)
            from uuid import UUID
            similar_incidents = await find_similar_analyses(
                pool, temp_embedding, UUID(user_id), limit=5
            )
    except Exception:
        logger.exception("Failed to fetch similar incidents, continuing without them")

    # Build the prompt
    prompt = f"""You are an expert Kubernetes support engineer analyzing a support bundle.

## Rule-based findings (automated scan):
{_format_rule_findings(rule_findings)}

## Relevant cluster state and logs:
{file_context}

## Similar past incidents:
{_format_similar_incidents(similar_incidents)}

Analyze this support bundle. Output your response in this exact format:

SEVERITY: critical/warning/info

## Summary
[2-3 sentence overview of what's wrong]

## Findings
[For each issue found:]
### [Issue Name]
- **Status**: [What's happening]
- **Evidence**: [Specific log lines or state that proves this]
- **Confidence**: [High/Medium/Low]
- **Affected Resources**: [Pod names, namespaces, etc.]

## Root Cause Analysis
[What's actually causing these issues and how they relate]

## Recommended Actions
[Numbered list of specific steps to fix, ordered by priority]"""

    # Stream from OpenAI
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    full_diagnosis = ""

    try:
        stream = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            temperature=0.3,
            max_tokens=4096,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                token = delta.content
                full_diagnosis += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    except Exception:
        logger.exception("OpenAI streaming failed")
        error_msg = "Analysis failed due to an LLM error. Rule-based findings are still available above."
        full_diagnosis = error_msg
        yield f"data: {json.dumps({'type': 'token', 'content': error_msg})}\n\n"

    # Extract severity from the diagnosis
    severity = _extract_severity(full_diagnosis)

    # Generate embedding for the full diagnosis
    embedding = None
    try:
        embedding = await _get_embedding(full_diagnosis)
    except Exception:
        logger.exception("Failed to generate embedding")

    # Yield internal result event (intercepted by caller, not sent to client)
    yield f"data: {json.dumps({'type': '_result', 'diagnosis': full_diagnosis, 'severity': severity, 'embedding': embedding})}\n\n"

    # Yield done event with metadata for the client
    yield f"data: {json.dumps({'type': 'done', 'severity': severity})}\n\n"
