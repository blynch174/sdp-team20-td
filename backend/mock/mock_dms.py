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
        Expects the AiM CSV export format (the files in doc/data-sets/).
        Set CSV_PATH to the file, e.g. CSV_PATH=/data/801.csv

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
CSV_PATH = os.getenv("CSV_PATH", "/data/801.csv")
SIM_SPEED = float(os.getenv("SIM_SPEED", "1.0"))  # >1 runs the sim faster than real time

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
    # Status flags (0/1)
    "InverterEnable", "BSE Fault", "APPS Dist Fault", "DC Undervoltage", "InvOverVolt",
]


# ===========================================================================
# DATA SOURCES
# ===========================================================================
class SimulatedCar:
    """Autocross-style simulation. Rough numbers based on the CT-16EV logs."""

    DT = 0.05             # internal step, seconds (20 Hz like the logger)
    N_CELLS = 105         # estimated: ~440 V pack at full charge / ~4.2 V per cell
    R_CELL = 0.0028       # ohms per cell, gives realistic sag under load
    CAPACITY_AS = 12 * 3600  # amp-seconds; small on purpose so a run lasts ~10 min
    RPM_PER_KMH = 48.5    # from the logs: ~4,950 rpm at ~102 km/h
    MAX_TORQUE = 220.0    # Nm, max torque command seen in the logs
    MAX_CURRENT = 200.0   # A, ~80 kW at ~400 V (FSAE power limit)
    AMBIENT_C = 24.0

    def __init__(self) -> None:
        self.t = 0.0
        self.last_wall = time.monotonic()
        self.speed = 0.0
        self.torque_fb = 0.0
        self.current = 0.0
        self.lv = 26.2
        self.apps_fault_until = -1.0
        self.new_run()

    def new_run(self) -> None:
        self.soc = 95.0
        self.pack_temp = 30.0 + random.uniform(-2, 2)
        self.lv = 26.2

    def _throttle_brake(self, t: float) -> tuple[float, float]:
        s = math.sin(0.21 * t) + 0.5 * math.sin(0.57 * t + 1.0) + 0.25 * math.sin(1.6 * t + 2.0)
        throttle = min(100.0, max(0.0, (s + 0.35) * 90))
        brake = min(35.0, max(0.0, (-s - 0.45) * 32))
        return throttle, brake

    def _step(self) -> None:
        dt = self.DT
        self.t += dt
        throttle, brake = self._throttle_brake(self.t)

        # Speed: throttle pushes, aero drag and brakes slow it down.
        accel = 12.0 * throttle / 100 - 1.05e-3 * self.speed ** 2 - 0.6 * brake
        if self.speed < 0.5 and throttle == 0:
            accel = min(accel, 0)
        self.speed = max(0.0, self.speed + accel * dt)
        rpm = self.speed * self.RPM_PER_KMH

        # Torque: feedback lags the command a little.
        torque_cmd = self.MAX_TORQUE * throttle / 100
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

        # Dynamics.
        v_ms = self.speed / 3.6
        lat_g = 1.3 * math.sin(0.5 * self.t + 0.3) * min(1.0, self.speed / 70)
        inline_g = accel / 3.6 / 9.81
        yaw = math.degrees(lat_g * 9.81 / v_ms) if v_ms > 2 else 0.0

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
            "InverterEnable": 1,
            "BSE Fault": 0,
            "APPS Dist Fault": 1 if self.t < self.apps_fault_until else 0,
            "DC Undervoltage": 1 if min_cell < 2.8 else 0,
            "InvOverVolt": 0,
        }

    def next_sample(self) -> dict[str, float]:
        now = time.monotonic()
        elapsed = (now - self.last_wall) * SIM_SPEED
        self.last_wall = now
        for _ in range(max(1, min(int(elapsed / self.DT), 20000))):
            self._step()
        if self.soc < 12:
            self.new_run()  # battery swap: start a fresh run
        return {k: round(float(v), 3) for k, v in self.sample.items()}


class CsvReplay:
    """Replays an AiM CSV export in real time, looping at the end."""

    def __init__(self, path: str) -> None:
        self.rows, self.rate = self._load(path)
        self.start = time.monotonic()
        print(f"CsvReplay: loaded {len(self.rows)} rows at {self.rate} Hz from {path}")

    @staticmethod
    def _load(path: str) -> tuple[list[dict[str, float]], float]:
        rate = 20.0
        with open(path, newline="", encoding="latin-1") as f:
            reader = csv.reader(f)
            header = None
            for line in reader:
                if line and line[0] == "Sample Rate":
                    rate = float(line[1])
                # The metadata block also has a "Time" row (time of day), so
                # the real header is the "Time" row with many columns.
                if line and line[0] == "Time" and len(line) > 5:
                    header = line
                    break
            if header is None:
                raise ValueError(f"{path}: no 'Time' header row found; is this an AiM CSV?")
            next(reader, None)  # units row
            wanted = [(i, name) for i, name in enumerate(header) if name in CHANNELS]
            rows = []
            for line in reader:
                if not line:
                    continue
                row = {}
                for i, name in wanted:
                    try:
                        row[name] = float(line[i])
                    except (ValueError, IndexError):
                        pass
                rows.append(row)
        if not rows:
            raise ValueError(f"{path}: no data rows")
        return rows, rate

    def next_sample(self) -> dict[str, float]:
        idx = int((time.monotonic() - self.start) * self.rate) % len(self.rows)
        return self.rows[idx]


def make_source():
    if DATA_SOURCE == "csv":
        return CsvReplay(CSV_PATH)
    # Add new sources here, e.g.:
    # if DATA_SOURCE == "bmw_i3":
    #     return BmwI3Replay(os.getenv("BMW_PATH"))
    return SimulatedCar()


source = make_source()


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


if __name__ == "__main__":
    print(f"Mock OWL DMS on http://localhost:5000  (source: {DATA_SOURCE})")
    uvicorn.run(app, host="0.0.0.0", port=5000)
