# Brand Shadow Overlays

Drop a transparent PNG here for each brand that should get the "brand shadow"
download option in the Download dropdown.

## Filename convention

`<brand-slug>.png` — where slug = brand name lowercased, with spaces removed
or replaced by hyphens. Examples:

| Brand        | Filename             |
|--------------|----------------------|
| SpinJo       | `spinjo.png`         |
| Roosterbet   | `roosterbet.png`     |
| FortunePlay  | `fortuneplay.png`    |
| LuckyVibe    | `luckyvibe.png`      |
| SpinsUp      | `spinsup.png`        |
| PlayMojo     | `playmojo.png`       |
| Lucky7even   | `lucky7even.png`     |
| NovaDreams   | `novadreams.png`     |
| Rollero      | `rollero.png`        |

## Format requirements

- PNG with alpha channel (transparent middle, shadow only on edges).
- Aspect ratio doesn't matter — the overlay is stretched to fit the banner
  being downloaded. For sharpest results provide one that's at least as
  large as your biggest banner.
- The transparent area is what shows the underlying banner; opaque pixels
  become the shadow.

## How it's applied

When the user picks a "… + brand shadow" option in the Download dropdown,
the app draws the base image first, then composites this overlay on top,
then exports as PNG. If rounded corners are also selected, the overlay is
clipped to the rounded silhouette so the shadow respects the curve.

If a brand has no overlay file uploaded here, the "brand shadow" menu items
will still appear but clicking them will show an alert asking you to upload
the file.
