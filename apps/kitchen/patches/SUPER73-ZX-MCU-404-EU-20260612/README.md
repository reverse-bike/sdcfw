# H106 EU 404 launch tuning

The v1.0.7 test release adds a small throttle-current allowance below 8 km/h.
Its reference is v1.0.6, which a rider reported could accelerate at full throttle
from standstill to top speed without cutouts, but felt soft from 0–10 km/h.
The test release still requires a ride test to check launch feel and cutouts.

The multiplier applies to the speed-dependent current envelope, not directly
to battery power or acceleration. The speed index advances once per 2 km/h.

| Speed (km/h) | v1.0.6 allowance | v1.0.7 allowance |
| ------------ | ---------------- | ---------------- |
| 0–<2         | 50.00%           | 55.56%           |
| 2–<4         | 52.78%           | 56.94%           |
| 4–<6         | 55.56%           | 58.33%           |
| 6–<8         | 58.33%           | 59.72%           |
| 8–<10        | 61.11%           | 61.11%           |
| 10–<12       | 63.89%           | 63.89%           |

From index 4 onward, the multiplier is `min(18 + index, 36) / 36`.
Below index 4 it is `(40 + index) / 72`. Integer division truncates each
stage of the current calculation. The throttle rise/fall ramp, partial-throttle
clamp, pedal assist, field weakening, and the path for index 45 or above are
unchanged from v1.0.6.

## Instruction layout

The throttle-envelope block at `0x08007372` uses signed division by 100 for the
table conversion, then applies the speed multiplier and the mode current base.
R0 holds the result, R2 and R3 are scratch, and R1, R4–R12, SP, and LR are
preserved. R3's incoming value is not consumed by the continuation.

The block ends with a branch to `0x080071fa`, which stores the envelope and
branches to `0x080071a2`. The slot sits after the unconditional exits of the
command conversion and rising-step clamp. It has no other entry references.
The firmware size and DFU companion remain unchanged.

Build a test archive from the repository root:

```sh
bun kitchen patch apps/kitchen/patches/SUPER73-ZX-MCU-404-EU-20260612/off-road.ts --zip apps/web/public/cfw
```

The site content entry can stay on the published release while the newer archive
is tested separately.
