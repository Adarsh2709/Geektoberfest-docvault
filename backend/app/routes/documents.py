from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import shutil
from .. import models, schemas, auth
from ..database import get_db
from ..audit_logger import log_event
from ..access import get_owned_document, get_owned_folder

router = APIRouter()
UPLOAD_DIR = "uploads"

MAX_FILE_SIZE = 10 * 1024 * 1024 # 10 MB

@router.post("/upload", response_model=schemas.DocumentResponse)
def upload_document(
    request: Request,
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Read file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max size is 10MB.")

    # Check folder if provided
    if folder_id:
        folder = get_owned_folder(db, folder_id, current_user)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found or you don't have access")

    # Generate unique filename to avoid conflicts
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    new_doc = models.Document(
        filename=unique_filename,
        original_filename=file.filename,
        file_path=file_path,
        file_size=file_size,
        content_type=file.content_type,
        folder_id=folder_id,
        owner_id=current_user.id
    )

    db.add(new_doc)
    db.flush()  # assign new_doc.id before logging

    log_event(
        db,
        user_id=current_user.id,
        action="upload",
        target_type="document",
        target_id=new_doc.id,
        target_name=file.filename,
        ip_address=request.client.host if request.client else None,
    )

    db.commit()
    db.refresh(new_doc)
    return new_doc

# fixed : 
@router.get("/", response_model=List[schemas.DocumentResponse])
def get_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
    file_type: Optional[str] = None,
    sort_by: Optional[str] = "date_desc",  # NEW
    folder_id: Optional[int] = None,
):
    query = db.query(models.Document).filter(models.Document.owner_id == current_user.id)

    # Folder filter: a folder you don't own is a 404, not an empty list
    if folder_id is not None:
        if not get_owned_folder(db, folder_id, current_user):
            raise HTTPException(status_code=404, detail="Folder not found")
        query = query.filter(models.Document.folder_id == folder_id)

    # File type filter
    if file_type and file_type.lower() != "all":
        query = query.filter(models.Document.content_type.ilike(f"%{file_type}%"))

    # Sorting options (Issue #7)
    if sort_by == "name_asc":
        query = query.order_by(models.Document.original_filename.asc())
    elif sort_by == "name_desc":
        query = query.order_by(models.Document.original_filename.desc())
    elif sort_by == "date_asc":
        query = query.order_by(models.Document.created_at.asc())
    else:
        # Default: newest first
        query = query.order_by(models.Document.created_at.desc())

    return query.all()
@router.get("/search", response_model=List[schemas.DocumentResponse])
def search_documents(q: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if not q:
        return []
    # Search by original_filename, only for this user
    return db.query(models.Document).filter(
        models.Document.owner_id == current_user.id,
        models.Document.original_filename.ilike(f"%{q}%")
    ).all()

@router.get("/{doc_id}/download")
def download_document(request: Request, doc_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = get_owned_document(db, doc_id, current_user)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    log_event(
        db,
        user_id=current_user.id,
        action="download",
        target_type="document",
        target_id=doc.id,
        target_name=doc.original_filename,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return FileResponse(
        path=doc.file_path,
        filename=doc.original_filename,
        media_type=doc.content_type
    )

@router.post("/bulk-delete", response_model=schemas.BulkDeleteResponse)
def bulk_delete_documents(
    request: Request,
    payload: schemas.BulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    deleted_ids = []
    failed = []

    for doc_id in payload.document_ids:
        doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
        if not doc:
            failed.append(schemas.BulkDeleteFailure(id=doc_id, reason="Document not found"))
            continue

        if doc.owner_id != current_user.id:
            failed.append(schemas.BulkDeleteFailure(id=doc_id, reason="Access denied"))
            continue

        doc_name = doc.original_filename
        if os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except OSError:
                pass

        db.delete(doc)
        db.flush()

        log_event(
            db,
            user_id=current_user.id,
            action="bulk_delete",
            target_type="document",
            target_id=doc_id,
            target_name=doc_name,
            ip_address=request.client.host if request.client else None,
        )
        deleted_ids.append(doc_id)

    db.commit()

    return schemas.BulkDeleteResponse(
        deleted_ids=deleted_ids,
        failed=failed,
        total_requested=len(payload.document_ids),
        total_deleted=len(deleted_ids),
    )

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(request: Request, doc_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = get_owned_document(db, doc_id, current_user)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Capture name before deletion so the audit record is meaningful
    doc_name = doc.original_filename

    # Remove file from disk
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.flush()

    log_event(
        db,
        user_id=current_user.id,
        action="delete",
        target_type="document",
        target_id=doc_id,
        target_name=doc_name,
        ip_address=request.client.host if request.client else None,
    )

    db.commit()
    return None
