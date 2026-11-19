# Run the dashboard

## 1. Set up the .env file (first time only)
Copy the contents of `.env.example` into a new file named `.env` in the repo root.

Optional settings for the fake car (add to `.env` if you want them):

```
DATA_SOURCE=sim     # "sim" (simulated car, default) or "csv" (replay a recorded log)
CSV_PATH=/data/hf/ev-fsae-testing/2025-07-12/2025_07_12-02.csv   # used when DATA_SOURCE=csv
SIM_SPEED=1.0       # playback speed; 2-3 is handy for quick demos
```

You can also switch the feed and speed live from the dashboard (see "Demo feed" below).

## 2. Start everything
Open Docker Desktop first, then:

```
docker compose up -d --build
```

After the first time, `docker compose up -d` is enough unless `requirements.txt` or `package.json` changed.

## 3. Check that all four containers are running
```
docker compose ps
```
You should see redis, mock-dms, backend and frontend running, with the backend marked (healthy).

## 4. Check each URL
1. http://localhost:5000/health shows `{"status":"ok","service":"Mock OWL DMS","source":"sim"}`. This is the fake car.
2. http://localhost:8000/api/health shows `"OK"`. This is the backend.
3. http://localhost:8000/api/ducks shows `{"ducks":["DUCK0001"]}`. Data is reaching Redis.
4. http://localhost:8000/api/DUCK0001/metrics/rpm shows timestamped RPM values, updating once per second.
5. http://localhost:3000 is the dashboard.

## Using the dashboard

**Tabs**
- **Overview**: the one-screen view for the pit crew (speed and RPM gauges, pedals, state of charge, key battery numbers, fault lights).
- **Track**: a live map of the car on the course, built from GPS.
- **Driver Inputs, Battery, Motor, Vehicle Dynamics**: full charts for each area.

**Warning colors**: green = OK, yellow = caution, orange = warning, red = critical, blue = informational (no limits). The bar under the tabs lists anything that needs attention; click an item to jump to its chart. Limits live in the `CHANNELS` block at the top of `frontend/src/App.jsx`. Several are estimates and are marked `ESTIMATE` until the Formula SAE team confirms them.

**Runs and replay**
- **Start run / Stop run** marks a run. On the simulated car, Start also gives the car a fresh battery at the start line.
- The dashboard **records everything all the time**, even if nobody presses Start.
- The **run dropdown** lists finished runs. Pick one to replay it.
- **Drag the timeline** to go back to any moment. Every chart, gauge and the car's position on the map jump to that moment. **Back to live** returns to the live view.
- Runs are kept in the browser for now, so refreshing the page clears them. Saving runs to a database on the pit laptop is the next step.

**Demo feed** (top right, only when the mock is running)
- Switch the fake car between the simulator and any of the 27 recorded sessions in `data/`, grouped by test day. Sessions where the car never moves are marked "car parked".
- The mock reads both formats: Hugging Face copies (`data/hf/ev-fsae-testing/`) and raw AiM exports (`data/raw/`). If a day has both, only the Hugging Face copy is listed, since the values are identical.
- Change playback speed (1x to 10x). Keep the Track map at 1-2x for a smooth line.
- Good demo sessions: **Jul 12 · session 02** (the old "801"; driving starts about 3:40), **Jul 12 · session 01** (thermal cutoff at 55 °C), **Jun 21 · session 01** (the Michigan endurance event).
- Most sessions start with 30-45 seconds without a GPS fix, so the map waits for good positions.
- Known data issue: `BMS LV input` uses a different scale in June (about 2,000 vs 25,000 from July), so the LV Battery tile reads red on June sessions. See `docs/reference/data-2025-season.md`.

## Compare with last year's dashboard (optional)
Last year's frontend is in `docs/handoff-2025-26/old-dashboard/App.jsx`. To run it next to the new one:
1. Copy it to `frontend/src/old/OldApp.jsx`.
2. Add `frontend/old.html` and `frontend/src/old/main.jsx` (see the comment in `main.jsx`).
3. Open http://localhost:3000/old.html. The new dashboard stays at http://localhost:3000.

## Useful commands
```
docker compose logs -f backend    # watch one service's logs (Ctrl+C to stop watching)
docker compose logs -f            # watch everything
docker compose restart mock-dms   # restart just the fake car
docker compose down               # stop everything
docker compose up -d --build      # rebuild after changing requirements.txt or package.json
```

## Troubleshooting
- **"Cannot connect to the Docker daemon"**: Docker Desktop isn't running. Open it and wait until it says it's running.
- **Dashboard shows the old version**: hard-refresh with Cmd+Shift+R.
- **Charts empty**: check `docker compose logs backend` for errors.
- **Port already allocated**: something else is using 3000, 5000, 6379 or 8000. On a Mac, port 5000 is often AirPlay Receiver (System Settings > General > AirDrop & Handoff).
