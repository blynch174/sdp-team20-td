# Audit of Team 19's Isolation Forest evaluation

**Date:** Nov 18, 2026 · **By:** Abdullah (with Claude) · **Sources:** Team 19's final report (`papers/04-paper/Final_Documentation.pdf`, "Evaluation" section) and their code ([`jobegets/sdp-team19-anomaly-detection`](https://github.com/jobegets/sdp-team19-anomaly-detection), commit `b4257be`, Apr 2, 2026). Data: the [2025 season](../reference/data-2025-season.md) from Hugging Face.

**Bottom line:** the evaluation can't show that the model predicts BMS faults. The headline numbers rest on **one fault event**, a threshold **tuned on the test session**, and a training session that looks nothing like the test session. Simple one-line rules score better on the same test. See [What to do differently](#what-to-do-differently) for how we evaluate instead.

## What Team 19 did

| Step | Choice |
|---|---|
| Label | `BMS Disch Enable == 0` (the BMS cut battery discharge). The report says `== 1`; the code is right |
| Rows | Only rows with the motor turning (`RPM > 0.5`) |
| Features | 13 channels: `Pack Voltage`, `Pack Current`, `State of Charge`, `Min Cell Voltage`, `Torque Feedback`, `RPM`, `Flux Feedback`, and 6 IMU channels. `Pack Temp` and `BMS LV input` were commented out ("High MSE") |
| Model | scikit-learn `IsolationForest` (200 trees, contamination 0.01, `random_state=42`) on 25-row (1.25 s) rolling means, `MinMaxScaler` fitted on training data |
| Training | One session: `2025_06_21-01`, the Michigan endurance run (no faults) |
| Threshold | Flag a row if its score is at or above the 97th percentile of the **training** scores |
| Test | One session: `2025_07_26-04` (10,902 normal rows, 255 fault rows, after the moving filter) |
| Metrics | Row-level recall and FPR. Lead time: for each fault start, the earliest flag in the 15 s before it. Inference latency |

**Reported** (IF + rolling mean): recall 99.61%, FPR 66.46%, lead time 14.5 s, 15.86 ms per prediction.

The other models, from the same report: IF on single rows 96.86% / 76.98%; autoencoder 1.57% / 23.81%; LSTM autoencoder 17.25% / 75.15%. All have about 15 s lead time.

**Our re-run** with their settings, re-implemented from their code: **recall 99.2%, FPR 60.9%, lead time 14.45 s.** Close but not identical, probably because of library versions.

## Findings

### 1. The test is a single fault event

After the moving filter, the 255 fault rows in `07_26-04` form **one continuous event**, starting at t = 754 s. That event is the season's second thermal cutoff: 55 °C, with the discharge limit already down to 50 A. "99.6% recall" means 254 rows of that one event were flagged. The rows aren't independent, so skill can't be told apart from luck.

### 2. Recall counts rows after the fault has started

Fault rows are rows where the BMS has **already** cut discharge. Flagging them isn't prediction, because the BMS flag already says so. Only the lead-time metric tries to measure warning ahead of time.

### 3. Lead time is about 15 s by construction

The code takes the **earliest** flag in the 15 s window before each fault start, so lead time can't exceed 15 s. The model flags **73%** of the rows in that window, so a flag near the start of the window is almost certain. A **random flagger** marking 66% of rows scores recall 68.2%, FPR 66.4% and **lead time 14.95 s**, the same as the model. Team 19 noted this in their report.

### 4. The model detects "not Michigan", not "fault coming"

Michigan was driven at reduced power: pack current at most 70 A, RPM at most 2,947, SOC never below 60.5%. The autocross test goes to 196 A, 4,293 RPM and 40.5% SOC.

- **69.8%** of test rows have at least one feature outside the training range. The most affected are min cell voltage (34%), pack voltage (31%), SOC (30%), pack current (25%) and RPM (19%).
- Flag rate: **80.3%** for rows outside the training range, **18.7%** for rows inside it.
- The fault comes late in the session, when SOC and voltage are below anything seen in training, so it gets flagged automatically.
- A 97th-percentile threshold should flag about 3% of data like the training data. Flagging 61–66% shows a shift in conditions, not faults.

### 5. Settings were tuned on the test session

The threshold quantile (0.70–0.99) and window size (15–50) tables in the report are all scored on `07_26-04`, and the best values (0.97, 25) were kept. There was no separate validation session, so the reported score is optimistic.

### 6. Simple rules beat the model on the same rows

