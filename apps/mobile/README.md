# Katondo mobile app

The Expo Router app provides the initial iOS and Android catalogue shell and uses the shared API contracts. It follows operating system typography, including San Francisco on Apple platforms when available.

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` in `apps/mobile/.env` to addresses reachable from the device. `localhost` works for simulators configured on the development machine; physical phones need reachable network or HTTPS addresses. Start with `npm run dev:mobile` from the repository root. `npm run build --workspace @katondo/mobile` exports JavaScript bundles for iOS and Android. The team link opens the role-restricted web staff workspace.

Native authentication and seller flows are not implemented in the mobile app. Staff use the secured web workspace from the in-app team link. The API's authenticated routes remain gated pending identity-provider selection and approval of the active country's data-processing and hosting requirements. Zambia-specific approval remains required for the first launch. Media upload, checkout, and notifications are not implemented yet.
