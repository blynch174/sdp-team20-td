# Turbo Ducks: Year 1 vs Year 2

What last year's team (Team 19, 2025–26) built and claimed, what OWL asked for, and what we (Team 20, 2026–27) now plan, side by side.

> **Last updated:** 2026-11-11. Year 2 plans are still moving. Anything marked *tentative* is a working guess, not a decision. Decisions that are settled live in [decisions.md](decisions.md).

## Sources

| Document | Date | From | Where |
|---|---|---|---|
| Team 19 final project documentation | Apr 24, 2026 | Team 19 (Jobe, Maeve, Esha, Vlad) | [handoff-2025-26/papers/04-paper/](handoff-2025-26/papers/04-paper/) |
| Dashboard handoff notes (old README) | Spring 2026 | Vlad (Team 19) | [handoff-2025-26/dashboard-handoff-notes.md](handoff-2025-26/dashboard-handoff-notes.md) |
| Team 19 ML repo (`jobegets/sdp-team19-anomaly-detection`) | last commit Apr 2, 2026 | Team 19 ML half | [handoff-2025-26/team-19-ml-repo.md](handoff-2025-26/team-19-ml-repo.md) |
| OWL project brief, "Turbo Ducks (Part 2)" | before Fall 2026 | OWL (Bryan Knouse) | [sponsor/2026-owl-project-brief-turbo-ducks-part-2.pdf](sponsor/2026-owl-project-brief-turbo-ducks-part-2.pdf) |
| Paper 1 (data modeling) | Oct 13, 2026 | Abdullah | [team-2026-27/papers/paper-1/SDP_P1-Abdullah.docx](team-2026-27/papers/paper-1/SDP_P1-Abdullah.docx) |
| Paper 1 (CAN → Pi → DMS) | Oct 2026 | Team 20 member | [team-2026-27/papers/paper-1/FSAE-1.pdf](team-2026-27/papers/paper-1/FSAE-1.pdf) |
| OWL architecture and milestones deck | Oct 28, 2026 | OWL | [sponsor/2026-10-28-owl-architecture-and-milestones.pdf](sponsor/2026-10-28-owl-architecture-and-milestones.pdf) |
| Team decision: gateway → pit laptop first | Nov 2026 | Team 20 | [decisions.md](decisions.md) |

## The short version

1. **Target changed.** Year 1 tried to predict battery faults (the BMS cutting discharge). FSAE told us those faults "either happen or they don't," and the 2025 data agrees. Year 2 looks for problems that build up over time (brakes, tires). The final target is not chosen yet.
2. **Hardware changed.** The Coral Dev Board is gone (discontinued). A **Raspberry Pi Zero 2W** on the car reads the CAN bus directly, logs everything, runs the model, and sends only summaries and alerts to a **LilyGO T-Beam** radio.
3. **Data path changed.** Year 1 never reached OWL's cloud (DMS). Year 2 phase 1 goes **PapaDuck gateway → pit laptop**, with no internet needed, so the live link can be encrypted end to end. The DMS comes later.
4. **Security is new.** Year 1 had no login and no encryption. Year 2 adds encryption of the live link, UConn SSO (NetID), offline access, and a UConn VM.
5. **No ECE half.** Year 1 had an ECE team for hardware and radio. Year 2 is CSE only, so we do the hardware with FSAE's electrical members.
6. **Code is not final.** We will probably reuse the dashboard and little else (*tentative*).

## Goals

OWL's brief listed four priorities. OWL has since told us it sets objectives and lets us choose how to meet them.

