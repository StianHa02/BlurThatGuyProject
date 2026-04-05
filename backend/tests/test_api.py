import os
import io

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _dev_mode(monkeypatch):
    """Run all API tests in DEV_MODE so no API key is needed."""
    monkeypatch.setenv("DEV_MODE", "true")


@pytest.fixture()
def client(monkeypatch):
    """Create a fresh TestClient, skipping heavy model loading."""
    monkeypatch.setenv("DEV_MODE", "true")

    # Stub out heavy model initializers so tests don't need ONNX models
    import pipeline.detector as det_mod
    import pipeline.reid as reid_mod

    monkeypatch.setattr(det_mod, "get_face_detector", lambda: None)
    monkeypatch.setattr(reid_mod, "get_reid_model", lambda: None)

    # Re-import app with stubs in place
    from main import app

    return TestClient(app)


class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "model" in data


class TestUploadValidation:
    def test_rejects_non_video_file(self, client):
        resp = client.post(
            "/upload-video",
            files={"file": ("hack.exe", io.BytesIO(b"\x00" * 64), "application/octet-stream")},
        )
        assert resp.status_code == 400

    def test_rejects_empty_filename(self, client):
        resp = client.post(
            "/upload-video",
            files={"file": ("", io.BytesIO(b"\x00" * 64), "video/mp4")},
        )
        assert resp.status_code in (400, 422)


class TestDownload:
    def test_download_missing_video_404(self, client):
        resp = client.get("/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890")
        assert resp.status_code == 404


class TestJobStatus:
    def test_unknown_job_404(self, client):
        resp = client.get("/job/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status")
        # If Redis is unavailable returns 503, otherwise 404
        assert resp.status_code in (404, 503)
