# IMAX 3D Simulator

An interactive 3D IMAX and ScreenX cinema simulator with a local video player. The original web experience remains the source of truth; Android packaging wraps the same app rather than replacing the theatre or player.

## Preserved experience

- Existing 3D cinema environment and 15 seat viewpoints.
- IMAX screen and ScreenX side-screen experience.
- Screen curvature, ambience, lighting and rim-glow controls.
- Existing video upload, playback and audio-track systems.
- Video Library / normal player mode alongside the original IMAX theatre mode.

## Android APK build

The repository includes a Capacitor 8 Android packaging pipeline. It copies the existing static website into the generated www folder for the native Android WebView without moving or deleting source files.

### Build locally

```bash
npm install
npm run test
npm run build:web
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

The debug APK is generated at android/app/build/outputs/apk/debug/app-debug.apk.

### Build using GitHub Actions

After these changes are merged into main, open Actions → Build Android APK → Run workflow. Download the generated APK from the workflow run's Artifacts section.

## Important limitations

- This first Android packaging step embeds the existing app; it does not yet add a native MediaStore-based automatic phone video scanner or background audio service.
- Video format support depends on Android media codecs and the browser engine. MKV/AVI support is not guaranteed for every device.
- A debug APK is for testing. A signed release APK/AAB requires release signing configuration.

## Web validation

```bash
npm install
npm test
```

The simulator remains available as a static web app through GitHub Pages.
