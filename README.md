# UConn SDP Team 20: Turbo Ducks (Year 2)

Live telemetry and edge analytics for the UConn Formula SAE electric race car, sponsored by OWL Integrations. We're continuing Team 19's 2025–26 project.

**Read first:** [docs/year-1-vs-year-2.md](docs/year-1-vs-year-2.md). All documents are indexed in [docs/README.md](docs/README.md).

## Planned data path (phase 1)

```
CAN bus / sensors ─► Pi Zero 2W ─UART─► T-Beam DuckLink ─LoRa 915 MHz─► PapaDuck gateway ─► pit laptop ─► dashboard
     (edge/)                              (firmware/ducklink/)              (firmware/papaduck/)    (pit/)     (frontend/)
```

The OWL DMS cloud connection comes later ([decision D4](docs/decisions.md)).

## Repo layout

| Folder | Status | What goes here |
|---|---|---|
| [frontend/](frontend/) | **Working** (from Year 1, reworked) | React + Recharts dashboard. Most likely part to be reused |
| [backend/](backend/) | **Working** (from Year 1) | FastAPI + Redis backend and the mock DMS (`backend/mock/`). Likely replaced or reshaped by `pit/` |
| [data/](data/) | Has data | Raw logs. `data/raw/2025-07-12/` holds ten AiM CSVs from 2025 |
| [docs/](docs/) | Has docs | Sponsor docs, Team 19 handoff, our papers, decisions, reference notes |
| [edge/](edge/) | Placeholder | Raspberry Pi Zero 2W software on the car |
| [firmware/](firmware/) | Placeholder | T-Beam DuckLink and PapaDuck gateway firmware |
| [pit/](pit/) | Placeholder | Pit laptop: receive from the gateway, decrypt, decode, feed the dashboard |
| [protocol/](protocol/) | Placeholder | The packet format shared by `edge/`, `firmware/` and `pit/` |
| [security/](security/) | Placeholder | Encryption, keys, SSO/NetID, offline access |
| [ml/](ml/) | Placeholder | Data prep, features, models, experiments (incl. FastF1 exploration) |
| [hardware/](hardware/) | Placeholder | Wiring, power, mounting, parts list, sensor approvals |

Everything here is a work in progress. Existing code is a starting point, not a final design ([decision D5](docs/decisions.md)).

## Run the current dashboard

Copy `.env.example` to `.env`, then run `docker compose up -d --build`. Full steps: [docs/guides/run-the-dashboard.md](docs/guides/run-the-dashboard.md).
