import json
import queue
import shutil
import subprocess
import threading
import cv2
import numpy as np
from pathlib import Path
from typing import Any, Callable


def detect_stream_generator(
        *,
        r,
        job_id: str,
        video_id: str,
        video_path: Path,
        sample_rate: int,
        stream_budget: int | None,
        stream_token,
        process_detection: Callable[..., list[dict]],
        touch_job_heartbeat: Callable[..., None],
        set_job_status: Callable[..., None],
        unregister_cancel_token: Callable[[str], None],
        on_job_finish: Callable[..., None],
        logger,
):
    message_queue: queue.Queue = queue.Queue()

    def run_stream_job() -> None:
        try:
            def _stream_progress(p: float) -> None:
                message_queue.put(json.dumps({"type": "progress", "progress": p}) + "\n")
                touch_job_heartbeat(r, job_id)

            tracks = process_detection(
                video_id,
                video_path,
                sample_rate,
                progress_cb=_stream_progress,
                thread_budget=int(stream_budget) if stream_budget else None,
                cancel_token=stream_token,
            )
            message_queue.put(json.dumps({"type": "results", "results": tracks}) + "\n")
            set_job_status(r, job_id, "done")
        except InterruptedError:
            logger.info(f"Streaming job {job_id} cancelled during processing")
            message_queue.put(json.dumps({"type": "error", "error": "Job cancelled"}) + "\n")
        except Exception as e:
            logger.error(f"Video detection stream error: {e}")
            set_job_status(r, job_id, "error")
            message_queue.put(json.dumps({"type": "error", "error": str(e)}) + "\n")
        finally:
            unregister_cancel_token(job_id)
            on_job_finish(r, job_id)
            message_queue.put(None)

    threading.Thread(target=run_stream_job, daemon=True).start()

    try:
        while True:
            try:
                msg = message_queue.get(timeout=5.0)
            except queue.Empty:
                yield ""  # keepalive
                continue
            if msg is None:
                break
            yield msg
    except GeneratorExit:
        stream_token.cancel()
        logger.info(f"Client disconnected from stream for job {job_id}, cancelling")


