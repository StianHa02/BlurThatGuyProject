This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

# Blur That Guy

Upload a video, detect faces using **OpenCV.js**, track them across frames, select a face, and blur/hide it during playback.

## Quick start

```bash
# Install dependencies
pnpm install

# Download the Haar cascade model (optional - loads from CDN if missing)
bash scripts/download-models.sh

# Start dev server
pnpm dev
```

Open **http://localhost:3000/upload** in Chrome.

## How to use

1. **Upload** an MP4 video
2. **Detect faces** - click the button and wait for scanning
3. **Select** the face track you want to hide
4. **Play** the video - the selected face will be blurred!

## Features

- **OpenCV.js Haar Cascade** — Classic, reliable face detection
- **Client-side** — All processing in browser, no server needed
- **Face tracking** — IOU + distance-based tracking across frames
- **Auto-select** — Automatically picks the main face (most frames)
- **Blur or black box** — Toggle between pixelated blur or solid black

## Tech stack

- Next.js 16 + React 19
- OpenCV.js (Haar Cascade face detector)
- Tailwind CSS

License: MIT
