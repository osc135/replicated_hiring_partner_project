import json
import logging
import os
import shutil
import tempfile
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse

from api.auth import get_current_user
from db.database import get_pool
from db.models import BundleResponse
from db.queries import (
    create_analysis,
    create_bundle,
    get_bundle_by_id,
    get_bundles_by_user,
    update_analysis,
    update_bundle_status,
)
from analyzer.extractor import extract_bundle
from analyzer.scanner import scan_bundle
from analyzer.analyzer import analyze_bundle

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bundles", tags=["bundles"])


@router.post("/upload")
async def upload_bundle(file: UploadFile, user: dict = Depends(get_current_user)):
    """
    Upload a support bundle (.tar.gz), trigger analysis, and stream results via SSE.
    """
    if not file.filename or not file.filename.endswith((".tar.gz", ".tgz")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a .tar.gz or .tgz archive",
        )

    pool = get_pool()
    user_id = user["id"]

    # Save uploaded file to a temp location
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".tar.gz")
    try:
        content = await file.read()
        tmp_file.write(content)
        tmp_file.close()
    except Exception:
        tmp_file.close()
        os.unlink(tmp_file.name)
        logger.exception("Failed to save uploaded file")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save file")

    # Create bundle record
    bundle = await create_bundle(pool, user_id, file.filename)
    bundle_id = bundle["id"]

    async def event_stream():
        extracted_path = None
        try:
            # Update status
            await update_bundle_status(pool, bundle_id, "processing")

            # Step 1: Extract
            extracted_path = extract_bundle(tmp_file.name)
            yield f"data: {json.dumps({'type': 'status', 'content': 'Bundle extracted successfully'})}\n\n"

            # Step 2: Rule-based scan
            rule_findings = scan_bundle(extracted_path)
            num_findings = len(rule_findings["findings"])
            yield f"data: {json.dumps({'type': 'status', 'content': f'Scan complete: {num_findings} findings'})}\n\n"

            # Step 3: Create initial analysis record
            initial_analysis = await create_analysis(
                pool,
                bundle_id=bundle_id,
                user_id=user_id,
                rule_findings=rule_findings,
                llm_diagnosis="",
                severity="info",
                embedding=None,
            )
            analysis_id = initial_analysis["id"]

            # Step 4: Stream LLM analysis, intercept _result event for DB save
            async for event in analyze_bundle(extracted_path, rule_findings, pool, str(user_id)):
                # Check if this is the internal result event
                if '"type": "_result"' in event:
                    try:
                        payload = json.loads(event.replace("data: ", "").strip())
                        await update_analysis(
                            pool,
                            analysis_id=analysis_id,
                            llm_diagnosis=payload["diagnosis"],
                            severity=payload["severity"],
                            embedding=payload.get("embedding"),
                        )
                    except Exception:
                        logger.exception("Failed to save analysis results")
                elif '"type": "done"' in event:
                    # Inject analysis_id into done event so frontend can chat immediately
                    try:
                        done_payload = json.loads(event.replace("data: ", "").strip())
                        done_payload["analysis_id"] = str(analysis_id)
                        yield f"data: {json.dumps(done_payload)}\n\n"
                    except Exception:
                        yield event
                else:
                    yield event

            # Step 6: Mark bundle as completed
            await update_bundle_status(pool, bundle_id, "completed")

        except Exception as exc:
            logger.exception("Analysis pipeline failed for bundle %s", bundle_id)
            await update_bundle_status(pool, bundle_id, "failed")
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

        finally:
            # Cleanup temp files
            try:
                os.unlink(tmp_file.name)
            except OSError:
                pass
            if extracted_path:
                try:
                    shutil.rmtree(extracted_path)
                except OSError:
                    pass
                # Also try to remove the parent if it was a nested dir
                parent = os.path.dirname(extracted_path)
                if parent and parent.startswith(tempfile.gettempdir()):
                    try:
                        shutil.rmtree(parent)
                    except OSError:
                        pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Bundle-Id": str(bundle_id),
        },
    )


@router.get("", response_model=list[BundleResponse])
async def list_bundles(user: dict = Depends(get_current_user)):
    """List all bundles for the current user."""
    pool = get_pool()
    bundles = await get_bundles_by_user(pool, user["id"])
    return bundles


@router.get("/{bundle_id}", response_model=BundleResponse)
async def get_bundle(bundle_id: UUID, user: dict = Depends(get_current_user)):
    """Get a specific bundle by ID."""
    pool = get_pool()
    bundle = await get_bundle_by_id(pool, bundle_id, user["id"])
    if not bundle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bundle not found")
    return bundle
