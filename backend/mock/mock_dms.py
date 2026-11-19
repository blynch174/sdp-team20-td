# mock_dms.py
"""
Mock OWL DMS server.

Stands in for the real data source (OWL's DMS, or eventually our own edge
device) so the dashboard can run without the car.

DATA SOURCES (pick one with the DATA_SOURCE env var)
----------------------------------------------------
  sim   (default) A simple physics-ish simulation of an autocross run.
        Values move together like a real car (throttle -> speed -> RPM ->
        current -> voltage sag, battery heats up and drains over the run),
        so the dashboard's warning colors actually get exercised. When the
        battery gets low, the sim starts a new "run" with a fresh battery.

  csv   Replays a recorded log row by row, in real time, looping at the end.
        Expects the AiM CSV export format (the logs under data/: raw AiM exports or Hugging Face copies).
        Set CSV_PATH to the file, e.g. CSV_PATH=/data/hf/ev-fsae-testing/2025-07-12/2025_07_12-02.csv

DEMO CONTROLS (used by the dashboard's "Demo feed" picker)
-----------------------------------------------------------
  GET  /control/feeds          simulated car + every recorded log under CSV_DIR, by date
  GET  /control/status         what is playing and how far along it is
  POST /control/feed?id=...    switch the fake car to a recorded log ("sim" = simulator)
  POST /control/restart        fresh run: sim gets a new battery at the start line,
                               a log starts over from the beginning
  POST /control/speed?x=2      playback speed (1-10x)
  These only exist on this mock. The real car can't be "switched".

ADDING REAL OR PUBLIC DATA LATER
--------------------------------
  1. Write a class with a `next_sample(self) -> dict` method that returns
     {channel name: number} using the names in CHANNELS below.
  2. Add it to make_source() at the bottom of the data-source section.
  3. Set DATA_SOURCE to its name in .env.
  If a dataset uses different column names, translate them to the CHANNELS
  names inside your class. The backend and dashboard never need to change.

  When real hardware streams data, point the backend's OWL_INSTANCE at that
  device instead of this mock; as long as it returns the same message format
  (see generate_mock_message), nothing else changes.
"""
import csv
import math
import os
import random
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
VALID_API_KEY = os.getenv("OWL_API_KEY")
DATA_SOURCE = os.getenv("DATA_SOURCE", "sim").lower()
CSV_PATH = os.getenv("CSV_PATH", "/data/hf/ev-fsae-testing/2025-07-12/2025_07_12-02.csv")
CSV_DIR = os.getenv("CSV_DIR", "/data")  # scanned recursively for recorded logs
# Playback speed for both the simulator and log replay (>1 = faster than real time).
# Starts from SIM_SPEED and can be changed live with POST /control/speed.
PLAYBACK = {"speed": float(os.getenv("SIM_SPEED", "1.0"))}

# ---------------------------------------------------------------------------
# Channel contract: these names match the AiM logger's CSV column names.
# The backend turns each one into a snake_case key ("Pack Voltage" ->
# "pack_voltage"), which is what the dashboard looks for.
# ---------------------------------------------------------------------------
CHANNELS = [
    # Driver inputs
    "GPS Speed", "RPM", "Throttle Pos", "RBrakePressure",
    # Battery
    "State of Charge", "Pack Voltage", "Pack Current", "Min Cell Voltage",
    "Pack Temp", "BMS Disch Lim", "BMS LV input",
    # Motor
    "Torque Command", "Torque Feedback",
    # Vehicle dynamics
    "LateralAcc", "InlineAcc", "YawRate",
    # Position (drawn on the dashboard's track map)
    "GPS Latitude", "GPS Longitude",
    # Status flags (0/1)
    "InverterEnable", "BSE Fault", "APPS Dist Fault", "DC Undervoltage", "InvOverVolt",
]


# ===========================================================================
# SIMULATED TRACK
# A made-up autocross-style loop (~0.8 km): straights, a hairpin, a slalom
# and sweepers. Waypoints are in meters; they get smoothed into a dense path.
# ===========================================================================
TRACK_WAYPOINTS = [
    (0, 0), (60, 0), (120, 0), (165, 15), (180, 55), (160, 90), (120, 95),
    (95, 115), (110, 145), (150, 150), (175, 135), (200, 150), (225, 135),
    (250, 150), (285, 130), (295, 85), (280, 40), (290, 0), (270, -40),
    (220, -55), (160, -55), (100, -60), (45, -50), (10, -30),
]
# Reference point for turning meters into GPS coordinates (any open lot works).
TRACK_LAT0, TRACK_LON0 = 41.8077, -72.2540


