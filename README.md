# IMAX 3D Simulator

An interactive, browser-based 3D cinema experience inspired by large-format IMAX and ScreenX theatres. Explore the virtual auditorium, choose a viewpoint, customize the screen and ambience, and play a video from your device.

## Experience

- Immersive 3D cinema environment rendered with Three.js.
- 15 selectable seat viewpoints.
- IMAX screen and optional ScreenX side-screen experience.
- Screen aspect ratio and curvature controls.
- Cinema ambience, lighting and rim-glow controls.
- Local video upload and in-page playback controls.
- Responsive layouts for desktop, tablet and mobile browsers.
- Fullscreen and device-orientation controls where supported.
- Saved display preferences in the browser.

## Try it

Open the published GitHub Pages site using the URL shown in the repository's Settings → Pages section. The site is a static web app; no account is required to explore the simulator.

## Run locally

Serve the repository root with any local static HTTP server, then open the local address in a modern browser. The simulator loads Three.js, OrbitControls, Tailwind CSS and Font Awesome from their public CDNs, so an internet connection is required for those libraries.

## Validation

```bash
npm install
npm test
```

The smoke test checks the document structure, key cinema controls, branded icon, inline JavaScript syntax, launch metadata and selected regression safeguards.

## Browser notes

- Fullscreen and orientation locking depend on browser/device support and may require a secure context (HTTPS) and a user gesture.
- Video playback depends on the browser's supported media formats and codecs.
- Uploaded videos are selected locally in the browser; this project does not provide a movie catalogue or host uploaded videos.
- Performance depends on the device GPU and the selected graphics quality.

## Project

- Main app: index.html
- Cinema icon and social preview: assets/
- Web app manifest: manifest.webmanifest
- Automated smoke test: scripts/smoke-test.mjs
- Android packaging configuration: capacitor.config.json

This project is an independent cinema simulator and is not affiliated with or endorsed by IMAX Corporation. IMAX and ScreenX are referenced descriptively as cinema-format names.
