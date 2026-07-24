## Signing secrets for releases

Commands to generate the signing secrets used by the release workflows. Placeholders in `<...>` are chosen or provided by the maintainer.

### Android

```bash
# ANDROID_KEY_ALIAS     — e.g. "upload"
# ANDROID_KEY_PASSWORD  — a strong password (store & key must match)

keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -alias "$ANDROID_KEY_ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$ANDROID_KEY_PASSWORD" \
  -keypass  "$ANDROID_KEY_PASSWORD" \
  -dname "CN=<app>, O=<org>, C=<country>"

# ANDROID_KEY_BASE64
base64 -w0 upload-keystore.jks > android-key-base64.txt
```

Keep `upload-keystore.jks` safe — losing it blocks future Play Store updates.

### macOS — App Store Connect API key

From **App Store Connect → Users and Access → Integrations → App Store Connect API**:

- `APPLE_API_KEY` — the Key ID
- `APPLE_API_ISSUER` — the Issuer ID (UUID at top of the page)
- `APPLE_TEAM_ID` — the Team ID (Apple Developer → Membership)

Key creation gives a one-time download of `AuthKey_<KeyID>.p8`. If the workflow needs it as a secret:

```bash
base64 -w0 AuthKey_<KeyID>.p8 > apple-api-key-base64.txt
```

### Desktop auto-updater

```bash
# TAURI_SIGNING_PRIVATE_KEY_PASSWORD — a chosen password (may be empty)
pnpm tauri signer generate -w ~/.tauri/sable.key
```

This writes `~/.tauri/sable.key` (private) and `~/.tauri/sable.key.pub` (public).

- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/sable.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the chosen password
- Put the contents of `~/.tauri/sable.key.pub` in `plugins.updater.pubkey` in `tauri.conf.json`

Never share the private key. Losing it prevents publishing updates to installed apps.

### macOS — code signing certificate

```bash
# APPLE_CERTIFICATE_PASSWORD — a chosen password

openssl genrsa -out mac-signing.key 2048
openssl req -new -key mac-signing.key -out mac-signing.csr \
  -subj "/emailAddress=<email>/CN=<name>/C=<country>"

# Upload mac-signing.csr at developer.apple.com → Certificates →
# "Developer ID Application"; download developer_id.cer

openssl x509 -inform DER -in developer_id.cer -out developer_id.pem
openssl pkcs12 -export \
  -inkey mac-signing.key \
  -in developer_id.pem \
  -out developer_id.p12 \
  -passout pass:"$APPLE_CERTIFICATE_PASSWORD"

# APPLE_CERTIFICATE
base64 -w0 developer_id.p12 > apple-certificate-base64.txt
```

On a Mac, generate the CSR via Keychain Access, export the cert+key as `.p12`, and run only the last step.
