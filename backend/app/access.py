"""
Ownership checks shared by the folder and document routes.

Permission levels
-----------------
- owner: list, download, delete, rename and upload into a folder. This is the
  only level today. Documents belong to their owner, and a document may only be
  placed in a folder owned by the same user.
- none: the lookup returns None and the route answers 404, the same as for an ID
  that does not exist, so callers cannot probe for other users' IDs.

Sharing levels (read, write) will be added with document sharing (#11).
"""

from sqlalchemy.orm import Session
from . import models


def get_owned_folder(db: Session, folder_id: int, user: models.User) -> models.Folder | None:
    return db.query(models.Folder).filter(
        models.Folder.id == folder_id,
        models.Folder.owner_id == user.id,
    ).first()


def get_owned_document(db: Session, doc_id: int, user: models.User) -> models.Document | None:
    return db.query(models.Document).filter(
        models.Document.id == doc_id,
        models.Document.owner_id == user.id,
    ).first()
