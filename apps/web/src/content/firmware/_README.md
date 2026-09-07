Listings for the various firmware and what they do.

# Audience

These are user-facing docs, not for a technical audience. Technical notes belong in the patch ts files in apps/kitchen/patches. These files should only discuss user-facing concepts, like power or functionality descriptions and changes.

Good examples:

- Increase acceleration 15% after 12 mph (20 km/h)
- Increase top speed 10%
- Changes reported controller version to 203
- Increase throttle response 2x

Do not include:

- 'internal' numbers or ID's, for example users see ride modes 1-4 (UI mode number), but internally modes can be 0-8 depending on various factors.
- Memory addresses
- CAN bus details
- FOC motor control theory (PID, q/d current, etc)
- Firmware-specific coefficients
