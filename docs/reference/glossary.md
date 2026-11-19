# Glossary

Terms that come up across the OWL, FSAE and Team 19 documents.

## OWL hardware and network

| Term | Meaning |
|---|---|
| **OWL Integrations** | Our sponsor. Builds mesh-network and IoT hardware. |
| **DuckLink** | An OWL radio node that sends data onto the LoRa mesh. In Year 2 it runs on the LilyGO T-Beam on the car. |
| **PapaDuck** | An OWL gateway node. It receives from the mesh and forwards data (normally to the internet/DMS; in our phase 1, to the pit laptop). |
| **DMS (Duck Management System)** | OWL's cloud platform for data from ducks. Year 1 never connected to it. |
| **LilyGO T-Beam** | ESP32 board with an SX1262 LoRa radio and GPS. Used as the DuckLink in Year 2. |
| **LoRa** | Long-range, low-bandwidth radio. We use 915 MHz. Year 1 measured about 39 bytes/s of useful throughput. |
| **SX1262** | The LoRa radio chip on the T-Beam. |
| **Stop-and-Wait, Pure ALOHA** | Simple radio protocols Year 1's ECE team used (send, wait for an acknowledgement; send whenever, retry on collision). |

## Car and electrical

| Term | Meaning |
|---|---|
| **CT-16EV** | The FSAE electric car the 2025 logs come from. |
| **CAN bus** | The car's internal network. Each message has an ID and up to 8 data bytes, which need a layout (e.g. a DBC file) to decode. |
| **MCP2515** | CAN controller chip on the CAN HAT for the Pi, connected over SPI. Linux exposes it as a SocketCAN interface (`can0`). |
| **SPI / UART / I²C / 1-Wire** | Wired links between chips. SPI: Pi ↔ CAN HAT. UART: Pi ↔ T-Beam. I²C and 1-Wire: small sensors. |
| **ADC** | Analog-to-digital converter. Needed for analog sensors (brake pressure, suspension pots). The Pi doesn't have one built in. |
| **GLV** | Grounded low-voltage system: the car's 12 V-ish system that powers electronics. Our 5 V comes from here. |
| **Tractive system** | The high-voltage battery and motor system. Our electronics must be isolated from it. |
| **BMS** | Battery management system (Orion on this car). It monitors the pack and can cut discharge. |
| **BMS Disch Enable** | BMS flag: 1 = discharge allowed, **0 = discharge disabled** (what Year 1 used as a "fault"). |
| **BMS Disch Lim** | The BMS's current discharge limit. |
| **SOC** | State of charge (%). |
| **Inverter / MCU** | Motor controller. Channels: RPM, torque command/feedback, flux, phase currents. |
| **APPS / BSE / TPS** | Accelerator pedal position sensor, brake system encoder, throttle position sensor. Their fault flags are logged. |
| **AiM** | The car's data logger. Writes the CSVs we have, to an SD card. |
| **Phoenix** | FSAE contact named in OWL's milestone 1 for how we connect to the CAN bus. |

## Machine learning

| Term | Meaning |
|---|---|
| **Isolation Forest** | Unsupervised anomaly detector: points that are easy to isolate with random splits are unusual. |
| **Autoencoder / LSTM autoencoder** | Neural networks that learn to rebuild normal data; a large rebuild error suggests an anomaly. The LSTM version looks at sequences. |
| **Contamination** | Isolation Forest setting for the expected share of anomalies. It had no effect in Year 1 because they set their own threshold. |
| **Threshold quantile** | Year 1's alert cutoff: flag a row if its score is above this percentile of the training scores. |
| **Recall** | Share of real events the model caught. |
| **False positive rate (FPR)** | Share of normal rows the model wrongly flagged. |
| **Precision** | Share of flags that were real events. |
| **Lead time** | How far before an event the model flagged it. Year 1 capped this at a 15 s lookback. |
| **Weak label** | A label that only roughly stands for what you care about (e.g. the BMS flag standing for "battery problem"). |
| **FastF1** | Python library for public Formula 1 timing and telemetry data. This week's exploration. |

## Software and access

| Term | Meaning |
|---|---|
| **FastAPI / Redis / WebSocket** | Dashboard backend framework, in-memory store (keeps 2 minutes of data), and the live browser connection. |
| **React / Recharts** | Dashboard frontend and its charting library. |
| **Mock DMS** | `backend/mock/mock_dms.py`: a fake data source (simulation or CSV replay) standing in for the real one. |
| **SSO / NetID** | UConn single sign-on, the login used by HuskyCT and OneDrive. |
| **UConn VM** | A university-hosted virtual machine Maximus is looking into for hosting. |