def _build_track(waypoints, step=1.0):
    """Catmull-Rom smooth a closed loop; return points, curvature, length."""
    n = len(waypoints)
    pts = []
    for i in range(n):
        p0, p1, p2, p3 = (waypoints[(i + k) % n] for k in (-1, 0, 1, 2))
        seg = math.dist(p1, p2)
        steps = max(2, int(seg / step))
        for j in range(steps):
            t = j / steps
            t2, t3 = t * t, t * t * t
            pts.append(tuple(
                0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t
                       + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2
                       + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)
                for a in (0, 1)))
    m = len(pts)
    cum = [0.0]
    for i in range(1, m + 1):
        cum.append(cum[-1] + math.dist(pts[i - 1], pts[i % m]))
    # Signed curvature from three neighbouring points, lightly smoothed.
    raw = []
    for i in range(m):
        a, b, c = pts[i - 3], pts[i], pts[(i + 3) % m]
        cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        d = math.dist(a, b) * math.dist(b, c) * math.dist(a, c)
        raw.append(2 * cross / d if d > 1e-9 else 0.0)
    curv = [sum(raw[(i + k) % m] for k in range(-4, 5)) / 9 for i in range(m)]
    return pts, curv, cum


def _speed_profile(curv, cum, v_max=27.5, lat_g=1.35, brake_g=1.1, accel_g=0.55):
    """Fastest speed (m/s) at each point given grip, braking and acceleration limits."""
    m = len(curv)
    v = [min(v_max, math.sqrt(lat_g * 9.81 / max(abs(k), 1e-6))) for k in curv]
    for _ in range(2):  # two laps of passes so the loop wraps cleanly
        for i in range(m - 1, -1, -1):  # braking: look backwards from each corner
            ds = cum[i + 1] - cum[i]
            v[i] = min(v[i], math.sqrt(v[(i + 1) % m] ** 2 + 2 * brake_g * 9.81 * ds))
        for i in range(m):  # acceleration out of corners
            ds = cum[i + 1] - cum[i]
            v[(i + 1) % m] = min(v[(i + 1) % m], math.sqrt(v[i] ** 2 + 2 * accel_g * 9.81 * ds))
    return v


TRACK_PTS, TRACK_CURV, TRACK_CUM = _build_track(TRACK_WAYPOINTS)
TRACK_LEN = TRACK_CUM[-1]
TRACK_VTARGET = _speed_profile(TRACK_CURV, TRACK_CUM)


