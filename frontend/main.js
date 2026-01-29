let selectedBox = null;
let faces = [];

function upload() {
  const file = document.getElementById("videoInput").files[0];
  const form = new FormData();
  form.append("video", file);

  fetch("/upload", { method: "POST", body: form })
    .then(() => loadFrame());
}

function loadFrame() {
  const img = document.getElementById("frame");
  img.src = "/frame?" + Date.now();
  img.onload = () => loadFaces();
}

function loadFaces() {
  fetch("/faces")
    .then(res => res.json())
    .then(data => {
      faces = data.faces;
      drawFaces();
    });
}

function drawFaces() {
  const img = document.getElementById("frame");
  const canvas = document.getElementById("overlay");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;

  faces.forEach(f => {
    ctx.strokeRect(f[0], f[1], f[2], f[3]);
  });

  canvas.onclick = e => {
    const x = e.offsetX;
    const y = e.offsetY;
    selectedBox = faces.find(
      f => x > f[0] && x < f[0]+f[2] && y > f[1] && y < f[1]+f[3]
    );
    alert("Face selected");
  };
}

function process() {
  fetch("/process", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ box: selectedBox })
  }).then(() => {
    document.getElementById("result").src = "/result?" + Date.now();
  });
}