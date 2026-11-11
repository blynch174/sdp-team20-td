# firmware/papaduck/: gateway in the pit

**Status:** placeholder, nothing here yet · **Owners:** Ethan, Brandon

**Hardware:** PapaDuck gateway (OWL), placed in the pit.

## What it will do

- Receive packets from the car's DuckLink over the LoRa mesh.
- **Phase 1:** hand the packets to the pit laptop ([`pit/`](../../pit/README.md)) without needing internet ([decision D4](../../docs/decisions.md)).
- **Later:** also forward to the OWL DMS cloud over Wi-Fi or cellular (OWL milestone 4).

## Open questions

- What's the link to the pit laptop: USB serial, local Wi-Fi, or something else?
- Can it send to the laptop and the DMS at the same time?
- If packets are encrypted end to end, what does the DMS store or display? (See [`security/`](../../security/README.md).)
