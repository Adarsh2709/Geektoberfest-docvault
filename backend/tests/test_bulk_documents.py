import unittest
import os
import tempfile
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth, models
from app.database import Base, get_db
from app.routes import documents


class BulkDocumentTests(unittest.TestCase):
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

        self.temp_dir = tempfile.TemporaryDirectory()
        self.file_alice1 = os.path.join(self.temp_dir.name, "doc1.txt")
        self.file_alice2 = os.path.join(self.temp_dir.name, "doc2.txt")
        self.file_bob = os.path.join(self.temp_dir.name, "doc3.txt")
        for f in (self.file_alice1, self.file_alice2, self.file_bob):
            with open(f, "w") as fp:
                fp.write("dummy content")

        self.doc1 = models.Document(
            filename="u1.txt", original_filename="report1.pdf",
            file_path=self.file_alice1, file_size=100, content_type="application/pdf",
            owner_id=self.alice.id
        )
        self.doc2 = models.Document(
            filename="u2.txt", original_filename="report2.pdf",
            file_path=self.file_alice2, file_size=200, content_type="application/pdf",
            owner_id=self.alice.id
        )
        self.doc_bob = models.Document(
            filename="u3.txt", original_filename="bobs_secret.pdf",
            file_path=self.file_bob, file_size=300, content_type="application/pdf",
            owner_id=self.bob.id
        )
        self.db.add_all([self.doc1, self.doc2, self.doc_bob])
        self.db.commit()
        self.db.refresh(self.doc1)
        self.db.refresh(self.doc2)
        self.db.refresh(self.doc_bob)

        def test_db():
            yield self.db

        app = FastAPI()
        app.include_router(documents.router, prefix="/documents")
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.client.headers["Authorization"] = "Bearer " + auth.create_access_token({"sub": self.alice.username})

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_bulk_delete_successful(self):
        res = self.client.post("/documents/bulk-delete", json={"document_ids": [self.doc1.id, self.doc2.id]})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_requested"], 2)
        self.assertEqual(data["total_deleted"], 2)
        self.assertEqual(sorted(data["deleted_ids"]), sorted([self.doc1.id, self.doc2.id]))
        self.assertEqual(data["failed"], [])

        # Check DB
        remaining = self.db.query(models.Document).filter(models.Document.owner_id == self.alice.id).count()
        self.assertEqual(remaining, 0)
        # Check files removed
        self.assertFalse(os.path.exists(self.file_alice1))
        self.assertFalse(os.path.exists(self.file_alice2))

    def test_bulk_delete_authorization_enforced(self):
        # Alice tries to delete Bob's document
        res = self.client.post("/documents/bulk-delete", json={"document_ids": [self.doc_bob.id]})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_requested"], 1)
        self.assertEqual(data["total_deleted"], 0)
        self.assertEqual(len(data["failed"]), 1)
        self.assertEqual(data["failed"][0]["id"], self.doc_bob.id)
        self.assertIn("denied", data["failed"][0]["reason"].lower())

        # Verify Bob's document still exists
        bob_doc = self.db.query(models.Document).filter(models.Document.id == self.doc_bob.id).first()
        self.assertIsNotNone(bob_doc)
        self.assertTrue(os.path.exists(self.file_bob))

    def test_bulk_delete_partial_failure(self):
        # Alice tries to delete her own doc, a non-existent doc, and Bob's doc
        non_existent_id = 9999
        res = self.client.post(
            "/documents/bulk-delete",
            json={"document_ids": [self.doc1.id, non_existent_id, self.doc_bob.id]}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_requested"], 3)
        self.assertEqual(data["total_deleted"], 1)
        self.assertEqual(data["deleted_ids"], [self.doc1.id])
        self.assertEqual(len(data["failed"]), 2)

        failed_map = {f["id"]: f["reason"] for f in data["failed"]}
        self.assertIn(non_existent_id, failed_map)
        self.assertIn(self.doc_bob.id, failed_map)

    def test_bulk_delete_audit_logging(self):
        res = self.client.post("/documents/bulk-delete", json={"document_ids": [self.doc1.id]})
        self.assertEqual(res.status_code, 200)

        logs = self.db.query(models.AuditLog).filter(
            models.AuditLog.user_id == self.alice.id,
            models.AuditLog.action == "bulk_delete"
        ).all()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].target_id, self.doc1.id)
        self.assertEqual(logs[0].target_name, "report1.pdf")