# ===========================================================================
# DATA SOURCES
# ===========================================================================
class SimulatedCar:
    """Autocross-style simulation. Rough numbers based on the CT-16EV logs."""

    DT = 0.05             # internal step, seconds (20 Hz like the logger)
    N_CELLS = 105         # estimated: ~440 V pack at full charge / ~4.2 V per cell
    R_CELL = 0.0028       # ohms per cell, gives realistic sag under load
    CAPACITY_AS = 16 * 3600  # amp-seconds; small on purpose so a run lasts ~8 min
    RPM_PER_KMH = 48.5    # from the logs: ~4,950 rpm at ~102 km/h
    MAX_TORQUE = 220.0    # Nm, max torque command seen in the logs
    MAX_CURRENT = 200.0   # A, ~80 kW at ~400 V (FSAE power limit)
    POWER_LIMIT_W = 45000 # power cap the team might run to save the battery
    AMBIENT_C = 24.0

    def __init__(self) -> None:
        self.t = 0.0
        self.last_wall = time.monotonic()
        self.speed = 0.0
        self.torque_fb = 0.0
        self.current = 0.0
        self.lv = 26.2
        self.apps_fault_until = -1.0
        self.s = 0.0          # distance along the track, meters
        self.idx = 0          # nearest track point
        self.run_number = 0
        self.new_run()

    def new_run(self, from_start_line: bool = False) -> None:
        """Fresh battery. With from_start_line, the car also restarts from a standstill."""
        self.run_number += 1
        self.run_start_t = self.t
        self.lap = 1
        self.soc = 95.0
        self.pack_temp = 30.0 + random.uniform(-2, 2)
        self.lv = 26.2
        if from_start_line:
            self.s, self.idx, self.speed, self.torque_fb, self.current = 0.0, 0, 0.0, 0.0, 0.0

    def status(self) -> dict[str, Any]:
        return {
            "kind": "sim", "id": "sim", "label": "Simulated car",
            "run": self.run_number, "lap": self.lap,
            "position_s": round(self.t - self.run_start_t, 1), "duration_s": None,
        }

    def _throttle_brake(self) -> tuple[float, float]:
        """A simple driver: chase the track's target speed a few meters ahead."""
        ahead = (self.idx + 6) % len(TRACK_VTARGET)
        target_kmh = TRACK_VTARGET[ahead] * 3.6 * 0.97  # drive at ~97% of the limit
        err = target_kmh - self.speed
        if err >= 0:
            return min(100.0, err * 18 + 25), 0.0
        return 0.0, min(35.0, -err * 3.5)

    def _step(self) -> None:
        dt = self.DT
        self.t += dt
        throttle, brake = self._throttle_brake()

        # Torque request from the pedal, capped so motor power stays under the limit.
        rpm_now = self.speed * self.RPM_PER_KMH
        omega_now = rpm_now * 2 * math.pi / 60
        torque_cmd = self.MAX_TORQUE * throttle / 100
        if omega_now > 1:
            torque_cmd = min(torque_cmd, self.POWER_LIMIT_W * 0.90 / omega_now)

        # Speed: torque pushes, aero drag and brakes slow it down.
        accel = 20.0 * torque_cmd / self.MAX_TORQUE - 2.0e-3 * self.speed ** 2 - 1.1 * brake
        if self.speed < 0.5 and throttle == 0:
            accel = min(accel, 0)
        self.speed = max(0.0, self.speed + accel * dt)
        rpm = self.speed * self.RPM_PER_KMH

        # Torque: feedback lags the command a little.
        self.torque_fb += (torque_cmd - self.torque_fb) * min(1.0, dt / 0.15)

        # Electrical: power -> current -> voltage sag.
        ocv_cell = 3.30 + 0.90 * self.soc / 100
        omega = rpm * 2 * math.pi / 60
        p_elec = self.torque_fb * omega / 0.90 + 300  # 90% drivetrain eff + aux load
        v_pack = self.N_CELLS * (ocv_cell - self.current * self.R_CELL)
        self.current = min(self.MAX_CURRENT * 1.05, max(-5.0, p_elec / max(v_pack, 200)))
        v_pack = self.N_CELLS * (ocv_cell - self.current * self.R_CELL)

        # Battery drains and heats with current squared, cools toward ambient.
        self.soc = max(0.0, self.soc - 100 * self.current * dt / self.CAPACITY_AS)
        self.pack_temp += (5.5e-6 * self.current ** 2 - 0.0008 * (self.pack_temp - self.AMBIENT_C)) * dt
        self.lv = max(21.5, self.lv - 0.0055 * dt)

        # Move along the track; dynamics follow from the track's curvature.
        v_ms = self.speed / 3.6
        if self.s + v_ms * dt >= TRACK_LEN:
            self.lap += 1
        self.s = (self.s + v_ms * dt) % TRACK_LEN
        while not (TRACK_CUM[self.idx] <= self.s < TRACK_CUM[self.idx + 1]):
            self.idx = (self.idx + 1) % len(TRACK_PTS)
        k = TRACK_CURV[self.idx]
        lat_g = v_ms ** 2 * k / 9.81
        inline_g = accel / 3.6 / 9.81
        yaw = math.degrees(v_ms * k)
        x, y = TRACK_PTS[self.idx]
        lat = TRACK_LAT0 + y / 110540.0
        lon = TRACK_LON0 + x / (111320.0 * math.cos(math.radians(TRACK_LAT0)))

        # Rare APPS fault blip so the fault lights get exercised.
        if random.random() < 0.0003:
            self.apps_fault_until = self.t + 3.0

        min_cell = ocv_cell - self.current * self.R_CELL - 0.035  # weakest cell sits a bit lower

        self.sample = {
            "GPS Speed": self.speed,
            "RPM": rpm,
            "Throttle Pos": throttle,
            "RBrakePressure": brake + random.uniform(-0.2, 0.2),
            "State of Charge": self.soc,
            "Pack Voltage": v_pack,
            "Pack Current": self.current,
            "Min Cell Voltage": min_cell * 1000,  # logger reports mV
            "Pack Temp": self.pack_temp,
            "BMS Disch Lim": 125.0 if self.pack_temp < 50 else 125.0 * max(0.3, 1 - (self.pack_temp - 50) / 15),
            "BMS LV input": self.lv * 1000 + random.uniform(-40, 40),  # logger reports mV
            "Torque Command": torque_cmd,
            "Torque Feedback": max(0.0, self.torque_fb + random.uniform(-2, 2)),
            "LateralAcc": lat_g + random.uniform(-0.05, 0.05),
            "InlineAcc": inline_g + random.uniform(-0.03, 0.03),
            "YawRate": yaw,
            "GPS Latitude": lat,
            "GPS Longitude": lon,
            "InverterEnable": 1,
            "BSE Fault": 0,
            "APPS Dist Fault": 1 if self.t < self.apps_fault_until else 0,
            "DC Undervoltage": 1 if min_cell < 2.8 else 0,
            "InvOverVolt": 0,
        }

    def next_sample(self) -> dict[str, float]:
        now = time.monotonic()
        elapsed = (now - self.last_wall) * PLAYBACK["speed"]
        self.last_wall = now
        for _ in range(max(1, min(int(elapsed / self.DT), 20000))):
            self._step()
        if self.soc < 12:
            self.new_run()  # battery swap: start a fresh run
        return {k: (round(float(v), 7) if k.startswith("GPS L") else round(float(v), 3))
                for k, v in self.sample.items()}


