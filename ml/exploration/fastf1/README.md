# ml/exploration/fastf1/: FastF1 exploration

**Status:** placeholder, this week's OWL objective (week of Nov 9, 2026) · **Owner:** Abdullah (team welcome)

[FastF1](https://docs.fastf1.dev/) is a Python library (`pip install fastf1`) for public Formula 1 timing and telemetry data.

## What it offers

- **Laps:** lap and sector times, tire compound, tire age (laps on the set), stint number, pit stops.
- **Car telemetry:** speed, RPM, gear, throttle, brake (on/off only), DRS.
- **Position:** X/Y/Z on track, which is enough to draw a track map.
- **Weather and session info.**

## What it doesn't offer

- **No tire temperatures or pressures.**
- **No suspension, brake pressure, or battery data.**

So it's good for **lap-by-lap analysis and dashboard ideas** (lap comparison, track map, tire wear over a stint, driver vs driver), but not for training models on FSAE faults.

## Questions this exploration could answer

- Which F1-style views would help FSAE compare practice to practice and race to race?
- Can we build a lap and stint analysis that later runs on our own data (lap timing from the T-Beam GPS)?
- Does tire degradation (lap time vs tire age) suggest a forecasting target for our tire-temperature sensors?

Turn on FastF1's cache (`fastf1.Cache.enable_cache(...)`) and keep the cache folder out of git.
