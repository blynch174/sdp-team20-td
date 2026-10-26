# Turbo Ducks — Live Telemetry Dashboard

**UConn Senior Design Project, Team 20 (2026–2027)**
Sponsored by **OWL Integrations** · Faculty advisor: **Dr. Shin**

A live telemetry dashboard for UConn Formula SAE's electric race car. Data comes off the car, gets parsed, and shows up on a dashboard the pit crew can watch in real time.

This year's team is continuing the system built by the 2025–2026 team (see [Project history](#project-history)).

---

## Team

| Name | Major | Role |
|---|---|---|
| Brandon Lynch | CSE | Team manager · Edge (car ↔ pit) |
| Ethan Ucol | CSE | Edge (car ↔ pit) |
| Abdullah Rashid | CSE | Data Modeling |
| Maximus Formoso | CSE | Security |

---

## Goals for 2026–2027

- **Live dashboard for the crew:** an F1-style view of the car's telemetry during a run
- **Edge pipeline:** a Raspberry Pi (or similar) on the car sending data to a laptop in the pit
- **Run storage:** save each run automatically so the crew no longer has to pull the SD card
- **Prediction:** flag problems that are actually predictable before they happen
- **Security:** UConn SSO login and access controls

---

## Quick start

Requires [Docker](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env
docker compose up -d --build
```

Then open **http://localhost:3000**. You should see 9 charts updating once per second with fake data.

| Service | URL | What it is |
|---|---|---|
| Dashboard | http://localhost:3000 | React frontend |
| Backend API | http://localhost:8000/api/health | FastAPI server |
| Mock car | http://localhost:5000/health | Fake data source |

Stop everything with `docker compose down`. For full setup steps and troubleshooting, see [`demo.txt`](demo.txt).

---

## How it works

```
Mock DMS (fake car) ──► Backend (FastAPI) ──► Redis (last 2 min)
                              │
                              └──WebSocket──► Frontend (React + recharts)
```

1. **Data source:** `backend/mock/mock_dms.py` stands in for OWL's DMS and returns random readings for 9 channels (pack voltage, RPM, etc.).
2. **Backend:** polls the data source every second, stores each reading in Redis, and pushes it to the dashboard over a WebSocket.
3. **Redis:** keeps a rolling 2-minute window of data. Nothing is saved permanently yet.
4. **Frontend:** draws one live chart per channel.

The backend also contains a serial-port reader (commented out in `backend/app.py`) used with a mock CAN bus on last year's demo day.

---

## Repo layout

```
backend/            FastAPI server
  app.py            Entry point, WebSocket + REST routes
  background_tasks.py   Polling loop, Redis writes, broadcasting
  mock/             Fake data source (mock DMS)
  requests/         Bruno API test requests
frontend/           React dashboard (Vite)
doc/
  data-sets/        Recorded runs from the car (AiM CSV exports)
  papers/           2025–2026 reports; 04-paper is the final documentation
  HANDOFF-2025-2026.md  Notes from last year's team
docker-compose.yml  Runs all four services
.env.example        Template for the .env file
```

---

## Project history

The dashboard was built in 2025–2026 by **Vlad Vetroff** and **Esha** (Team 19), as part of a joint CSE/ECE effort with the Turbo Ducks project. Their handoff notes cover the tech-stack choices, why Redis was used instead of a permanent database, and the serial/demo-day code: **[doc/HANDOFF-2025-2026.md](doc/HANDOFF-2025-2026.md)**.

Original repo: [vvvetroff/sdp-team19-dashboard](https://github.com/vvvetroff/sdp-team19-dashboard)