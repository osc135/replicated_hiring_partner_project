import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

from api.auth import get_current_user
from config import settings
from db.database import get_pool
from db.models import ChatMessage, ChatRequest
from db.queries import (
    create_chat_message,
    get_analysis_by_id,
    get_chat_history,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/{analysis_id}")
async def chat_with_analysis(
    analysis_id: UUID,
    body: ChatRequest,
    user: dict = Depends(get_current_user),
):
    """Send a message and get a streaming AI response about the analysis."""
    pool = get_pool()
    user_id = user["id"]

    # Get the analysis for context
    analysis = await get_analysis_by_id(pool, analysis_id, user_id)
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")

    # Save user message
    await create_chat_message(pool, analysis_id, user_id, "user", body.message)

    # Get chat history
    history = await get_chat_history(pool, analysis_id, user_id)

    async def event_stream():
        # Build conversation messages for OpenAI
        system_message = (
            "You are an expert Kubernetes support engineer. You previously analyzed a support bundle "
            "and produced the following diagnosis. The user is asking follow-up questions about it.\n\n"
            f"## Original Analysis\n{analysis.get('llm_diagnosis', 'No analysis available.')}\n\n"
            f"## Rule-based Findings\n{json.dumps(analysis.get('rule_findings', {}), indent=2)}\n\n"
            "Answer the user's questions based on this analysis. Be specific, cite evidence where possible, "
            "and suggest actionable steps. If you don't know something, say so."
        )

        messages = [{"role": "system", "content": system_message}]

        # Add chat history (exclude the message we just saved, it's the current one)
        for msg in history:
            if msg["role"] in ("user", "assistant"):
                messages.append({"role": msg["role"], "content": msg["content"]})

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        full_response = ""

        try:
            stream = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                stream=True,
                temperature=0.3,
                max_tokens=2048,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    token = delta.content
                    full_response += token
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        except Exception:
            logger.exception("Chat streaming failed")
            error_msg = "Sorry, I encountered an error processing your question. Please try again."
            full_response = error_msg
            yield f"data: {json.dumps({'type': 'token', 'content': error_msg})}\n\n"

        # Save assistant response
        try:
            await create_chat_message(pool, analysis_id, user_id, "assistant", full_response)
        except Exception:
            logger.exception("Failed to save assistant chat message")

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/{analysis_id}", response_model=list[ChatMessage])
async def get_chat(analysis_id: UUID, user: dict = Depends(get_current_user)):
    """Get chat history for an analysis."""
    pool = get_pool()

    # Verify access
    analysis = await get_analysis_by_id(pool, analysis_id, user["id"])
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")

    history = await get_chat_history(pool, analysis_id, user["id"])
    return [{"role": msg["role"], "content": msg["content"]} for msg in history]
