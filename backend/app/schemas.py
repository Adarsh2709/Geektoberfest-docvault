from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Document Schemas
class DocumentBase(BaseModel):
    filename: str
    original_filename: str
    file_size: int
    content_type: str
    folder_id: Optional[int] = None

class DocumentCreate(DocumentBase):
    file_path: str

class DocumentResponse(DocumentBase):
    id: int
    created_at: datetime
    file_path: str
    owner_id: int

    model_config = ConfigDict(from_attributes=True)

class BulkDeleteRequest(BaseModel):
    document_ids: list[int]

class BulkDeleteFailure(BaseModel):
    id: int
    reason: str

class BulkDeleteResponse(BaseModel):
    deleted_ids: list[int]
    failed: list[BulkDeleteFailure]
    total_requested: int
    total_deleted: int

# Folder Schemas
class FolderBase(BaseModel):
    name: str

class FolderCreate(FolderBase):
    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        name = name.strip()
        if not name:
            raise ValueError("Folder name cannot be empty or whitespace-only")
        return name


class FolderUpdate(FolderCreate):
    pass

class FolderResponse(FolderBase):
    id: int
    owner_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Audit Log Schemas
class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    action: str
    target_type: str
    target_id: Optional[int] = None
    target_name: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
