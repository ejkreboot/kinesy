# kinesy

Interactive 3D joint and muscle models for kinesiology study. Each joint gets a posable model
built from real anatomical meshes, movement demos that light up the prime movers, and a quiz
(identify, recall, movers). The elbow is the first joint.

## Commands

```sh
npm install
npm run dev              # local dev server
npm run build            # static site -> dist/
npm run build:artifact   # one self-contained HTML file -> dist-artifact/index.html
npm run check            # typecheck
npm run validate         # deformer check: bone penetration by pose, timing, bulge factors
```

## Layout

```
src/
  core/            framework-free; runs in the browser and in Node
    math.ts        vectors, quaternions, rigid transforms
    rig.ts         kinematic chain: bones, joints (axis, rest angle, range), pose -> transforms
    deformer.ts    dual-quaternion skinning + constant-volume bulge + bone collision
    sdf.ts         signed-distance-field sampling
    assets.ts      decode the packed joint format (types.ts documents it)
    load.ts        browser loader (fetch or data: URL, gzip)
  viewer/          three.js
    stage.ts       renderer, camera, lights, orbit controls, on-demand render loop
    model.ts       joint meshes driven by the deformer; focus, x-ray, picking, axis overlays
    animator.ts    pose tweening
  ui/              plain DOM
    explore.ts     movement demos, muscle card, muscle list
    quiz.ts        question generation and scoring
    controls.ts    one slider per joint degree of freedom
  joints/
    types.ts       JointModule: everything the app needs for one joint
    elbow/         rig, muscles, movements, quiz scenarios, reference tab
  app.ts           wires a JointModule into the page shell (index.html)
assets/<joint>/    manifest.json, geometry.bin.gz, fields.bin.gz (generated)
pipeline/          Python: source meshes -> assets (see pipeline/README.md)
scripts/           Node tooling (tsx)
```

## Adding a joint

1. `pipeline/joints/<joint>.py`: bones, muscles (BodyParts3D FMA ids), axis fitting, fields.
2. `python pipeline/fetch_sources.py <joint>` then `python pipeline/build.py <joint> --refit-axes`.
3. `src/joints/<joint>/`: `rig.ts` (bone chain, rest angles, ranges), `content.ts` (muscles,
   movements, scenarios), `reference.ts`, and `index.ts` exporting a `JointModule`.
4. Register the rig in `scripts/validate-deform.ts` and run `npm run validate -- <joint>`.
5. Point `src/main.ts` at it (or add a joint picker).

## Licensing

Anatomical meshes: BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP
(Mitsuhashi N et al., Nucleic Acids Res 2009;37:D782–5). Everything under `assets/` is a
derivative and carries the same license. Code license: not yet chosen.
