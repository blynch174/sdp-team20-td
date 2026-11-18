# Decisions

Short record of project decisions: what we chose, why, and what it affects. Add new entries at the bottom, and don't edit old ones. If a decision changes, add a new entry and mark the old one **Replaced by Dn**.

Status values: **Adopted** (we're doing this), **Tentative** (working assumption, may change), **Replaced**.

---

### D1. Replace the Coral Dev Board with a Raspberry Pi Zero 2W
- **Date:** Oct 2026 · **Status:** Adopted
- **Context:** Year 1 ran its model on a Coral Dev Board, which is now discontinued and hard to buy. OWL's Oct 28 deck specifies a Raspberry Pi Zero 2W with an MCP2515 CAN HAT.
- **Decision:** The on-car computer is a Pi Zero 2W. It reads CAN, logs every session to its SD card, runs the model, and sends data to the T-Beam over UART.
- **Consequences:** Only 512 MB of RAM, so models must be small. Measure inference time and memory. PyTorch/LSTM models from Year 1 are unlikely to fit. The Pi has no ADC, so analog sensors need an external ADC chip.

### D2. Send summaries and alerts over the radio, keep full-rate data on the car
- **Date:** Oct 2026 · **Status:** Adopted
- **Context:** Year 1's LoRa link carried about 39 bytes/s, while the car logs 79 channels at 20 Hz.
- **Decision:** Only compact summaries and alerts go live over LoRa. Full-rate data is logged on the Pi and downloaded after each session.
- **Consequences:** The dashboard shows a few channels at roughly 1 Hz, plus alerts. Post-session analysis uses the SD card logs. We need a compact packet format ([`protocol/`](../protocol/README.md)).

### D3. Move the prediction target away from BMS battery faults
- **Date:** Oct 2026 · **Status:** Adopted (new target **Tentative**)
- **Context:** FSAE told us battery faults "either happen or they don't." The 2025 logs agree: most fault rows occur after the car has stopped. Year 1's best model flagged 66% of normal data.
- **Decision:** Stop predicting the BMS discharge cut-off. Look for problems that develop over time. Brakes and tires are candidates, and the target will be chosen with FSAE.
- **Consequences:** Year 1's 66% false positive rate stops being our yardstick. We need a baseline for whatever target we pick, and labels from FSAE reviewing flagged events.

### D4. Phase 1 data path: gateway → pit laptop, DMS later
- **Date:** Nov 2026 · **Status:** Adopted
- **Context:** OWL's deck routes data PapaDuck → internet → DMS cloud → dashboard. Maximus needs to encrypt the live car → pit data, and tracks may have no internet.
- **Decision:** In phase 1, the PapaDuck gateway sends to a pit laptop, which decrypts, decodes and serves the dashboard. Connecting the DMS comes later.
- **Consequences:** The system works with no internet. The dashboard backend reads from the pit laptop instead of polling the DMS. OWL's milestone 4 (data visible in the DMS) still needs a plan, either in parallel or later.

### D5. Existing code is not final; the dashboard is the most likely part to reuse
- **Date:** Nov 2026 · **Status:** Tentative
- **Context:** Year 1's code was built for a mock DMS and a serial workaround, not for the Year 2 data path.
- **Decision:** Treat current code as a starting point. Expect to reuse `frontend/` and replace most of the rest.
- **Consequences:** Don't invest heavily in the 1-second DMS polling backend. New components go in the placeholder folders (`edge/`, `firmware/`, `pit/`, `protocol/`, `ml/`, `security/`, `hardware/`).

### D6. Reorganise the repo: docs in `docs/`, data in `data/`
- **Date:** Nov 11, 2026 · **Status:** Adopted
- **Decision:** All documents live under `docs/`.

### D7. Open-source only (UConn requirement)
- **Date:** Nov 11, 2026 · **Status:** Adopted (constraint from UConn)
- **Context:** UConn requires the project to use only open-source items, not closed-source ones.
- **Decision:** Everything in the **final product** must be open source: code we ship, its dependencies, and services it runs on. Check the license (OSI-approved) before adopting anything, and note it in the README of the folder that uses it.
- **Our interpretation (Tentative, confirm with the instructor):** The rule covers the final product, not testing and exploration. Closed tools and non-openly-licensed data (FastF1's F1 data, commercial sims) are fine for experiments, as long as:
  - nothing from them ships, including models trained on that data;
  - they stay in `ml/exploration/`, clearly labelled as exploration;
  - paper results that depend on them say so.
- **Consequences:**
  - Closed simulators (EA F1 games, Assetto Corsa/ACC, iRacing, BeamNG) and MATLAB can't be part of the product, but may be used for exploration under the interpretation above.
  - Shipped models must be trained on data we're allowed to use (FSAE's logs with their permission, or our own Pi logs).
  - **Redis:** `docker-compose.yml` uses `redis:7-alpine`, which resolves to 7.4+ (RSALv2/SSPLv1, not OSI open source). Options: Valkey (BSD-3, drop-in), Redis 8+ under AGPLv3, or pinning Redis 7.2 (BSD-3, older).
  - **Ask the instructor** whether sponsor-provided services (OWL's DMS cloud) and openly *available* but not openly *licensed* data (F1 timing data via FastF1) are allowed. Raw data moved from `doc/data-sets/` to `data/raw/2025-07-12/` (`docker-compose.yml` updated to match). Placeholder folders were created for planned components.

### D8. Closed-source tools are allowed for visualizations
- **Date:** Nov 11, 2026 · **Status:** Adopted (clarifies D7)
- **Context:** The team confirmed that UConn's open-source rule (D7) has an exception for visualization.
- **Decision:** Closed-source tools may be used to visualize data, for example a racing game's replay or a commercial charting or plotting tool.
- **Consequences:**
  - The exception covers *showing* data, not *processing* it. Closed tools still can't produce data or models that ship, or run any part of the data path (CAN → Pi → radio → pit → backend).
  - The Redis issue in D7 is unaffected, because Redis is part of the backend data path, not the visualization.
