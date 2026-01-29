from flask import Flask, request, send_file
import cv2
import os
from video import detect_faces, process_video

app = Flask(__name__, static_folder="../frontend", static_url_path="")

UPLOAD_DIR = "uploads"
OUTPUT_VIDEO = "output.mp4"

os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    video = request.files["video"]
    path = os.path.join(UPLOAD_DIR, "input.mp4")
    video.save(path)
    return {"status": "ok"}

@app.route("/frame")
def frame():
    cap = cv2.VideoCapture(os.path.join(UPLOAD_DIR, "input.mp4"))
    ret, frame = cap.read()
    cap.release()

    _, buffer = cv2.imencode(".jpg", frame)
    return buffer.tobytes(), 200, {"Content-Type": "image/jpeg"}

@app.route("/faces")
def faces():
    cap = cv2.VideoCapture(os.path.join(UPLOAD_DIR, "input.mp4"))
    ret, frame = cap.read()
    cap.release()

    faces = detect_faces(frame)
    return {"faces": [list(map(int, f)) for f in faces]}

@app.route("/process", methods=["POST"])
def process():
    box = request.json["box"]
    process_video(
        os.path.join(UPLOAD_DIR, "input.mp4"),
        OUTPUT_VIDEO,
        box
    )
    return {"status": "done"}

@app.route("/result")
def result():
    return send_file(OUTPUT_VIDEO, mimetype="video/mp4")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)