| Rule (same test rows) | Recall | FPR | Lead time |
|---|---|---|---|
| Team 19 IF + rolling mean (re-run) | 99.2% | 60.9% | 14.45 s |
| Flag at random, 66% of rows | 68.2% | 66.4% | 14.95 s |
| Flag every row | 100% | 100% | 15 s |
| SOC below training minimum (60.5%) | 100% | 28.4% | 15 s |
| `BMS Disch Lim` ≤ 60 A | 100% | 25.4% | 15 s |
| **`Pack Temp` ≥ 54 °C** | **100%** | **10.9%** | 15 s |

These rules were chosen after looking at this event, so they aren't validated models either. The point is that the evaluation can't tell a model from a threshold rule. And `Pack Temp`, the signal behind this fault, was left out of the features.

### 7. The chosen test session is one of the best-looking ones

The same trained model, scored on every other driving session:

| Session | Fault rows (moving) | Recall | FPR |
|---|---|---|---|
| `2025_07_12-01` (thermal cutoff) | 451 | 100% | 89.6% |
| `2025_07_12-05` | 19 | 79.0% | 84.1% |
| `2025_07_12-06` | 58 | 81.0% | 23.9% |
| `2025_07_12-08` | 220 | 52.7% | 71.5% |
| `2025_07_12-09` | 356 | 20.5% | 70.8% |
| `2025_08_01-03` | 411 | **0%** | 4.3% |
| `2025_06_14-03` | 0 | — | 17.5% |
| `2025_07_12-02` | 0 | — | 93.8% |
| `2025_07_12-03` | 0 | — | 31.5% |
| `2025_07_12-04` | 0 | — | 43.4% |
| `2025_07_12-10` | 0 | — | 45.9% |
| `2025_07_26-01` | 0 | — | 80.9% |
| `2025_07_26-03` | 0 | — | 51.3% |
| `2025_08_01-01` | 0 | — | 55.3% |
| `2025_08_01-02` | 0 | — | 27.0% |

Each session with faults has exactly one fault event after the moving filter.

### 8. Smaller issues

- **`Torque Feedback` was effectively disabled.** The training session has 301 rows of the invalid value 6553.5. Min–max scaling then squeezes the real values (0–153 Nm) into about 0–0.02.
- **Rolling means run across time gaps.** Dropping stationary rows joins stretches that weren't next to each other. Their own TODO in `src/utils/data.py` notes this.
- **The moving filter drops most of each fault.** It keeps 255 of the 1,349 fault rows in `07_26-04`.
- **Latency wasn't measured on the target hardware.** The report doesn't say where it was measured; the Coral only replayed CSVs (`coral_inference.py`).
- **The contamination setting has no effect.** It shifts every score by the same constant, and the threshold is a percentile, so the report's "contamination tuning" table can't change anything.
- **A loader quirk:** `skiprows=[1]` drops the first data row, because the Hugging Face files have no units row.

## Being fair to Team 19

The report itself acknowledges the lead-time weakness, the shift between sessions, and that the data rather than the model is the limit ("not able to generalize"). Training on one clean session and testing on one session with a fault was a reasonable response to messy data. What was missing is the standard safeguards: several test sessions, a threshold chosen on separate data, and a simple baseline to compare against.

## What to do differently

1. **Count events, not rows.** Report events caught, false alarms per hour of driving, and warning time per event. A warning only counts if it was raised before the event and stayed on.
2. **Hold out whole days** (leave one day out), and pick thresholds on validation data, never on the test set.
3. **Always report a simple baseline and a random flagger** at the same flag rate. A model that can't beat them isn't learning.
4. **Measure how different each test session is from training** (the share of rows outside the training range) before trusting anomaly scores.
5. **Clean known bad values first:** `Torque Feedback` 6553.5, GPS speed spikes, BMS-offline rows (see the [season notes](../reference/data-2025-season.md#pitfalls)).

## How to reproduce

1. Load each CSV the way Team 19 did: `pd.read_csv(path, skiprows=[1], usecols=[...])`, sort by `Time`, keep `RPM > 0.5`.
2. Build 25-row rolling means of the 13 features (rows 25 onward) and label each window by its last row.
3. Fit `MinMaxScaler` and `IsolationForest(n_estimators=200, contamination=0.01, random_state=42)` on `2025_06_21-01`.
4. Set the threshold at the 0.97 quantile of the training scores, where the score is the negated `decision_function`.
5. Score each test session and compute row recall, FPR and 15 s lead time as in their `src/utils/visualization.py::early_detection_stats`.
6. Compute the rule baselines on the same windowed rows.

The script used for this audit wasn't kept in the repo.
