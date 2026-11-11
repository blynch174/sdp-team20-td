# data/

| Folder | Contents |
|---|---|
| `raw/2025-07-12/` | Ten raw AiM CSV exports from the CT-16EV, July 12, 2025 (about 80 MB). Used by the mock DMS's CSV replay (mounted at `/data` in `docker-compose.yml`). See the [data notes](../docs/reference/data-2025-07-12.md). |

## Planned

- `raw/<date>/`: new session logs downloaded from the Pi's SD card, one folder per test day.
- A short `README.md` per test day: track, driver, purpose of each session, anything that went wrong. Team 19 found this context essential.

## Rules

- **Don't edit raw files.** Cleaned or derived data belongs in `ml/` outputs, not here.
- **Keep large files out of git.** These CSVs are already committed. For much more data, use Hugging Face (Team 19 used `jobegets/ev-fsae-testing`) or Git LFS, and leave a pointer here.
