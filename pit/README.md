# pit/: pit laptop software

**Status:** placeholder, nothing here yet · **Owners:** Ethan, Brandon (pit-side data handling), Maximus (decryption, access)

The receiving end of the phase 1 data path ([decision D4](../docs/decisions.md)):

```
PapaDuck gateway ─► pit laptop: receive ─► verify + decrypt ─► decode ─► store (Redis) ─► dashboard
```

## What it will do

- **Receive** packets from the PapaDuck (link TBD; see [`firmware/papaduck/`](../firmware/papaduck/README.md)).
- **Verify and decrypt** them ([`security/`](../security/README.md)), then **decode** them ([`protocol/`](../protocol/README.md)).
- **Store** recent values and alerts, and **serve** them to the dashboard ([`frontend/`](../frontend/)).
- **Work with no internet** at the track.

## Relationship to existing code

[`backend/`](../backend/) already stores data in Redis and pushes it to the dashboard over WebSocket, but it gets data by polling a (mock) DMS once a second. Its ingest step will likely be replaced by this folder's receiver. Whether `backend/` moves in here or stays separate is undecided ([D5](../docs/decisions.md), tentative).

## Open questions

- What does the pit laptop run on, and who brings it to the track?
- Does the pit laptop also handle SD-card session downloads from the Pi after each run?
