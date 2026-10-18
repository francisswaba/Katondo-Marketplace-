# Katondo mobile app

The Expo Router app provides the initial iOS and Android catalogue shell and uses the shared API contracts. It follows operating system typography, including San Francisco on Apple platforms when available.

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to an API address reachable from the device. `localhost` works for simulators configured on the development machine; physical phones need the computer’s LAN address. Start with `npm run dev:mobile` from the repository root. `npm run build --workspace @katondo/mobile` exports JavaScript bundles for iOS and Android.

Authentication screens, seller flows, media upload, checkout, and notifications are not implemented yet.
