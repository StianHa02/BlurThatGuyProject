import os

import pytest
from fastapi import HTTPException

from config import (
    get_allowed_origins,
    get_safe_video_path,
    validate_environment,
    validate_video_file,
    validate_video_id,
    TEMP_DIR,
)


# ---------------------------------------------------------------------------
# validate_video_id
# ---------------------------------------------------------------------------
class TestValidateVideoId:
    def test_valid_uuid(self):
        vid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        assert validate_video_id(vid) == vid

    def test_rejects_non_uuid(self):
        with pytest.raises(HTTPException) as exc:
            validate_video_id("not-a-uuid")
        assert exc.value.status_code == 400

    def test_rejects_path_traversal(self):
        with pytest.raises(HTTPException):
            validate_video_id("../../etc/passwd")

    def test_rejects_empty_string(self):
        with pytest.raises(HTTPException):
            validate_video_id("")


# ---------------------------------------------------------------------------
# get_safe_video_path
# ---------------------------------------------------------------------------
class TestGetSafeVideoPath:
    def test_returns_path_in_temp_dir(self):
        vid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        path = get_safe_video_path(vid, ".mp4")
        assert path.parent == TEMP_DIR
        assert path.name == f"{vid}.mp4"

    def test_custom_suffix(self):
        vid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        path = get_safe_video_path(vid, "_blurred.mp4")
        assert path.name.endswith("_blurred.mp4")

    def test_rejects_invalid_id(self):
        with pytest.raises(HTTPException):
            get_safe_video_path("../hack", ".mp4")


# ---------------------------------------------------------------------------
# validate_video_file
# ---------------------------------------------------------------------------
class TestValidateVideoFile:
    def test_accepts_mp4(self):
        validate_video_file("video.mp4", "video/mp4")

    def test_accepts_webm(self):
        validate_video_file("clip.webm", "video/webm")

    def test_accepts_mov(self):
        validate_video_file("clip.MOV", "video/quicktime")

    def test_rejects_bad_extension(self):
        with pytest.raises(HTTPException) as exc:
            validate_video_file("hack.exe", "video/mp4")
        assert exc.value.status_code == 400

    def test_rejects_bad_mimetype(self):
        with pytest.raises(HTTPException) as exc:
            validate_video_file("video.mp4", "application/json")
        assert exc.value.status_code == 400

    def test_rejects_no_filename(self):
        with pytest.raises(HTTPException):
            validate_video_file(None, "video/mp4")

    def test_none_mimetype_accepted(self):
        validate_video_file("video.mp4", None)


# ---------------------------------------------------------------------------
# validate_environment
# ---------------------------------------------------------------------------
class TestValidateEnvironment:
    def test_raises_without_api_key(self, monkeypatch):
        monkeypatch.delenv("API_KEY", raising=False)
        monkeypatch.delenv("DEV_MODE", raising=False)
        with pytest.raises(RuntimeError):
            validate_environment()

    def test_dev_mode_allows_no_key(self, monkeypatch):
        monkeypatch.delenv("API_KEY", raising=False)
        monkeypatch.setenv("DEV_MODE", "true")
        validate_environment()

    def test_api_key_set(self, monkeypatch):
        monkeypatch.setenv("API_KEY", "secret123")
        validate_environment()


# ---------------------------------------------------------------------------
# get_allowed_origins
# ---------------------------------------------------------------------------
class TestGetAllowedOrigins:
    def test_defaults_to_localhost(self, monkeypatch):
        monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
        origins = get_allowed_origins()
        assert "http://localhost:3000" in origins

    def test_parses_csv(self, monkeypatch):
        monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.com, https://b.com")
        origins = get_allowed_origins()
        assert origins == ["https://a.com", "https://b.com"]

    def test_rejects_wildcard(self, monkeypatch):
        monkeypatch.setenv("ALLOWED_ORIGINS", "*")
        with pytest.raises(ValueError):
            get_allowed_origins()
