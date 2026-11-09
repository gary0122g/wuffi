# Optional cloud membership

The Tauri desktop app connects to the existing wuffi-web backend at https://app.wuffi.app. The backend is maintained separately and is not included in this desktop repository.

Open Settings → AI, select Cloud AI, and sign in through the browser. Click Connect desktop to confirm the account; the desktop completes sign-in automatically. No manual code is needed. Pairing expires after 10 minutes and can be redeemed once. Desktop credentials are scoped to membership status, cloud AI and logout; they cannot access web document or billing APIs.

Credentials stay in Rust process memory and expire according to the server session policy. Closing the app requires signing in again. Signing out clears the local credential and requests server revocation. Provider API keys never enter the desktop client.

The cloud AI service uses the same account and quota as the web app. Local editing and Local AI remain free, offline-capable and independent of membership. Cloud results use the same explicit edit review as Local AI.
