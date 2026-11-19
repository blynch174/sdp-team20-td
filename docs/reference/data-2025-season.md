# Data notes: the 2025 FSAE season (27 sessions)

All the CT-16EV telemetry we have from 2025: 27 sessions over 5 days, June 14 to August 1. It comes from Team 19's Hugging Face dataset [`jobegets/ev-fsae-testing`](https://huggingface.co/datasets/jobegets/ev-fsae-testing). The dataset is private; we had access by Nov 18, 2026. A copy is committed in `data/hf/ev-fsae-testing/` (see [`data/`](../../data/README.md)).

For the July 12 raw exports in `data/raw/2025-07-12/`, see the [July 12 data notes](data-2025-07-12.md).

**At a glance:** 3.75 hours logged, 1.8 hours with the car moving. 17 sessions involve driving and 10 are stationary (the same 10 Team 19 dropped). One car, 5 days, 3 tracks plus a second UConn-area site.

## The two copies in `data/`

The 10 raw files `data/raw/2025-07-12/801.csv` … `810.csv` hold **exactly the same values** as the Hugging Face files `2025-07-12/2025_07_12-01.csv` … `-10.csv`. Team 19's "cleaning" only stripped the metadata and units rows.

| | `data/raw/2025-07-12/` (10 files) | `data/hf/ev-fsae-testing/` (27 files) |
|---|---|---|
| Format | 14 metadata lines, header, units row, blank line, data | Header on line 1, data from line 2 (no units row) |
| Keeps | Start time, driver, comment, units | Data only |
| Data | 20 Hz, 79 columns | Same 79 columns in every file, 20 Hz, no gaps or duplicate rows |

```python
df = pd.read_csv(path, low_memory=False).apply(pd.to_numeric, errors="coerce")  # Hugging Face format
```

- **Hugging Face file numbers are not in time order.** On July 12, `-01` is the 7:54 PM run (raw `808`). Without start times, don't assume order on the other days either.
- **Team 19's loader uses `skiprows=[1]`**, which was meant to skip a units row. These files have none, so it drops the first data row (t = 0). It's harmless, but don't copy it.
- Units (from the raw files) are in the [July 12 data notes](data-2025-07-12.md).

## Channels (79 columns)

