#!/bin/bash
# Download OpenCV Haar Cascade for face detection
# Run this script once while online

MODELS_DIR="public/models"
mkdir -p "$MODELS_DIR"

echo "Downloading OpenCV Haar Cascade face detector..."

curl -sL -o "$MODELS_DIR/haarcascade_frontalface_default.xml" \
  "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml"

if [ -f "$MODELS_DIR/haarcascade_frontalface_default.xml" ]; then
  size=$(wc -c < "$MODELS_DIR/haarcascade_frontalface_default.xml")
  if [ "$size" -gt 100000 ]; then
    echo "✓ Done! Haar cascade downloaded ($size bytes)"
  else
    echo "✗ File seems too small, download may have failed"
  fi
else
  echo "✗ Download failed"
fi
