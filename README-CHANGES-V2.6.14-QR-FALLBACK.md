# README Changes - V2.6.14 QR Fallback Patch

## What Changed

- Fixed the Open on phone modal so the link field and QR code do not go blank on the stable production Vercel app.
- `VITE_PUBLIC_APP_URL` is still preferred when set.
- If `VITE_PUBLIC_APP_URL` is missing, `https://guinness-budgeting.vercel.app` is treated as the stable production app URL.
- If the app is actually running from `https://guinness-budgeting.vercel.app`, the QR uses `window.location.origin`.
- Localhost, private-network URLs, Vercel preview URLs and Vercel dashboard URLs show a warning and use the stable production link instead of encoding the current temporary/private URL.
- Copy link remains enabled whenever a valid URL is derived.
- Bumped app, data schema and service-worker cache references to V2.6.14.

## Files Changed

- `README.md`
- `README-CHANGES-V2.6.14-QR-FALLBACK.md`
- `package.json`
- `package-lock.json`
- `public/service-worker.js`
- `src/components/layout/AppShell.jsx`
- `src/services/storageService.js`

## How To Test

1. Deploy to Vercel.
2. Open `https://guinness-budgeting.vercel.app`.
3. Click **Open on phone**.
4. Confirm the QR code is visible.
5. Confirm the link field shows `https://guinness-budgeting.vercel.app`.
6. Confirm **Copy link** is enabled.
7. Open from localhost or a Vercel preview URL and confirm the orange warning appears while the QR still points to the stable production URL.

## Manual Vercel Setting

Set this in Vercel Production environment variables:

```text
VITE_PUBLIC_APP_URL=https://guinness-budgeting.vercel.app
```

Do not set it to localhost, a Vercel dashboard URL, or a preview deployment URL.
