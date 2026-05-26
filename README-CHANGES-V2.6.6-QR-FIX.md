# V2.6.6 QR Code Fix

## What changed

This patch fixes the phone/open-on-another-device QR code.

The previous QR implementation used an external QR image service. That can fail because of network blocking, privacy tools, CORS/image loading issues, or because the app is running locally and the QR code points at `localhost`.

This patch:

- Generates the QR code inside the React app as inline SVG.
- Removes the dependency on the external QR image endpoint.
- Keeps the copy-link and open-link buttons.
- Warns when the app is running on `localhost`, because phones usually cannot open a laptop's `localhost` address.
- Adds optional `VITE_PUBLIC_APP_URL` support so local development can show a QR code for the deployed Vercel app link.

## Files changed

- `src/components/common/InlineQrCode.jsx`
  - New local QR-code generator component.
  - No new npm package required.

- `src/components/layout/AppShell.jsx`
  - Replaced the external QR image URL with the new inline QR component.
  - Added local/localhost link detection.
  - Added support for `VITE_PUBLIC_APP_URL` / `VITE_APP_PUBLIC_URL` as the QR share URL when running locally.

- `src/styles/global.css`
  - Added QR SVG styling.
  - Added warning styling for localhost QR links.

- `.env.example`
  - Added optional `VITE_PUBLIC_APP_URL` example.

## Important note

If you run the app locally with `npm run dev`, the QR code may point to something like:

```text
http://localhost:5173
```

A phone normally cannot open that because `localhost` means "this phone", not your laptop.

For phone use, deploy the app to Vercel and scan the QR code from the deployed Vercel site.

Optional local-development fix:

```text
VITE_PUBLIC_APP_URL=https://your-vercel-app-url.vercel.app
```

Put that in `.env.local` if you want the QR code to point to the live app while running locally.

## Testing done

Ran:

```bash
npm run build
```

Build passed.

## Manual test steps

1. Start the app.
2. Click the phone icon in the header.
3. Confirm the QR code appears without relying on an external image URL.
4. Scan it with a phone.
5. If testing from Vercel, the phone should open the deployed app.
6. If testing from localhost, confirm the warning explains why phone scanning may not open correctly.