GPS_MAX_ACCURACY = 30.0  # drop positions with a worse "GPS PosAccuracy" than this


def _is_number(text: str) -> bool:
    try:
        float(text)
        return True
    except (TypeError, ValueError):
        return False


_MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def _feed_label(feed_id: str) -> tuple[str, str]:
    """('2025-07-12', 'Jul 12 · session 02') from an id like hf/ev-fsae-testing/2025-07-12/2025_07_12-02."""
    parts = feed_id.split("/")
    name = parts[-1]
    date = next((p for p in reversed(parts[:-1]) if len(p) == 10 and p[4] == "-" and p[7] == "-"), "")
    day = f"{_MONTHS[int(date[5:7]) - 1]} {int(date[8:10])}" if date else "Other"
    if "-" in name and "_" in name:  # Hugging Face name: 2025_07_12-02
        return date or "other", f"{day} · session {name.rsplit('-', 1)[1]}"
    return date or "other", f"{day} · raw log {name}"


def _quick_scan(path: str) -> Optional[dict[str, Any]]:
    """Length and whether the car moved, without loading the whole file into memory."""
    rate, header, rpm_i, n, moved, t0, t1 = None, None, None, 0, False, None, None
    with open(path, encoding="latin-1") as f:
        for line in f:
            cells = [c.strip().strip('"') for c in line.split(",")]
            if header is None:
                if cells[0] == "Sample Rate" and len(cells) > 1 and _is_number(cells[1]):
                    rate = float(cells[1])
                if cells[0] == "Time" and len(cells) > 5:
                    header = cells
                    rpm_i = header.index("RPM") if "RPM" in header else None
                continue
            if not cells[0] or not _is_number(cells[0]):
                continue  # units row or blank line
            n += 1
            if t0 is None:
                t0 = float(cells[0])
            elif t1 is None:
                t1 = float(cells[0])
            if not moved and rpm_i is not None and n % 20 == 0:
                try:
                    moved = float(cells[rpm_i]) > 0.5
                except (ValueError, IndexError):
                    pass
    if header is None or n == 0:
        return None
    if rate is None:
        rate = 1 / (t1 - t0) if t0 is not None and t1 is not None and t1 > t0 else 20.0
    return {"duration_s": round(n / rate, 1), "moving": moved}


