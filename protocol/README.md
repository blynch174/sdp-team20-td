# protocol/: the packet format

**Status:** placeholder, nothing here yet · **Owners:** everyone; encryption parts with Maximus

The single definition of what the car sends to the pit. [`edge/`](../edge/README.md) writes these packets, the radios ([`firmware/`](../firmware/README.md)) forward them, and [`pit/`](../pit/README.md) reads them. Keeping this in one place stops the three sides from drifting apart.

## Why it matters

The radio budget is tiny: Year 1 measured about **39 bytes/s**. JSON is out. Packets need to be compact binary, e.g. fixed-point integers for values and channel IDs instead of names.

## To define

- **Message types:** e.g. *summary* (a few key channels), *alert* (model or threshold event), *heartbeat/status*.
- **Channel table:** ID, name, unit, scaling, and byte size. Reuse AiM channel names where they exist (see [data notes](../docs/reference/data-2025-07-12.md)).
- **Header:** version, message type, sequence number (to detect loss), timestamp.
- **Encryption envelope:** where the nonce and authentication tag go, and how many bytes they cost ([`security/`](../security/README.md)).
- **Versioning:** how old and new formats coexist during testing.

## Suggested layout

```
protocol/
  spec.md            # human-readable format
  channels.csv       # channel table (single source of truth)
  python/            # encode/decode used by edge/ and pit/
  tests/             # round-trip tests + example packets
```