def export_stream_generator(
        *,
        video_id: str,
        export_request,
        tracks: list[dict],
        input_path: Path,
        output_path: Path,
        precompute_track_lookups: Callable[..., Any],
        get_thread_pool: Callable[[], Any],
        detector_pool_size: int,
        get_encoder: Callable[[], str],
        encoder_args: dict[str, list[str]],
        get_safe_video_path: Callable[[str, str], Path],
        blur_frame: Callable[..., Any],
        logger,
):
    cap = out = ffmpeg_proc = dec = None
    stderr_chunks: list[bytes] = []
    stderr_thread: threading.Thread | None = None
    try:
        selected_set = set(int(i) for i in export_request.selectedTrackIds)
        tracks_map = {t["id"]: t for t in tracks if int(t["id"]) in selected_set}
        logger.info(
            f"Export {video_id}: requested ids={sorted(selected_set)}, "
            f"matched {len(tracks_map)}/{len(tracks)} stored tracks"
        )
        if not tracks_map:
            logger.warning(
                f"Export {video_id}: no tracks matched - stored ids sample: "
                f"{sorted(t['id'] for t in tracks)[:20]}"
            )

        cap = cv2.VideoCapture(str(input_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = max(int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), 1)
        cap.release()
        cap = None

        max_gap = 12 * max(export_request.sampleRate, 1)  # max_misses * sample_rate
        track_lookup_dicts = precompute_track_lookups([t["frames"] for t in tracks_map.values()], total_frames,
                                                      max_gap=max_gap)
        pad, target_blocks, blur_mode = export_request.padding, export_request.targetBlocks, export_request.blurMode
        pool = get_thread_pool()
        chunk: list[tuple] = []
        frames_written = 0
        chunk_size = min(detector_pool_size, 16)
        use_ffmpeg = shutil.which("ffmpeg") and width > 0 and height > 0

        yield json.dumps({"type": "progress", "progress": 5}) + "\n"

        if use_ffmpeg:
            enc = get_encoder()
            ffmpeg_proc = subprocess.Popen(
                [
                    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps),
                    "-i", "pipe:0", "-i", str(input_path),
                    *encoder_args[enc],
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0?", "-shortest",
                    str(output_path),
                ],
                stdin=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            def _drain_stderr() -> None:
                try:
                    for stderr_chunk in iter(lambda: ffmpeg_proc.stderr.read(4096), b""):
                        stderr_chunks.append(stderr_chunk)
                except Exception:
                    pass

            stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
            stderr_thread.start()
            dec = subprocess.Popen(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "fatal", "-i", str(input_path),
                    "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
        else:
            raw_path = get_safe_video_path(video_id, "_raw.mp4")
            out = cv2.VideoWriter(str(raw_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
            cap = cv2.VideoCapture(str(input_path))

        def write_frame(frame: np.ndarray) -> None:
            nonlocal frames_written
            if ffmpeg_proc:
                if ffmpeg_proc.poll() is not None:
                    err = b"".join(stderr_chunks).decode(errors="ignore")
                    raise RuntimeError(f"ffmpeg exited early: {err}")
                try:
                    ffmpeg_proc.stdin.write(frame.tobytes())
                except (BrokenPipeError, ValueError):
                    err = b"".join(stderr_chunks).decode(errors="ignore")
                    raise RuntimeError(f"ffmpeg pipe broken: {err}")
            else:
                out.write(frame)
            frames_written += 1

        def flush_chunk(chunk_items: list[tuple]) -> str:
            futs = [pool.submit(blur_frame, item) for item in chunk_items]
            for fut in futs:
                _, frame = fut.result()
                write_frame(frame)
            progress = min(70, round(5 + frames_written / total_frames * 65, 1))
            return json.dumps({"type": "progress", "progress": progress}) + "\n"

        frame_size = width * height * 3
        read_queue: queue.Queue = queue.Queue(maxsize=min(chunk_size * 3, 48))

        def _frame_reader() -> None:
            fi_r = 0
            try:
                if dec:
                    while True:
                        raw = dec.stdout.read(frame_size)
                        if not raw or len(raw) < frame_size:
                            break
                        frame = np.frombuffer(raw, np.uint8).reshape((height, width, 3)).copy()
                        read_queue.put((fi_r, frame))
                        fi_r += 1
                else:
                    while True:
                        ret, frame = cap.read()
                        if not ret:
                            break
                        read_queue.put((fi_r, frame))
                        fi_r += 1
            finally:
                read_queue.put(None)

        reader_thread = threading.Thread(target=_frame_reader, daemon=True)
        reader_thread.start()

        while True:
            item = read_queue.get()
            if item is None:
                break
            fi, frame = item

            if not any(fi in lu for lu in track_lookup_dicts):
                write_frame(frame)
                if frames_written % 30 == 0:
                    progress = min(70, round(5 + frames_written / total_frames * 65, 1))
                    yield json.dumps({"type": "progress", "progress": progress}) + "\n"
                continue

            chunk.append((fi, frame, track_lookup_dicts, pad, target_blocks, width, height, blur_mode))
            if len(chunk) >= chunk_size:
                yield flush_chunk(chunk)
                chunk = []

        reader_thread.join(timeout=30)
        if chunk:
            yield flush_chunk(chunk)
        if dec:
            dec.wait(timeout=30)

        yield json.dumps({"type": "progress", "progress": 75}) + "\n"

        if ffmpeg_proc:
            try:
                if ffmpeg_proc.stdin and not ffmpeg_proc.stdin.closed:
                    ffmpeg_proc.stdin.close()
            except Exception:
                pass
            try:
                ffmpeg_proc.wait(timeout=600)
                if stderr_thread:
                    stderr_thread.join(timeout=5)
                stderr_data = b"".join(stderr_chunks)
            except subprocess.TimeoutExpired:
                ffmpeg_proc.kill()
                ffmpeg_proc.wait()
                if stderr_thread:
                    stderr_thread.join(timeout=5)
                stderr_data = b"".join(stderr_chunks)
            if ffmpeg_proc.returncode != 0:
                logger.error(f"ffmpeg failed: {stderr_data.decode(errors='ignore')}")
                yield json.dumps({"type": "error", "error": "Failed to encode video"}) + "\n"
                return
        elif out:
            out.release()
            out = None
            raw_path = get_safe_video_path(video_id, "_raw.mp4")
            logger.warning("ffmpeg not found - serving uncompressed output")
            raw_path.rename(output_path)

        yield json.dumps({"type": "progress", "progress": 90}) + "\n"
        logger.info(f"Export complete: {video_id}")
        yield json.dumps({"type": "done"}) + "\n"

    except Exception as e:
        logger.error(f"Export error {video_id}: {e}")
        yield json.dumps({"type": "error", "error": str(e)}) + "\n"
    finally:
        if cap:
            cap.release()
        if out:
            out.release()
        if dec:
            try:
                dec.stdout.close()
            except Exception:
                pass
        if ffmpeg_proc:
            try:
                if ffmpeg_proc.stdin and not ffmpeg_proc.stdin.closed:
                    ffmpeg_proc.stdin.close()
            except Exception:
                pass
