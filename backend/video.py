import cv2
import numpy as np

FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

def detect_faces(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = FACE_CASCADE.detectMultiScale(gray, 1.3, 5)
    return faces

def blur_face(frame, box):
    x, y, w, h = box
    face = frame[y:y+h, x:x+w]
    face = cv2.GaussianBlur(face, (51, 51), 0)
    frame[y:y+h, x:x+w] = face
    return frame

def process_video(input_path, output_path, target_box):
    cap = cv2.VideoCapture(input_path)

    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS)

    out = cv2.VideoWriter(
        output_path,
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height)
    )

    tracker = cv2.TrackerCSRT_create()

    ret, first_frame = cap.read()
    if not ret:
        raise RuntimeError("Could not read video")

    tracker.init(first_frame, tuple(target_box))
    frame = blur_face(first_frame, target_box)
    out.write(frame)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        success, box = tracker.update(frame)
        if success:
            x, y, w, h = map(int, box)
            frame = blur_face(frame, (x, y, w, h))

        out.write(frame)

    cap.release()
    out.release()