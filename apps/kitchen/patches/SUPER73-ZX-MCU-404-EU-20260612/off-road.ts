import type { McPatchFile } from "../types.js";
import { reportedVersion, source } from "./lib.js";

const version = reportedVersion(405);

// H106 pins the controller in operating mode 4 on every 1 ms motor-loop tick
// and, on the same tick, rewrites the speed-limit config byte: 24 km/h on the
// pedal-assist path and 6 km/h on the throttle path. The other mode branches
// were never finished for this build, so the forced mode stays and only the
// mode 4 path is opened up.
const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.4",
    controllerVersion: version.controllerVersion,
  },
  patches: [
    version.patch,
    {
      type: "bytes",
      address: 0x08006cfe,
      original: [0x18, 0x21],
      data: [0xff, 0x21],
      description: "Raise the pedal-assist speed limit from 24 km/h to 255 km/h",
    },
    {
      type: "bytes",
      address: 0x08006d42,
      original: [0x06, 0x21],
      data: [0xff, 0x21],
      description: "Raise the throttle speed limit from 6 km/h to 255 km/h",
    },
    {
      type: "bytes",
      address: 0x08006c72,
      original: [0xc0, 0xf3, 0xcf, 0x0a],
      data: [0xc0, 0xf3, 0x0f, 0x1a],
      description: "Index the current envelope and pedal torque rolloff by half the vehicle speed",
    },
    {
      type: "bytes",
      address: 0x08007386,
      original: [
        0x00, 0xeb, 0x00, 0x10, 0x00, 0xeb, 0x80, 0x00, 0x87, 0xfb, 0x00, 0x20, 0x42, 0x11, 0xa2,
        0xeb, 0xe0, 0x70,
      ],
      data: [
        0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf, 0x00,
        0xbf, 0x00, 0xbf,
      ],
      description: "Use the full current envelope in mode 4 throttle instead of 85 percent",
    },
    {
      type: "bytes",
      address: 0x08006d26,
      original: [0x00, 0xf3, 0x5f, 0x84],
      data: [0xaf, 0xf3, 0x00, 0x80],
      description: "Remove the mode 4 throttle target-speed ceiling",
    },
    {
      type: "bytes",
      address: 0x0800556e,
      original: [0x7c, 0xd9],
      data: [0x7c, 0xe0],
      description: "Keep the d-axis current target on its zero-current decay path",
    },
    {
      // The half-speed index advances once per 2 km/h. Index <= 12 selects
      // 4 command units per tick below 26 km/h; higher speeds select 20.
      // At nominal 1 ms updates, zero to full-current command takes 500/100 ms.
      // The stock falling response takes about 20 ms from command 2000 to zero.
      type: "bytes",
      address: 0x08006d38,
      original: [0xba, 0xf1, 0x0f, 0x0f, 0x94, 0xbf, 0x1e, 0x23, 0x0a, 0x23],
      data: [0xba, 0xf1, 0x0c, 0x0f, 0x94, 0xbf, 0x04, 0x23, 0x14, 0x23],
      description: "Set stock throttle ramp rise to 4 units below 26 km/h and 20 units above",
    },
    {
      // Clamp the throttle ramp's final rising step to its requested command.
      // The clamp lives after the current conversion's unconditional exit.
      type: "bytes",
      address: 0x08007054,
      original: [0x82, 0x42],
      data: [0xcc, 0xe0],
      description: "Clamp stock throttle ramp increases to prevent partial-throttle oscillation",
    },
    {
      // Throttle requests envelope * min(command, base) / base.
      // Mode 4 uses base = 2000 command units; current regulation remains active.
      // The conversion jumps to 0x08007200. The following 10 bytes clamp a
      // rising throttle step to its target and return to command storage.
      type: "bytes",
      address: 0x080071de,
      original: [
        0xa0, 0xeb, 0xc0, 0x00, 0x00, 0x01, 0x87, 0xfb, 0x00, 0x10, 0x41, 0x11, 0xa1, 0xeb, 0xe0,
        0x70, 0xb6, 0xf8, 0x2c, 0x11, 0x00, 0xb2, 0x49, 0x42, 0x09, 0xb2, 0x06, 0xf5,
      ],
      data: [
        0x40, 0x42, 0xa0, 0x42, 0x88, 0xbf, 0x20, 0x46, 0x69, 0x6a, 0x48, 0x43, 0xb0, 0xfb, 0xf4,
        0xf0, 0x07, 0xe0, 0x18, 0x44, 0x48, 0x45, 0x88, 0xbf, 0x48, 0x46, 0xff, 0xe6,
      ],
      description:
        "Map throttle proportionally to the mode 4 current envelope instead of a speed target",
    },
  ],
};

export default patchFile;
