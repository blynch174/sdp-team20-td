# data/

| Folder | Contents |
|---|---|
| `raw/2025-07-12/` | Ten raw AiM CSV exports from the CT-16EV, July 12, 2025 (about 80 MB). Used by the mock DMS's CSV replay (mounted at `/data` in `docker-compose.yml`). See the [data notes](../docs/reference/data-2025-07-12.md). |
| `hf/ev-fsae-testing/` | Team 19's copy of the 2025 season (about 170 MB), from the private Hugging Face dataset [`jobegets/ev-fsae-testing`](https://huggingface.co/datasets/jobegets/ev-fsae-testing) (we had access by Nov 18, 2026). Committed here so the team doesn't each need Hugging Face access; keep this repo private. 27 sessions, June 14 to August 1, 2025. Only the metadata and units rows were stripped: the July 12 files match `raw/2025-07-12/` value for value. See the [season notes](../docs/reference/data-2025-season.md). |

## Planned

- `raw/<date>/`: new session logs downloaded from the Pi's SD card, one folder per test day.
- A short `README.md` per test day: track, driver, purpose of each session, anything that went wrong. Team 19 found this context essential.

## Rules

- **Don't edit raw files.** Cleaned or derived data belongs in `ml/` outputs, not here.
- **Keep large files out of git.** The 2025 CSVs (about 250 MB) are committed as an exception. For much more data, use Hugging Face or Git LFS, and leave a pointer here.
- **This data is FSAE's.** It's in git only because the repo is private. Don't make the repo public, or publish the data, without FSAE's permission.
