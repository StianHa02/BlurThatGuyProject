from storage import get_job_result, get_tracks, store_job_result, store_tracks


class TestTrackStorage:
    def test_store_and_get(self):
        tracks = [{"id": 1, "frames": []}]
        store_tracks("vid-1", tracks)
        assert get_tracks("vid-1") == tracks

    def test_get_missing_returns_none(self):
        assert get_tracks("nonexistent-video") is None

    def test_overwrite(self):
        store_tracks("vid-2", [{"id": 1}])
        store_tracks("vid-2", [{"id": 2}])
        assert get_tracks("vid-2") == [{"id": 2}]


class TestJobResultStorage:
    def test_store_and_get(self):
        store_job_result("job-1", "vid-1", [{"id": 1}])
        result = get_job_result("job-1")
        assert result is not None
        assert result["video_id"] == "vid-1"
        assert result["results"] == [{"id": 1}]

    def test_get_missing_returns_none(self):
        assert get_job_result("nonexistent-job") is None
