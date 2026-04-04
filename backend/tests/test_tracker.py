import numpy as np

from pipeline.tracker import (
    TrackLookup,
    _iou,
    _center_distance,
    _similar_size,
    track_detections,
)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
class TestIoU:
    def test_identical_boxes(self):
        assert _iou([0, 0, 10, 10], [0, 0, 10, 10]) == pytest.approx(1.0)

    def test_no_overlap(self):
        assert _iou([0, 0, 5, 5], [10, 10, 5, 5]) == 0.0

    def test_partial_overlap(self):
        iou = _iou([0, 0, 10, 10], [5, 5, 10, 10])
        assert 0.0 < iou < 1.0

    def test_zero_area(self):
        assert _iou([0, 0, 0, 0], [0, 0, 10, 10]) == 0.0


class TestCenterDistance:
    def test_same_box(self):
        assert _center_distance([0, 0, 10, 10], [0, 0, 10, 10]) == 0.0

    def test_distant_boxes(self):
        assert _center_distance([0, 0, 10, 10], [100, 100, 10, 10]) > 1.0


class TestSimilarSize:
    def test_identical_size(self):
        assert _similar_size([0, 0, 10, 10], [5, 5, 10, 10]) is True

    def test_very_different_size(self):
        assert _similar_size([0, 0, 100, 100], [0, 0, 2, 2]) is False


# ---------------------------------------------------------------------------
# TrackLookup
# ---------------------------------------------------------------------------
class TestTrackLookup:
    def test_exact_frame(self):
        frames = [
            {"frameIndex": 0, "bbox": [0, 0, 10, 10], "score": 0.9},
            {"frameIndex": 10, "bbox": [20, 20, 10, 10], "score": 0.8},
        ]
        lookup = TrackLookup(frames)
        result = lookup.get(0)
        assert result is not None
        assert result["bbox"] == [0, 0, 10, 10]

    def test_interpolated_frame(self):
        frames = [
            {"frameIndex": 0, "bbox": [0, 0, 10, 10], "score": 0.9},
            {"frameIndex": 10, "bbox": [10, 10, 10, 10], "score": 0.8},
        ]
        lookup = TrackLookup(frames)
        result = lookup.get(5)
        assert result is not None
        assert result["bbox"][0] == pytest.approx(5.0)
        assert result["bbox"][1] == pytest.approx(5.0)

    def test_out_of_range(self):
        frames = [{"frameIndex": 5, "bbox": [0, 0, 10, 10], "score": 0.9}]
        lookup = TrackLookup(frames)
        assert lookup.get(0) is None
        assert lookup.get(100) is None

    def test_gap_too_large(self):
        frames = [
            {"frameIndex": 0, "bbox": [0, 0, 10, 10], "score": 0.9},
            {"frameIndex": 100, "bbox": [10, 10, 10, 10], "score": 0.8},
        ]
        lookup = TrackLookup(frames, max_gap=36)
        assert lookup.get(50) is None

    def test_contains(self):
        frames = [
            {"frameIndex": 0, "bbox": [0, 0, 10, 10], "score": 0.9},
            {"frameIndex": 10, "bbox": [10, 10, 10, 10], "score": 0.8},
        ]
        lookup = TrackLookup(frames)
        assert 0 in lookup
        assert 5 in lookup
        assert 100 not in lookup


# ---------------------------------------------------------------------------
# track_detections end-to-end
# ---------------------------------------------------------------------------
class TestTrackDetections:
    def _make_detections(self, frame_count=20, x_step=1):
        """Generate synthetic face moving right across frames."""
        return {
            i: [{"bbox": [i * x_step, 50, 40, 40], "score": 0.95}]
            for i in range(frame_count)
        }

    def test_single_face_produces_one_track(self):
        dets = self._make_detections(frame_count=20, x_step=1)
        tracks = track_detections(dets)
        assert len(tracks) == 1
        assert len(tracks[0]["frames"]) == 20

    def test_short_track_filtered(self):
        dets = {0: [{"bbox": [0, 0, 10, 10], "score": 0.9}]}
        tracks = track_detections(dets)
        assert len(tracks) == 0

    def test_two_distant_faces(self):
        dets = {}
        for i in range(20):
            dets[i] = [
                {"bbox": [10, 10, 30, 30], "score": 0.9},
                {"bbox": [500, 500, 30, 30], "score": 0.85},
            ]
        tracks = track_detections(dets)
        assert len(tracks) == 2

    def test_scene_cut_breaks_track(self):
        dets = self._make_detections(frame_count=20, x_step=0)
        cuts = {10}
        tracks = track_detections(dets, cut_frames=cuts)
        assert len(tracks) >= 2

    def test_output_has_required_keys(self):
        dets = self._make_detections(frame_count=20, x_step=1)
        tracks = track_detections(dets)
        t = tracks[0]
        assert "id" in t
        assert "frames" in t
        assert "startFrame" in t
        assert "endFrame" in t
        assert "thumbnailFrameIndex" in t


import pytest