class CsvReplay:
    """Replays a recorded log in real time, looping at the end.

    Reads both formats in data/:
      raw AiM export: 14 metadata lines, header, units row, blank line, data
      Hugging Face:   header on line 1, data from line 2 (no units row)
    """

    def __init__(self, path: str) -> None:
        self.path = path
        rel = os.path.relpath(path, CSV_DIR) if path.startswith(CSV_DIR) else os.path.basename(path)
        self.id = os.path.splitext(rel)[0].replace(os.sep, "/")
        self.label = _feed_label(self.id)[1]
        self.rows, self.rate = self._load(path)
        self.duration = len(self.rows) / self.rate
        self.restart()
        print(f"CsvReplay: loaded {len(self.rows)} rows at {self.rate} Hz from {path}")

    def restart(self) -> None:
        self.pos = 0.0  # seconds into the log
        self.last_wall = time.monotonic()

    def status(self) -> dict[str, Any]:
        return {
            "kind": "log", "id": self.id, "label": self.label,
            "run": None, "lap": None,
            "position_s": round(self.pos, 1), "duration_s": round(self.duration, 1),
        }

    @staticmethod
    def _load(path: str) -> tuple[list[dict[str, float]], float]:
        rate = None
        with open(path, newline="", encoding="latin-1") as f:
            reader = csv.reader(f)
            header = None
            for line in reader:
                if line and line[0] == "Sample Rate":
                    rate = float(line[1])
                # The AiM metadata block also has a "Time" row (time of day), so
                # the real header is the "Time" row with many columns.
                if line and line[0] == "Time" and len(line) > 5:
                    header = line
                    break
            if header is None:
                raise ValueError(f"{path}: no 'Time' header row found; is this a logger CSV?")
            wanted = [(i, name) for i, name in enumerate(header) if name in CHANNELS]
            # Raw AiM files have a units row next; Hugging Face files go straight to data.
            first = next(reader, None)
            pending = [first] if first and _is_number(first[0]) else []
            # GPS fix quality: the logger reports ~200 before the GPS locks on, ~4-20 after.
            acc_i = header.index("GPS PosAccuracy") if "GPS PosAccuracy" in header else None
            rows = []
            times = []
            for line in (*pending, *reader) if pending else reader:
                if not line:
                    continue
                if len(times) < 2 and _is_number(line[0]):
                    times.append(float(line[0]))
                row = {}
                for i, name in wanted:
                    try:
                        row[name] = float(line[i])
                    except (ValueError, IndexError):
                        pass
                if acc_i is not None:
                    try:
                        bad_fix = float(line[acc_i]) > GPS_MAX_ACCURACY
                    except (ValueError, IndexError):
                        bad_fix = True
                    if bad_fix:  # don't send a position the GPS isn't sure about
                        row.pop("GPS Latitude", None)
                        row.pop("GPS Longitude", None)
                rows.append(row)
        if not rows:
            raise ValueError(f"{path}: no data rows")
        if rate is None:  # no metadata: work it out from the Time column
            rate = 1 / (times[1] - times[0]) if len(times) == 2 and times[1] > times[0] else 20.0
        return rows, rate

    def next_sample(self) -> dict[str, float]:
        now = time.monotonic()
        self.pos = (self.pos + (now - self.last_wall) * PLAYBACK["speed"]) % self.duration
        self.last_wall = now
        return self.rows[int(self.pos * self.rate) % len(self.rows)]


def make_source():
    if DATA_SOURCE == "csv":
        return CsvReplay(CSV_PATH)
    # Add new sources here, e.g.:
    # if DATA_SOURCE == "bmw_i3":
    #     return BmwI3Replay(os.getenv("BMW_PATH"))
    return SimulatedCar()


source = make_source()
_sim_car: Optional[SimulatedCar] = source if isinstance(source, SimulatedCar) else None
_feed_cache: Optional[list[dict[str, Any]]] = None


def list_feeds() -> list[dict[str, Any]]:
    """The simulator plus every recorded log under CSV_DIR, grouped by date (scanned once).

    If a date has Hugging Face copies, its raw AiM copies are skipped (same values).
    """
    global _feed_cache
    if _feed_cache is None:
        found = []
        for folder, _dirs, files in os.walk(CSV_DIR):
            for name in files:
                if name.lower().endswith(".csv"):
                    rel = os.path.relpath(os.path.join(folder, name), CSV_DIR)
                    found.append(os.path.splitext(rel)[0].replace(os.sep, "/"))
        hf_dates = {_feed_label(fid)[0] for fid in found if "_" in fid.split("/")[-1]}
        feeds = [{"id": "sim", "label": "Simulated car (live)", "kind": "sim", "group": ""}]
        for fid in sorted(found):
            date, label = _feed_label(fid)
            if "_" not in fid.split("/")[-1] and date in hf_dates:
                continue  # raw duplicate of a Hugging Face file
            try:
                info = _quick_scan(os.path.join(CSV_DIR, fid + ".csv"))
            except OSError:
                info = None
            if info is None:
                continue
            feeds.append({"id": fid, "label": label, "kind": "log", "group": date, **info})
        _feed_cache = feeds
    return _feed_cache


