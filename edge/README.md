# edge/: on-car Raspberry Pi software

**Status:** placeholder, nothing here yet · **Owners:** Ethan, Brandon (model integration with Abdullah, encryption with Maximus)

Software for the **Raspberry Pi Zero 2W** mounted on the car ([decision D1](../docs/decisions.md)).

## What it will do

1. **Read CAN** through the MCP2515 HAT (SPI → Linux SocketCAN `can0`), and decode messages using FSAE's message layout.
2. **Read added sensors**, if FSAE approves them: I²C tire temps and IMU, and analog sensors through an external ADC.
3. **Timestamp and combine** all signals into one stream.
4. **Log everything at full rate** to the SD card, one file per session, to download afterwards ([D2](../docs/decisions.md)).
5. **Run the model** on recent data (from [`ml/`](../ml/README.md)).
6. **Downsample and prioritise** what goes live, encrypt it ([`security/`](../security/README.md)), pack it ([`protocol/`](../protocol/README.md)), and send it to the T-Beam over UART.

## Suggested layout (when work starts)

```
edge/
  can/        # SocketCAN reader + decoder (DBC or equivalent)
  sensors/    # I²C / ADC drivers
  logger/     # full-rate session logging to SD
  inference/  # loads a model exported from ml/
  uplink/     # downsample, encrypt, pack, send over UART
  bench/      # replay data/raw/ CSVs through a virtual CAN interface (vcan0)
```

## Constraints

- **512 MB of RAM**, a quad-core ARM CPU and no GPU, so measure memory and inference time for every model.
- **Powered from the car's GLV system** through an isolated 5 V converter (see [`hardware/`](../hardware/README.md)).
- **Bench-test first:** replay `data/raw/2025-07-12/` over `vcan0` before touching the car.

## Open questions

- Which signals are on the CAN bus vs only on the AiM logger? Can we get the CAN layout? (Phoenix, OWL milestone 1)
- How do we safely shut down the Pi when the car powers off, so the SD card doesn't get corrupted?
