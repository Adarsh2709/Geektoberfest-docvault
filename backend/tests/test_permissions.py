"""
Tests for folder and document access control (issue #12).

Run from the backend/ directory with:
    python -m unittest discover -s tests -v
"""

import io
import os
import tempfile
import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth, models
from app.database import Base, get_db
from app.routes import documents, folders


class PermissionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add_all([
            models.User(username="alice", email="alice@example.com", hashed_password="unused"),
            models.User(username="bob", email="bob@example.com", hashed_password="unused"),
        ])
        self.db.commit()
        self.alice, self.bob = self.db.query(models.User).order_by(models.User.id).all()

        # Keep uploaded files out of the real uploads/ directory
        self.upload_dir = tempfile.TemporaryDirectory()
        patcher = mock.patch.object(documents, "UPLOAD_DIR", self.upload_dir.name)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.upload_dir.cleanup)

        def test_db():
            yield self.db

        app = FastAPI()
        app.include_router(documents.router, prefix="/documents")
        app.include_router(folders.router, prefix="/folders")
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.as_user(self.alice)

        self.alice_folder = self.seed_folder(self.alice, "Alice private")
        self.alice_doc = self.seed_document(self.alice, "plan.pdf", self.alice_folder.id)
        self.alice_loose_doc = self.seed_document(self.alice, "loose.txt", None)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def as_user(self, user):
        self.client.headers["Authorization"] = "Bearer " + auth.create_access_token({"sub": user.username})

    def seed_folder(self, owner, name):
        folder = models.Folder(name=name, owner_id=owner.id)
        self.db.add(folder)
        self.db.commit()
        self.db.refresh(folder)
        return folder

    def seed_document(self, owner, filename, folder_id):
        path = os.path.join(self.upload_dir.name, filename)
        open(path, "wb").close()
        doc = models.Document(
            filename=filename, original_filename=filename, file_path=path,
            file_size=0, content_type="text/plain", folder_id=folder_id, owner_id=owner.id,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def upload_into(self, folder_id):
        return self.client.post(
            "/documents/upload",
            files={"file": ("new.txt", io.BytesIO(b"hi"), "text/plain")},
            data={"folder_id": folder_id},
        )


# ===========================================================================
# Allowed operations: owners keep full access to their own data
# ===========================================================================

class TestOwnerAccess(PermissionTests):

    def test_owner_lists_documents_in_own_folder(self):
        names = [d["original_filename"] for d in self.client.get(f"/documents/?folder_id={self.alice_folder.id}").json()]
        self.assertEqual(names, ["plan.pdf"])

    def test_folder_filter_excludes_loose_documents(self):
        names = [d["original_filename"] for d in self.client.get("/documents/").json()]
        self.assertIn("loose.txt", names)
        folder_names = [d["original_filename"] for d in self.client.get(f"/documents/?folder_id={self.alice_folder.id}").json()]
        self.assertNotIn("loose.txt", folder_names)

    def test_owner_can_download_and_delete(self):
        self.assertEqual(self.client.get(f"/documents/{self.alice_doc.id}/download").status_code, 200)
        self.assertEqual(self.client.delete(f"/documents/{self.alice_doc.id}").status_code, 204)

    def test_owner_can_upload_into_own_folder(self):
        response = self.upload_into(self.alice_folder.id)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["folder_id"], self.alice_folder.id)

    def test_owner_can_rename_and_delete_own_folder(self):
        self.assertEqual(self.client.patch(f"/folders/{self.alice_folder.id}", json={"name": "Renamed"}).status_code, 200)
        self.assertEqual(self.client.delete(f"/folders/{self.alice_folder.id}").status_code, 204)


# ===========================================================================
# Denied operations: other users cannot reach data by changing IDs
# ===========================================================================

class TestOtherUserIsDenied(PermissionTests):

    def setUp(self):
        super().setUp()
        self.as_user(self.bob)

    def test_cannot_list_documents_of_another_users_folder(self):
        response = self.client.get(f"/documents/?folder_id={self.alice_folder.id}")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("plan.pdf", response.text)

    def test_cannot_download_another_users_document(self):
        self.assertEqual(self.client.get(f"/documents/{self.alice_doc.id}/download").status_code, 404)

    def test_cannot_delete_another_users_document(self):
        self.assertEqual(self.client.delete(f"/documents/{self.alice_doc.id}").status_code, 404)
        self.assertIsNotNone(self.db.get(models.Document, self.alice_doc.id))
        self.assertTrue(os.path.exists(self.alice_doc.file_path))

    def test_cannot_upload_into_another_users_folder(self):
        response = self.upload_into(self.alice_folder.id)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.db.query(models.Document).filter_by(owner_id=self.bob.id).count(), 0)

    def test_cannot_rename_or_delete_another_users_folder(self):
        self.assertEqual(self.client.patch(f"/folders/{self.alice_folder.id}", json={"name": "Hacked"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/folders/{self.alice_folder.id}").status_code, 404)
        self.db.refresh(self.alice_folder)
        self.assertEqual(self.alice_folder.name, "Alice private")

    def test_foreign_and_missing_ids_look_identical(self):
        """A 404 for another user's ID must match a 404 for an ID that does not exist."""
        for method, path in (
            ("get", "/documents/{}/download"),
            ("delete", "/documents/{}"),
        ):
            with self.subTest(path=path):
                foreign = getattr(self.client, method)(path.format(self.alice_doc.id))
                missing = getattr(self.client, method)(path.format(99999))
                self.assertEqual(foreign.status_code, missing.status_code)
                self.assertEqual(foreign.json(), missing.json())

    def test_unauthenticated_requests_are_rejected(self):
        self.client.headers.pop("Authorization")
        self.assertEqual(self.client.get(f"/documents/?folder_id={self.alice_folder.id}").status_code, 401)
        self.assertEqual(self.client.get(f"/documents/{self.alice_doc.id}/download").status_code, 401)


# ===========================================================================
# Invariant: a document can only sit in a folder owned by the same user
# ===========================================================================

class TestDocumentFolderOwnership(PermissionTests):

    def test_document_folder_has_same_owner_as_document(self):
        self.as_user(self.bob)
        bob_folder = self.seed_folder(self.bob, "Bob folder")
        self.assertEqual(self.upload_into(bob_folder.id).status_code, 200)
        self.as_user(self.alice)
        self.assertEqual(self.upload_into(bob_folder.id).status_code, 404)

        for doc in self.db.query(models.Document).filter(models.Document.folder_id.isnot(None)):
            folder = self.db.get(models.Folder, doc.folder_id)
            self.assertEqual(folder.owner_id, doc.owner_id)


if __name__ == "__main__":
    unittest.main()
