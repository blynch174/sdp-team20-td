# security/: encryption and access

**Status:** placeholder, nothing here yet · **Owner:** Maximus

Year 1 had no security ("prototype, no NetID login"). Year 2 adds it, and it's the main reason phase 1 goes from the gateway to a pit laptop instead of the cloud ([decision D4](../docs/decisions.md)).

## Scope

1. **Live link encryption:** car (Pi) → pit laptop, so other teams at a competition can't read or spoof our data. The radios only forward ciphertext.
2. **Dashboard login:** UConn single sign-on with NetID, the same login as HuskyCT and OneDrive.
3. **Offline access:** how login works at a track with no internet.
4. **Hosting:** what runs on a UConn VM versus on the pit laptop.

## Design constraints

- **Encryption overhead competes with data for radio bytes.** Authenticated encryption usually adds a nonce plus a tag (often about 28 bytes per packet). The link carried about 39 B/s in Year 1, so packet size and frequency must be designed together with [`protocol/`](../protocol/README.md).
- **Keys must reach the Pi and the pit laptop** without being committed to this repo. Plan for key rotation, and for what happens if the Pi is lost.
- **Replays should be rejected** (e.g. sequence numbers).
- **Later DMS integration:** with end-to-end encryption, the DMS sees only ciphertext unless the pit laptop decrypts and re-uploads.

## Suggested contents

```
security/
  threat-model.md     # who might attack what, and what we protect
  link-encryption.md  # algorithm, packet envelope, key handling
  access.md           # SSO / NetID, offline access, roles
```

Never commit secrets. `.env` is already git-ignored. Add key files to `.gitignore` before creating them.
