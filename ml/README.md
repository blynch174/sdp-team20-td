# ml/: data preparation and models

**Status:** placeholder, nothing here yet · **Owner:** Abdullah

Plan (from Paper 1, Oct 2026):

1. **Understand the data with FSAE:** which signals exist, their units and rates, and what each session was (testing, racing, …).
2. **Choose a target that helps the pit crew.** Not BMS battery faults ([decision D3](../docs/decisions.md)). Brakes and tires are candidates.
3. **Clean and align the data:** missing readings, duplicates, timestamps, sensor glitches vs real changes.
4. **Build features that can be computed live:** rolling averages, rates of change, differences between related signals.
5. **Start with a baseline** before anything complex.
6. **Split by session**, never by random rows.
7. **Measure** precision/recall/FPR (with reliable labels), forecast error, warning time, and **inference time and memory on the Pi Zero 2W**.
8. **Retrain as new sessions arrive**, and record which data, features and settings produced each model.

## Suggested layout

```
ml/
  exploration/   # notebooks and one-off analysis (FastF1 is here)
  data_prep/     # loaders for raw AiM CSVs and Pi session logs
  features/      # feature code shared by training and edge/inference
  models/        # baselines and candidate models
  experiments/   # run configs + results (dataset, features, settings, metrics)
  export/        # turning a trained model into something edge/ can load
```

Keep large datasets and trained model files out of git (see [`data/`](../data/README.md)).

## Starting points

- [Season data notes](../docs/reference/data-2025-season.md): all 27 sessions from 2025, their pitfalls, and which targets they can support.
- [July 12 data notes](../docs/reference/data-2025-07-12.md): what's in `data/raw/2025-07-12/` and its pitfalls.
- [Team 19's ML repo](../docs/handoff-2025-26/team-19-ml-repo.md): what they built and what to avoid repeating.
- [exploration/fastf1/](exploration/fastf1/README.md): this week's OWL objective.
