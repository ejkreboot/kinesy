# Asset pipeline

Turns BodyParts3D meshes into the packed format the viewer loads (`src/core/types.ts`).

```sh
python3 -m venv pipeline/.venv && source pipeline/.venv/bin/activate
pip install -r pipeline/requirements.txt

python pipeline/fetch_sources.py elbow        # sparse git checkout of the needed STLs
python pipeline/build.py elbow                # -> assets/elbow/
python pipeline/build.py elbow --refit-axes   # also refit joint axes (several minutes)
```

## Steps

1. **Axes** (`lib/axes.py`). Joint axes are fitted from bone geometry, not placed by hand.
   - `hinge_congruence`: the axis that keeps the moving bone's articular surface at constant
     clearance from the fixed bone through the arc (elbow: trochlear notch on trochlea).
   - `pivot_centers`: the line through the moving bone's proximal head center (circle fit)
     and the fixed bone's distal head center (sphere fit), nudged to avoid bony collision
     (elbow: radial head to ulnar head).
   Results are frozen in `joints/<joint>.axes.json` so builds are fast and reproducible.
2. **Meshes** (`lib/meshes.py`). Muscles are decimated to about 7,000 faces; the viewer
   frame is y-up, z-anterior, millimetres, with the origin on the primary axis.
3. **Skin weights** (`lib/skin.py`). Each vertex is weighted by its proximity to the bones
   the muscle may attach to, smoothed over the mesh, then averaged with touching muscles
   so shared tendons move together.
4. **Fields** (`lib/fields.py`). A 1.5 mm signed-distance grid per bone for collision, and a
   20-bin centerline per muscle for the shortening bulge.
5. **Pack** (`build.py`). Quantized uint16 positions, uint8 weights, int8 distance grids,
   gzip-compressed.

Surface sampling is seeded, so a rebuild is deterministic.
