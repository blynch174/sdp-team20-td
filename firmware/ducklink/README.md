# firmware/ducklink/: T-Beam on the car

**Status:** placeholder, nothing here yet · **Owners:** Ethan, Brandon

**Hardware:** LilyGO T-Beam: ESP32, SX1262 LoRa radio (915 MHz), GPS.

## What it will do

- Receive packets from the Pi over UART (format: [`protocol/`](../../protocol/README.md)).
- Send them over the LoRa mesh to the PapaDuck. Packets stay encrypted end to end, so this node only forwards bytes.
- Possibly add GPS data (position, speed, lap timing), as shown in OWL's deck.

## First steps (OWL milestones)

1. Flash a "hello world" firmware (milestone 2).
2. Get bytes from the Pi (or a CAN source) to the T-Beam (milestone 3).
3. Measure real LoRa throughput and packet loss. Year 1 got about 39 B/s, and that budget decides what the dashboard can show live.

## Open questions

- Which OWL firmware/library do we build on, and at what version?
- What's the maximum payload per LoRa packet, and how often can we send?
