# Install InfiniteX on Android (PWA)

## Current delivery type

InfiniteX is being prepared as an installable Progressive Web App (PWA). It is not an APK. This guide applies only after the implementation branch has been reviewed and deployed to an HTTPS origin by an authorized maintainer. No deployment is performed by this project task.

## Install steps

1. Open the approved HTTPS InfiniteX site in Chrome on Android.
2. Wait for the page to finish loading while online.
3. Open Chrome's menu.
4. Choose **Install app** or **Add to Home screen** (wording varies by Chrome version).
5. Confirm the installation prompt.
6. Launch InfiniteX from the Android home screen or app drawer.

## Offline behavior

The service worker caches the public application shell and same-origin static assets. API paths are excluded. Dynamic backend data, AI provider responses, authentication and remote integrations are not made available offline by this static shell cache.

## Safety and limitations

- Do not install unofficial or unknown builds.
- Verify the HTTPS origin and release source before installation.
- Do not enter provider secrets into the demo workspace.
- An installable PWA is not a native APK.
- The application has not been independently tested on the user's physical Android device.
- A later APK requires a separate Capacitor/native Android plan, build environment, signing review and explicit release approval.
