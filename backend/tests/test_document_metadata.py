import unittest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth, models
from app.database import Base, get_db
from app.routes import documents


class DocumentMetadataTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        self.alice = models.User(username="alice", email="alice@example.com", hashed_password="pw")
        self.bob = models.User(username="bob", email="bob@example.com", hashed_password="pw")
        self.db.add_all([self.alice, self.bob])
        self.db.commit()
        self.db.refresh(self.alice)
        self.db.refresh(self.bob)

        self.folder = models.Folder(name="Invoices", owner_id=self.alice.id)
        self.db.add(self.folder)
        self.db.commit()
        self.db.refresh(self.folder)

        self.doc1 = models.Document(
            filename="u1.pdf",
            original_filename="Invoice_2026.pdf",
            file_path="uploads/u1.pdf",
            file_size=1048576,
            content_type="application/pdf",
            folder_id=self.folder.id,
            owner_id=self.alice.id
        )
        self.doc2_minimal = models.Document(
            filename="u2.txt",
            original_filename="notes.txt",
            file_path="uploads/u2.txt",
            file_size=512,
            content_type=None,
            folder_id=None,
            owner_id=self.alice.id
        )
        self.doc_bob = models.Document(
            filename="u3.pdf",
            original_filename="bobs_payroll.pdf",
            file_path="uploads/u3.pdf",
            file_size=2048,
            content_type="application/pdf",
            folder_id=None,
            owner_id=self.bob.id
        )
        self.db.add_all([self.doc1, self.doc2_minimal, self.doc_bob])
        self.db.commit()
        self.db.refresh(self.doc1)
        self.db.refresh(self.doc2_minimal)
        self.db.refresh(self.doc_bob)

        def test_db():
            yield self.db

        app = FastAPI()
        app.include_router(documents.router, prefix="/documents")
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def auth_headers(self, user):
        return {"Authorization": "Bearer " + auth.create_access_token({"sub": user.username})}

    def test_get_document_metadata_success(self):
        res = self.client.get(
            f"/documents/{self.doc1.id}",
            headers=self.auth_headers(self.alice)
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], self.doc1.id)
        self.assertEqual(data["original_filename"], "Invoice_2026.pdf")
        self.assertEqual(data["file_size"], 1048576)
        self.assertEqual(data["content_type"], "application/pdf")
        self.assertEqual(data["folder_id"], self.folder.id)
        self.assertIn("created_at", data)

    def test_get_document_metadata_optional_fields_handled(self):
        res = self.client.get(
            f"/documents/{self.doc2_minimal.id}",
            headers=self.auth_headers(self.alice)
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], self.doc2_minimal.id)
        self.assertIsNone(data["folder_id"])
        self.assertIsNone(data["content_type"])
        self.assertEqual(data["file_size"], 512)

    def test_get_document_metadata_unauthorized(self):
        # Alice tries to access Bob's document metadata -> 403
        res = self.client.get(
            f"/documents/{self.doc_bob.id}",
            headers=self.auth_headers(self.alice)
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("authorized", res.json()["detail"].lower())

    def test_get_document_metadata_not_found(self):
        res = self.client.get(
            "/documents/99999",
            headers=self.auth_headers(self.alice)
        )
        self.assertEqual(res.status_code, 404)
