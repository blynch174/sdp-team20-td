# firmware/: radio firmware

**Status:** placeholder, nothing here yet · **Owners:** Ethan, Brandon

Firmware for OWL's radio nodes. These run on microcontrollers (ESP32), not Linux, and are typically written in C/C++ (Arduino / PlatformIO).

| Folder | Device | Role |
|---|---|---|
| [ducklink/](ducklink/README.md) | LilyGO T-Beam on the car | Receives packets from the Pi over UART and sends them over LoRa |
| [papaduck/](papaduck/README.md) | PapaDuck gateway in the pit | Receives from the mesh and passes data to the pit laptop (phase 1) and later to the DMS |

OWL milestones covered here: **2** ("hello world" on the T-Beam), **3** (CAN → T-Beam), **4** (PapaDuck → DMS), **5** (one sensor end to end).

Keep any OWL-provided base firmware or library versions pinned and noted in each folder's README.
