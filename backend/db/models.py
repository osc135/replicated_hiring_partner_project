from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


# --- Auth ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Bundles ---
class BundleResponse(BaseModel):
    id: UUID
    filename: str
    uploaded_at: datetime
    status: str
    severity: Optional[str] = None


# --- Analysis ---
class AnalysisResponse(BaseModel):
    id: UUID
    bundle_id: UUID
    rule_findings: Optional[dict[str, Any]] = None
    llm_diagnosis: Optional[str] = None
    severity: Optional[str] = None
    created_at: datetime


# --- Chat ---
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str


# --- Similar Incidents ---
class SimilarIncident(BaseModel):
    analysis_id: UUID
    bundle_filename: str
    severity: Optional[str] = None
    similarity_score: float
    summary: Optional[str] = None
