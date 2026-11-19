# hardware/: wiring, power, mounting

**Status:** placeholder, nothing here yet · **Owners:** Ethan, Brandon (with FSAE's electrical members)

Year 2 has no ECE team, so hardware decisions and documents live here.

## To document

- **Parts list:** Raspberry Pi Zero 2W, MCP2515 CAN HAT, LilyGO T-Beam, PapaDuck, antennas, isolated DC-DC converter, external ADC (the Pi has none), sensors, cables, enclosure.
- **Power:** car GLV system → **isolated** DC-DC buck → 5 V for the Pi and T-Beam. It must stay isolated from the high-voltage tractive system.
- **CAN connection:** where and how we tap the bus, agreed with Phoenix and FSAE (OWL milestone 1).
- **Sensors:** OWL's deck proposes 4× IR tire temperature (I²C), IMU (I²C), 4× suspension travel (ADC), brake pressure and throttle/steering position (ADC), and ambient/coolant temperature (I²C/1-Wire). Record which ones **FSAE approves** (weight, wiring, competition rules).
- **Mounting:** location, vibration, heat, waterproofing, antenna placement.
- **Wiring diagrams and photos** of the installed setup.

## Suggested layout

```
hardware/
  bom.md
  power.md
  can-tap.md
  sensors.md       # proposed vs approved, with interface and mounting point
  diagrams/
  photos/
```
