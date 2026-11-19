# Team 19's ML repo

Summary of [`jobegets/sdp-team19-anomaly-detection`](https://github.com/jobegets/sdp-team19-anomaly-detection) (last commit Apr 2, 2026), read in full on Nov 9, 2026. It's about 2,200 lines of Python. We use it as a reference only, not as a dependency.

## What's in it

| Path | What it does |
|---|---|
| `main.py` | Starts a text menu: pick training/eval datasets, train, evaluate, compare runs, plot. |
| `src/utils/data.py` | Loads the cleaned CSVs from Hugging Face (`jobegets/ev-fsae-testing`), keeps 14 channels, and drops rows where `RPM <= 0.5`. Fault label: `BMS Disch Enable == 0`. |
| `src/models/isolation_forest/` | Isolation Forest on single rows, and on 25-row rolling means (scikit-learn). |
| `src/models/autoencoder/` | Dense autoencoder and LSTM autoencoder (PyTorch), scored by reconstruction error. |
| `src/utils/severity.py` | Turns scores into `normal` / `low` / `medium` / `high` (1×, 1.5× and 2.5× the threshold). |
| `src/repl/training_ops.py` | Training, evaluation, and metrics: fault coverage (recall), FPR, early hits and mean lead within a 15 s lookback. |
| `src/deploy/coral_inference.py` | Loads the saved Isolation Forest, replays a CSV row by row and prints `t=… score=… flag=…`. Ends with `# TODO Receive input from ECE on coral board`. |

Inputs used: pack voltage, pack current, SOC, min cell voltage, torque feedback, RPM, flux feedback, and 6 IMU channels. **Pack Temp and BMS LV input are commented out** ("High MSE").

**Evaluation audit:** we re-ran their Isolation Forest evaluation. The headline 99.6% recall / 66.5% FPR rests on a single fault event and a test-tuned threshold, and simple rules beat it. See [team-19-evaluation-audit.md](team-19-evaluation-audit.md).

## Things to know if you reuse anything

- **There's no API or service.** Results only go to the console and plots.
- **The loader won't read our raw AiM exports.** See [the data notes](../reference/data-2025-07-12.md).
- **The alert threshold is a percentile of the training-session scores.** On a new session, any shift in driving conditions pushes many rows over it, which is the 66% FPR.
- **The "contamination" setting can't change results.** It only shifts all scores equally, and the threshold is a percentile.
- **Dropping stationary rows leaves gaps in the time series,** which affects the rolling and LSTM models (their own TODO says so). It also removes most fault rows, because the car stops after the BMS cuts power.
- **Nothing is compiled for the Coral's Edge TPU.** Only the Isolation Forest was used on the board.
- **The report states the fault label backwards** (`= 1`). The code's `== 0` is correct.
