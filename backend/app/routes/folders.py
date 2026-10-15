from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..access import get_owned_folder
from .. import models, schemas, auth
from ..database import get_db

router = APIRouter()

@router.post("/", response_model=schemas.FolderResponse)
def create_folder(folder: schemas.FolderCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_folder = db.query(models.Folder).filter(
        models.Folder.name == folder.name,
        models.Folder.owner_id == current_user.id
    ).first()
    if db_folder:
        raise HTTPException(status_code=400, detail="Folder already exists")
    
    new_folder = models.Folder(name=folder.name, owner_id=current_user.id)
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder

@router.get("/", response_model=List[schemas.FolderResponse])
def get_folders(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.Folder).filter(models.Folder.owner_id == current_user.id).all()


@router.patch("/{folder_id}", response_model=schemas.FolderResponse)
def rename_folder(folder_id: int, update: schemas.FolderUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    folder = get_owned_folder(db, folder_id, current_user)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    duplicate = db.query(models.Folder).filter(
        models.Folder.name == update.name,
        models.Folder.owner_id == current_user.id,
        models.Folder.id != folder_id
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Folder already exists")

    folder.name = update.name
    db.commit()
    db.refresh(folder)
    return folder

@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    folder = get_owned_folder(db, folder_id, current_user)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    db.delete(folder)
    db.commit()
    return None