| OWL priority | Where Year 1 ended | Year 2 position |
|---|---|---|
| 1. Get it on the car | Never ran on the car. The demo used a Raspberry Pi replaying old CAN data into one T-Beam, sent over LoRa to a second T-Beam, read over USB serial. | **Still the main goal.** OWL's five milestones (Oct 28 deck) are the path: get the hardware, firmware "hello world" on the T-Beam, CAN → T-Beam, PapaDuck + DMS, then one sensor end to end. |
| 2. Fix the 66% false positive rate with better data | Agreed it was a data problem: 200+ tuning runs, one training session, one test session. | **Superseded** for battery faults, since we are changing the target. The lesson carries over: split by session, collect much more data, and log every session on the Pi. |
| 3. Move toward supervised detection | Unsupervised only, with a weak label (BMS discharge flag). | **Only if labels exist.** Plan: log every session, have FSAE review flagged events, and turn those reviews into labels. |
| 4. Close the DMS integration | Never connected. OWL's devices could not reach the DMS. The mock DMS and the serial workaround stood in. | **Deferred.** Phase 1 is gateway → pit laptop. The DMS is still on OWL's milestone list (milestone 4), so it can be done in parallel as a demo. |

New in Year 2 (not in OWL's brief):

- **Security:** encrypt car → pit data; UConn SSO with NetID; access when offline at the track; host on a UConn VM.
- **New prediction targets:** problems that develop over time. FSAE suggested brakes and tire pressure. OWL's deck adds tire temperature sensors.
- **F1-style analysis:** compare practice to practice and race to race. This week's OWL objective is to explore the public **FastF1** dataset (see [`ml/exploration/fastf1/`](../ml/exploration/fastf1/README.md)).
- **More sensors:** OWL's deck proposes about a dozen new ones (see [Hardware](#hardware)).

## Data path

| Stage | Year 1 intended | Year 1 actually demoed | OWL deck (Oct 28) | Year 2 phase 1 (our plan) |
|---|---|---|---|---|
| Sensors | Existing CAN (BMS, inverter) | Old CAN data replayed from a Raspberry Pi | CAN + new I²C/ADC sensors | Start with one CAN signal (milestone 5) |
| On-car compute | DuckLink reads CAN; Coral runs the model | Coral scored replayed CSVs (`coral_inference.py`); live input was a TODO | Pi Zero 2W: fuse + timestamp, Isolation Forest, full-rate SD logging, downsample for radio | Same, **plus encryption** before the radio. Model choice open |
| Radio | LoRa mesh (SX1262), about 39 B/s measured | T-Beam → T-Beam over LoRa | T-Beam DuckLink, LoRa 915 MHz, "summaries + anomaly alerts, not raw data" | Same. Reliability is an open problem: Year 1's LoRa underperformed |
| Receiving end | Gateway → OWL DMS cloud | Receiving T-Beam → USB serial → dashboard backend | PapaDuck → Wi-Fi/cellular → DMS → WebSocket | **PapaDuck → pit laptop** (decrypt, decode, store). No internet needed |
| Dashboard | Backend polls DMS every 1 s | Serial reader (now commented-out code) | Reads the DMS over WebSocket | Reads from the pit laptop. Dashboard likely reused (*tentative*) |

```
Year 2, phase 1
CAN bus / sensors ─► Pi Zero 2W (edge/) ─UART─► T-Beam DuckLink (firmware/ducklink/)
   ─LoRa 915 MHz─► PapaDuck gateway (firmware/papaduck/) ─► pit laptop (pit/) ─► dashboard
                                      └─ later: ─► OWL DMS cloud
```

## Hardware

| Part | Year 1 | Year 2 (OWL deck + our papers) |
|---|---|---|
| Edge computer | Coral Dev Board (now discontinued) | **Raspberry Pi Zero 2W**: quad-core, **512 MB RAM**. Small models only; measure memory |
| CAN interface | DuckLink / ECE team's setup | **MCP2515** CAN HAT over SPI (Linux SocketCAN) |
| Radio | T-Beams (ESP32 + SX1262) | LilyGO T-Beam as DuckLink, connected to the Pi over UART. Has GPS for position, speed and lap timing |
| Gateway | Planned, never used | **PapaDuck** gateway in the pit |
| Power | Not covered | Car's low-voltage (GLV) system → **isolated** DC-DC buck → 5 V. Must stay isolated from the high-voltage tractive system |
| Sensors | Existing CAN channels (and the AiM logger offline) | OWL proposes: 4× IR tire temperature (I²C), IMU (I²C), 4× suspension travel pots (ADC), brake pressure + throttle/steering position (ADC), ambient/coolant temperature (I²C/1-Wire) |

Hardware caveats:

- **The Pi has no analog inputs.** The ADC sensors need an external ADC chip, which the deck doesn't show.
- **Every added sensor needs FSAE approval** for weight and wiring.
- **The 2025 logs already have IMU, brake pressure and throttle channels.** Some of those are probably wired to the AiM logger, not the CAN bus, so the Pi may not see them. Ask Phoenix at milestone 1.

## Machine learning and data

| | Year 1 | Year 2 |
|---|---|---|
| Target | BMS discharge cut-off (`BMS Disch Enable == 0`) as a weak fault label | **Not chosen yet.** Candidates: brake issues, tire temperature or pressure trends. Chosen with FSAE |
| Approach | Unsupervised: Isolation Forest, IF + rolling mean, autoencoder, LSTM autoencoder | Simple baseline first (e.g. basic forecasting); anomaly detection or supervised only if the data supports it |
| Data | 27 sessions from one season (Jun–Aug 2025), copy on Hugging Face (private; we had access by Nov 18, 2026). Trained on 1 session, tested on 1 | **Not chosen.** Candidates: the 2025 FSAE logs, all 27 sessions ([season notes](reference/data-2025-season.md)), public data (FastF1), open-source simulators, and sessions logged on the Pi. Everything must be open source ([D7](decisions.md)) |
| Train/test split | One fault-free session vs one session with faults | **Grouped cross-validation by session** (e.g. leave-one-session-out), so nearby rows from one run can't leak into the test fold |
| Metrics | Recall, false positive rate, lead time (15 s lookback), latency | Precision/recall/FPR once labels are reliable; forecast error; warning time; **inference time and memory on the Pi Zero 2W** |
| Best result | IF + rolling mean: 99.6% recall, **66.5% FPR**, about 16 ms | n/a yet |
| This week | n/a | Explore FastF1 (OWL objective) |

What re-checking Year 1's work showed (details in [team-19-ml-repo.md](handoff-2025-26/team-19-ml-repo.md), [the evaluation audit](handoff-2025-26/team-19-evaluation-audit.md) and [the data notes](reference/data-2025-07-12.md)):

- **The best result rests on one fault event.** The test session has a single fault event, the threshold was tuned on that same session, and `Pack Temp ≥ 54 °C` alone scores 100% recall at 10.9% FPR on it. Scored on the other sessions, the same model ranges from 0% recall to 94% FPR.

- **The "14.5 s lead time" isn't real early warning.** Every model scored about 15 s, which is the whole lookback window, including the autoencoder that caught 1.6% of faults. With 24–77% of normal rows flagged, some flag almost always lands in the 15 s before a fault.
- **The report describes the fault label backwards.** It says `BMS Disch Enable = 1` is a fault, but the code (correctly) uses `== 0`.
- **Most fault rows happen with the car stopped.** In `807.csv`, 3,450 rows are faults but only 220 are while moving. Once the BMS cuts power the car stops, and the "moving only" filter throws those rows away. This supports FSAE's view that the fault is an event, not a slow trend.
- **Some "faults" look like the BMS was off.** Team 19's session 2025_07_26-07 is 100% fault rows at 0 °C, 0% SOC and 0 RPM.
- **Pack temperature was dropped** from the model's inputs (it reconstructed badly), even though the sessions with the most faults hit the highest pack temperatures (55 °C).

## Dashboard

| | Year 1 | Year 2 |
|---|---|---|
| Stack | Plotly Dash (fall) → React + Recharts, FastAPI, Redis, WebSocket (spring) | Same stack, reworked on `develop` (sim + CSV-replay mock, more channels, pedal bars, status flags) |
| Metrics | Six chosen by FSAE: pack voltage, pack current, pack temp, SOC, min cell voltage, BMS LV input | Whatever we agree with FSAE, plus model alerts. Candidates from OWL's deck: 4-corner tire temps, suspension travel, lap timing, track map (T-Beam GPS) |
| Data in | Poll the DMS (mock) every 1 s; Redis keeps 2 minutes | From the pit laptop (`pit/`). The 1 s polling task will likely be replaced |
| Budget | Not considered | Must fit what the radio carries. Year 1 measured about 39 B/s, so live data is a few channels at about 1 Hz plus alerts. Full-rate data comes off the Pi's SD card after the session |
| Access | None ("prototype, no NetID login") | UConn SSO / NetID, plus a plan for offline access at the track |
| Tests | None | Add as we go |

## Security (new in Year 2)

Year 1 had none. Year 2 plans, owned by Maximus (details in [`security/`](../security/README.md)):

- **Encrypt car → pit data.** This is the main reason phase 1 goes to a pit laptop instead of the cloud.
- **UConn SSO (NetID)** for the dashboard, and a way in when the track has no internet.
- **Host on a UConn VM** for anything that isn't at the track.

Constraints to design around:
- **Encryption costs radio bytes.** A typical authenticated-encryption tag plus nonce is about 28 bytes per packet, against a link that carried about 39 B/s.
- **Keys must reach the Pi and the laptop safely.**
- **If we connect the DMS later, it will only see encrypted payloads** unless we decrypt at the pit first.

## Team

| | Year 1 | Year 2 (per Paper 1, may change) |
|---|---|---|
| Who | 4 CSE (dashboard: Vlad, Esha; ML: Jobe, Maeve) + an ECE team for hardware and LoRa | 4 CSE, no ECE team |
| Hardware / edge / pit data handling | ECE team | Ethan, Brandon |
| Data modeling | Jobe, Maeve | Abdullah |
| Security, VM, SSO | n/a | Maximus |
| Dashboard | Vlad, Esha | Everyone |
| Outside help | OWL engineers (Taraquar, Owen) | OWL weekly check-ins; Phoenix (CAN bus, milestone 1); a former Turbo Ducks member now on FSAE offered a crash course on the CAN mock |

## What we expect to reuse (*tentative*)

| Thing | Likely fate |
|---|---|
| `frontend/` dashboard | **Reuse** and adapt to the new metrics and alerts |
| `backend/` FastAPI + Redis | Unsure. Its job (poll the DMS every second) changes when data comes from the pit laptop |
| `backend/mock/mock_dms.py` | Keep for development until real data flows |
| Team 19 ML repo | Reference only. Its loader expects the cleaned Hugging Face CSVs, not our raw AiM exports |
| `data/raw/2025-07-12/` | Keep as test and replay data |

## Things to fix in our next paper

Paper 1 drafts repeat some Year 1 claims that the sources don't support:

- **The ECE work is not "already completed."** It ran against a mock CAN bus only, never on the car, and Year 1's LoRa underperformed.
- **The dashboard ↔ DuckLink link was a serial workaround.** The DMS was never connected.
- **The model never ran live on the car.** It was evaluated on recorded sessions.
- **The data is one season** (June–August 2025), not "races from previous years."
- **Year 1 did test on fault data.** It *trained* on a fault-free session and *tested* on one with 255 fault rows.
- **Hardware and data path have now moved on:** a Pi Zero 2W specifically (OWL deck), and gateway → pit laptop first (team decision).

## Open questions

1. **PapaDuck → pit laptop:** USB serial, local Wi-Fi, or something else? Can the PapaDuck send to the laptop and the DMS at the same time?
2. **Radio budget:** What throughput do we actually get from T-Beam LoRa, and which channels, at what rate, fit after encryption overhead?
3. **CAN access:** Which signals are on the CAN bus vs only on the AiM logger? Can we get the CAN message layout (a DBC file or equivalent)? (Phoenix, milestone 1)
4. **Sensors:** Which of OWL's proposed sensors will FSAE approve for weight and wiring?
5. **Prediction target:** Brakes, tire temperature, or something else? What would a useful alert look like to the pit crew?
6. **Battery limits:** What are the BMS discharge cut-off limits? Even without a model, "time until the pack hits its temperature limit" may be useful.
7. **Offline access:** How should login work at a track with no internet?
8. **Hosting:** What runs on the UConn VM, and what runs on the pit laptop?
