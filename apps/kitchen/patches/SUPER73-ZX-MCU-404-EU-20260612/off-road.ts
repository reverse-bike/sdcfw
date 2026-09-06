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
    version: "1.0.1",
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
  ],
};

export default patchFile;