# Scan the logs in the background at startup so the dashboard's dropdown opens instantly.
threading.Thread(target=list_feeds, daemon=True).start()


def _log_path(feed_id: str) -> Optional[str]:
    """The file for a feed id, refusing anything outside CSV_DIR."""
    root = os.path.realpath(CSV_DIR)
    path = os.path.realpath(os.path.join(root, feed_id + ".csv"))
    return path if path.startswith(root + os.sep) and os.path.isfile(path) else None


# ===========================================================================
# API (matches OWL's DMS response format; don't change without updating
# backend/background_tasks.py)
# ===========================================================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def generate_mock_message() -> dict[str, Any]:
    """One message in the OWL API format, filled from the active data source."""
    return {
        "deviceId": "PAPADUCK",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "eventType": "health",
        "payload": {
            "hops": random.randint(1, 3),
            "Payload": source.next_sample(),
            "DeviceID": "DUCK0001",
            "duckType": 1,
            "MessageID": "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=4)),
        },
    }


@app.get("/public_api/Data")
async def get_data(
    startDate: int = Query(..., description="Unix timestamp in seconds"),
    endDate: Optional[int] = Query(None, description="Unix timestamp in seconds (optional)"),
    x_api_key: str = Header(None, alias="X-API-Key"),
) -> list[dict[str, Any]]:
    """Mock OWL API endpoint. Returns the latest sample (one message per poll)."""
    if x_api_key != VALID_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")

    try:
        start_dt = datetime.fromtimestamp(startDate, tz=timezone.utc)
        end_dt = datetime.fromtimestamp(endDate, tz=timezone.utc) if endDate else datetime.now(timezone.utc)
    except (ValueError, OSError, OverflowError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid timestamp: {e}")

    if end_dt < start_dt:
        raise HTTPException(status_code=400, detail="endDate must be after startDate")

    msg = generate_mock_message()
    # Timestamps are real UTC so the dashboard works on any machine/timezone.
    msg["timestamp"] = start_dt.isoformat().replace("+00:00", "Z")
    return [msg]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "Mock OWL DMS", "source": DATA_SOURCE}


# ---------------------------------------------------------------------------
# DEMO CONTROLS: only on this mock, so no API key (the browser calls them).
# ---------------------------------------------------------------------------
def _status() -> dict[str, Any]:
    return {**source.status(), "speed": PLAYBACK["speed"]}


@app.get("/control/feeds")
async def control_feeds() -> dict[str, Any]:
    return {"feeds": list_feeds(), "active": source.status()["id"]}


@app.get("/control/status")
async def control_status() -> dict[str, Any]:
    return _status()


@app.post("/control/feed")
async def control_feed(id: str = Query(..., description='"sim" or a log id from /control/feeds')) -> dict[str, Any]:
    global source, _sim_car
    if id == "sim":
        if _sim_car is None:
            _sim_car = SimulatedCar()
        _sim_car.last_wall = time.monotonic()
        _sim_car.new_run(from_start_line=True)
        source = _sim_car
        return _status()
    path = _log_path(id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No recorded log named {id} in {CSV_DIR}")
    source = CsvReplay(path)
    return _status()


@app.post("/control/restart")
async def control_restart() -> dict[str, Any]:
    if isinstance(source, SimulatedCar):
        source.new_run(from_start_line=True)
    else:
        source.restart()
    return _status()


@app.post("/control/speed")
async def control_speed(x: float = Query(..., ge=0.25, le=10)) -> dict[str, Any]:
    PLAYBACK["speed"] = x
    return _status()


if __name__ == "__main__":
    print(f"Mock OWL DMS on http://localhost:5000  (source: {DATA_SOURCE})")
    uvicorn.run(app, host="0.0.0.0", port=5000)