| Group | Channels | Notes |
|---|---|---|
| GPS (14) | Speed, lat/long, heading, altitude, satellites, accuracy, … | Speed has spikes, see [pitfalls](#pitfalls) |
| Wheel speed | `LFspeed` | Left-front wheel. More reliable than GPS speed |
| Brakes (4) | `FBrakePressure`, `RBrakePressure`, `BrakeBias`, `RBrakePressCorr` | Front sensor works only on June 14 |
| IMU (6) | `InlineAcc`, `LateralAcc`, `VerticalAcc`, roll/pitch/yaw rate | Up to 1.67 g lateral, about ±2 g longitudinal |
| Motor and inverter | `RPM`, phase A/B/C currents, `MCU DC Current`, flux, Id/Iq, `Torque Command`, `Torque Feedback`, `InverterEnable` | No motor or inverter temperature, only on/off flags |
| Driver inputs | `Throttle Pos`, `TPS 1`/`TPS 2` and their voltages, `BSE Voltage` | |
| Fault and status flags (22) | `RTD Fault`, `BSE Fault`, `DC Undervoltage`, `InvOverVolt`, `PostFaultB*`, `InvRunFaultB*`, … | 14 never change in any file |
| BMS (8) | `BMS Disch Enable`, `BMS Disch Lim`, `State of Charge`, `Pack Temp`, `Pack Voltage`, `Pack Current`, `Min Cell Voltage`, `BMS LV input` | SOC is unreliable |
| Logger | `Logger Temperature`, `External Voltage` (12.2 V) | |

**Not in the data:** tire temperature, tire pressure, suspension travel, steering angle, motor temperature.

**Never change in any session:** `Direction`, `MCU Torque Limit`, `HWOverCurrent`, `InverterTempHi`, `InverterTempLo`, `MCU LV Out of Range`, `MotorOverSpeed`, `MotorOverTemp`, `TPS2 OOR Fault`, `PostFaultB0`, `PostFaultB1`, `PostFaultB3`, `InvRunFaultB6`, `InvRunFaultB7`.

## Sessions

"Moving" means the motor is turning (`RPM > 0.5`). "Cutoffs" counts rows with battery discharge disabled (`BMS Disch Enable == 0`), shown as moving rows / all rows. Locations come from the median GPS position.

### June 14: "HV and Fault Shakedown" (second UConn-area site, about 3 km west of the main lot)

Dataset README: the ready-to-drive system stopped working, there were BSPD faults, and the first 10 minutes had no faults. `Torque Command` and `Torque Feedback` are empty all day.

| File | Length | Moving | Distance | Pack °C | SOC % | Notes |
|---|---|---|---|---|---|---|
| `06_14-01` | 1.2 min | 0% | — | 19 | 80.5 | Stationary checks; brakes pressed (front up to 42 bar) |
| `06_14-02` | 1.2 min | 0% | — | 19 | 80.5 | Stationary; about 825 rows of `DC Undervoltage` (HV fault testing) |
| `06_14-03` | 29 min | 68% | 8.5 km | 19→32 | 80.5→60.5 | **Only driving session with a working front brake sensor** (up to 66 bar). Many pedal and CAN flags |
| `06_14-04` | 2 min | 0% | — | 29 | 60.5 | Stationary; discharge limit drops to 0 |

### June 21: "EV Comp Endurance" (Michigan International Speedway)

| File | Length | Moving | Distance | Pack °C | SOC % | Notes |
|---|---|---|---|---|---|---|
| `06_21-01` | 31 min | 98% | 21.3 km | 29→38 | 95→60.5 | **The competition endurance event**; 21.3 km is close to full endurance distance. Run at reduced power: torque command at most 150 Nm (220 elsewhere), pack current at most 70 A, RPM at most 2,947. No cutoffs. GPS speed spikes to 237 km/h. Front brake sensor already dead |

### July 12: "Mock Autocross Tune Testing" (main test lot, Storrs)

Dataset README: a false overtemperature fault needed debugging. They raised the temperature limit to 60 °C, but the car still cut out at 55 °C. Rows are in time order; the raw file name is in brackets.

| File (raw) | Start | Length | Moving | Distance | Pack °C | SOC % | Cutoffs | Notes |
|---|---|---|---|---|---|---|---|---|
| `-02` (801) | 2:35 PM | 13.8 min | 41% | 3.3 km | 28→46 | 60.5→25.5 | 0 | Lowest charge of the season (min cell 2.57 V), no cutoff |
| `-03` (802) | 6:41 PM | 11.9 min | 77% | 4.8 km | 34→47 | 95→80.5 | 0 | Recharged; clean run |
| `-04` (803) | 6:53 PM | 7.5 min | 22% | 1.1 km | 44→48 | 80.5→64 | 0 | Short stints |
| `-05` (804) | 7:06 PM | 4.2 min | 53% | 0.7 km | 44→50 | 64→60.5 | 19 / 19 | Cutoff at 50 °C |
| `-06` (805) | 7:10 PM | 11.8 min | 16% | 0.7 km | 46→50 | 60.5 (frozen) | 58 / 58 | Discharge limit falls to 69 A before the cutoff |
| `-07` (806) | 7:27 PM | 15.9 min | 0% | — | 44→46 | 60.5 | 0 | Powered on, never moves |
| `-08` (807) | 7:46 PM | 6.0 min | 22% | 1.0 km | 44→51 | 60.5 (frozen) | 220 / 3,450 | Cuts out on and off 8 times while moving |
| `-01` (808) | 7:54 PM | 9.0 min | 65% | 2.8 km | 46→55 | 60.5→40.5 | 451 / 2,559 | **Thermal cutoff** at t = 411 s, 55 °C, after the discharge limit had dropped from 125 to 50 A |
| `-09` (809) | 10:15 PM | 4.1 min | 47% | 0.3 km | 39→40 | 95 | 356 / 2,037 | Cutoff at 40 °C, full pack, no drop in the limit first. Probably the "false overtemp" |
| `-10` (810) | 10:19 PM | 1.6 min | 69% | 0.3 km | 39→41 | 94.5 (frozen) | 0 | Fastest of the season (102 km/h) |

### July 26: "Mock Autocross and testing Temp Limit Faulting" (`-01`…`-04` main lot, `-05`…`-07` second site)

| File | Length | Moving | Distance | Pack °C | SOC % | Cutoffs | Notes |
|---|---|---|---|---|---|---|---|
| `-01` | 10.2 min | 55% | 0.8 km | 30→34 | 95→87 | 0 | Slow running; 40% of `Torque Feedback` rows invalid |
| `-02` | 14.9 min | 0% | — | 31→32 | 87 | 0 | Stationary pedal checks (`APPS Dist Fault` flags) |
| `-03` | 12.5 min | 39% | 2.9 km | 32→45 | 87→80.5 | 0 | Clean run |
| `-04` | 13.7 min | 68% | 6.9 km | 39→55 | 80.5→40.5 | 255 / 1,349 | **Thermal cutoff** at t = 754 s, 55 °C, limit at 50 A, the same pattern as July 12 `-01`. Highest lateral g of the season (1.67) |
| `-05` | 3.1 min | 0% | — | 25 | 50.0 | 0 / 1,691 | Stationary; readings look like default values |
| `-06` | 1.4 min | 0% | — | 25 | 50.0 | 0 | Stationary |
| `-07` | 1.0 min | 0% | — | 0 | 0 | 0 / 1,160 | **BMS not reporting** (all its channels are 0). These "cutoffs" are missing data |

### August 1: "Pittsburgh Shootout Day 2" (Pittsburgh International Race Complex; skidpad and acceleration)

| File | Length | Moving | Distance | Pack °C | SOC % | Cutoffs | Notes |
|---|---|---|---|---|---|---|---|
| `-01` | 5.9 min | 59% | 1.7 km | 23→28 | 95→80.5 | 0 | Top speed 62 km/h, probably skidpad |
| `-02` | 4.4 min | 31% | 0.8 km | 26→33 | 84.5→80.5 | 0 | 88 km/h in short bursts, probably acceleration |
| `-03` | 4.7 min | 47% | 0.8 km | 29→30 | 80.5 (frozen) | 411 / 1,604 | Cutoff at 29 °C with the discharge limit already at 0. Not heat; cause unknown |
| `-04` | 0.6 min | 0% | — | 29 | 50.0 | 0 | Stationary |
| `-05` | 2.1 min | 0% | — | 29 | 50.0 | 0 | Stationary |

## Pitfalls

1. **`Torque Feedback` = 6553.5 is an invalid reading** (a maxed-out 16-bit value). It appears in 17 files, in up to 40% of a file's rows. Treat it as missing.
2. **GPS speed has spikes**: up to 237 km/h at Michigan, where the realistic speed is about 62. Use `LFspeed`, or filter the spikes.
3. **The front brake sensor works only on June 14.** From June 21 on it sits at about −19 bar. Rear pressure tracks braking only weakly (see the [July 12 notes](data-2025-07-12.md)).
4. **Most fault flags aren't faults.** `RTD Fault` is set in 100% of a stationary session, so it means "not ready to drive". `DC Undervoltage` and `InvRunFaultB5` almost always fire together, which looks like an "HV off" state. Ask FSAE what each bit means before using any of them as a label.
5. **SOC is unreliable.** It stays frozen in 4 driving sessions, reads exactly 50.0 in stationary sessions (probably a default), and moves in coarse steps.
6. **The BMS was offline in `07_26-07`.** `BMS Disch Enable == 0` there means no data, not a fault.
7. **Scaling changed mid-season.** `BMS LV input` reads about 2,000 in June and about 25,000 from July. Check each channel's scale across days before combining them.
8. **The first sample of each session has `Logger Temperature` = 160 °C**, a startup glitch.
9. **Most cutoff rows happen with the car stopped**, as on July 12. Filtering to moving rows hides most of each event.

## What this data can support

This is one candidate training source, not the chosen one (see [year-1-vs-year-2.md](../year-1-vs-year-2.md)).

| Use | How useful | Why |
|---|---|---|
| Dashboard and mock DMS replay | High | Real 20 Hz runs from the actual car, including faults, an endurance event and idle periods. The mock DMS replays the raw format; Hugging Face files have the same columns but no metadata header |
| Radio and protocol ([D2](../decisions.md)) | High | The real channel list and rate. Many channels never change and the flags could pack into one field, so the radio summary can be much smaller than 79 channels × 20 Hz |
| Brake target ([D3](../decisions.md)) | Low | Only one driving session (`06_14-03`) has a working front sensor; rear pressure is questionable |
| Tire target (D3) | None | No tire channels |
| Pack temperature and power derating | Best supported | Temperature rises in every driving session, across 3 tracks and two power levels. Both clean thermal cutoffs follow the same pattern: temperature climbs, the discharge limit drops from 125 to 50 A, then discharge cuts at 55 °C. That builds up over time, as D3 asks, even though it involves the battery. Raise it with FSAE |
| BMS cutoff as a yes/no label | Low | About 7 sessions with cutoffs while moving, with different causes, and a label muddied by frozen SOC, the offline BMS and stationary rows |
| Testing generalization | Good | Five days at different places allow holding out a whole day or track, which July 12 alone couldn't |

## Open questions for FSAE

- What do `RTD Fault`, `DC Undervoltage`, `InvRunFaultB4`/`B5` and the `PostFault` bits actually mean?
- What caused the cutoffs in July 12 `-09` (40 °C) and August 1 `-03` (29 °C)?
- When did the front brake sensor fail, and was it ever fixed?
- What changed in the logger configuration between June and July (`BMS LV input` scaling)?
- Do the raw AiM exports for the other four days still exist? They would give start times, session order and units.
