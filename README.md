# kinesy

Interactive 3D joint and muscle models for kinesiology study. Each joint gets a posable model
built from real anatomical meshes, movement demos that light up the prime movers, and a quiz
(identify, recall, movers). Joints so far: jaw, neck, shoulder, elbow, wrist & hand, hip, and knee, each shown on its own
and chosen with the picker (`?joint=shoulder` in the URL also works; the last choice is remembered).

## Commands

```sh
npm install
npm run dev              # local dev server
npm run build            # static site -> dist/
npm run build:artifact   # one self-contained HTML file -> dist-artifact/index.html
npm run check            # typecheck
npm run validate         # deformer check: bone penetration by pose, timing, bulge factors
npm run route -- draft <joint> <mesh> [--strands K]   # draft a muscle's strand ends from its mesh
npm run bake -- <joint> [mesh ...]                    # bake lines of action (all stale ones, or those named)
npm run correct -- <joint> [mesh ...]                 # solve mesh corrections against the bake
```

Add `#debug` to the URL for the developer tools: Paths (the lines of action), Deform (off shows muscles at
rest), Tune (the hand-tuning panel), and timing. `?baked` forces every bakeable muscle onto its bake.

## Layout

```
src/
  core/            framework-free; runs in the browser and in Node
    math.ts        vectors, quaternions, rigid transforms
    rig.ts         kinematic chain: bones carrying one or more joints (axis, rest angle, range,
                   optional coupling; turning about the axis, or sliding along it), pose -> transforms
    deformer.ts    dual-quaternion skinning + constant-volume bulge + bone collision, for muscles
                   without lines of action (the hand); hand tuning about each one's centerline
    muscle/        muscles on lines of action (see "How muscles are modelled")
      schema.ts    JointPaths / MusclePathDef: strands, layers, `over`, `baked`, `collide`, ...
      path.ts      PathSolver: strand polylines and frames per pose (baked or wrapped), tuning applied
      baked.ts     the bake's file format and runtime lookup (multilinear over the pose grid)
      bind.ts      binds each mesh to its strands at rest
      deform.ts    deforms a mesh along its strands (CPU; muscleGpu.ts does the same in the shader)
      correct.ts   mesh corrections: per-pose handle offsets, file format and lookup
      tune.ts      hand-tuning keys on a pose lattice
      system.ts    MuscleSystem: ties the above together for one joint
    sdf.ts         signed-distance-field sampling
    assets.ts      decode the packed joint format (types.ts documents it)
    load.ts        browser loader (fetch or data: URL, gzip)
  viewer/          three.js
    stage.ts       renderer, camera, lights, orbit controls, on-demand render loop
    model.ts       joint meshes driven by the deformer; focus, x-ray, picking, axis overlays
    muscleGpu.ts   vertex-shader deformation along strands, with the mesh corrections
    pathDebug.ts   #debug overlay of strands and wrap surfaces
    animator.ts    pose tweening
  ui/              plain DOM
    explore.ts     movement demos, muscle card, muscle list
    quiz.ts        question generation and scoring
    controls.ts    one slider per joint degree of freedom
    tune.ts        #debug Tune panel: set keys, save to the joint's tuning.json
  joints/
    types.ts       JointModule: everything the app needs for one joint
    jaw/           both temporomandibular joints: the mandible hinges, then glides onto the eminences
                   (fitted condylar path and tooth guidance); both sides' muscles of mastication and suprahyoids
    neck/          the head on C1–C7 over a fixed thorax; three sliders shared out over eight levels; 21 muscles a side
    shoulder/      rig (with scapulohumeral rhythm), paths, muscles, movements, scenarios, reference
    elbow/         rig, paths, muscles, movements, quiz scenarios, reference tab
    hand/          wrist, thumb, and fingers (17 bones; shared finger sliders); skinned, not on paths
    hip/           pelvis and femur, 24 muscles, all baked
    knee/          femur, tibia, patella; the quadriceps' aponeurosis as a tissue sheet
  app.ts           wires a JointModule into the page shell (index.html)
  main.ts          joint picker; mounts one joint at a time
assets/<joint>/    manifest.json, geometry.bin.gz, fields.bin.gz (pipeline); baked.bin.gz (bake);
                   corrections.bin.gz (correct)
pipeline/          Python: source meshes -> assets (see pipeline/README.md); lib/tmj.py and lib/spine.py fit the
                   jaw's and the neck's joints
scripts/           Node tooling (tsx)
  bake.ts          lines of action over a pose grid, in parallel (lib/bake.ts, lib/reference.ts)
  correct.ts       mesh corrections (lib/correct.ts)
  route.ts         draft strand ends from a mesh; check strands against reference paths
  lib/pathcheck.ts JOINTS: per joint, its test poses and bake grid
vite.config.ts     dev-server hook the Tune panel saves through (writes tuning.json, re-solves corrections)
```

## How muscles are modelled

A muscle is a mesh carried along one or more **strands**: lines of action from origin to insertion that
list only their fixed points. The mesh is bound to its strands at rest and deformed along them each frame
(on the GPU), bulging as the strand shortens. Joints without strands (the hand) skin their muscles to the
bones instead (`core/deformer.ts`).

Principles, learned the hard way on the shoulder:

- **Muscles shorten, they don't bunch.** A strand is a taut band: the shortest way between its fixed points
  that stays off the bones and off the muscles beneath it.
- **Fixed points only where tissue is really held:** attachments, a fleshy origin's footprint, a true pulley
  (the lesser sciatic notch), or fascia (the popliteal fascia holding the hamstrings in as the knee bends).
  Where a neighbouring joint isn't modelled, a two-joint muscle's far part rides its bone, and points along
  the bone say so (the thigh muscles at the knee). Anything else that pins a band makes it crease or tear.
- **Each joint on its own:** only its bones and the muscles that cross it.
- **Limit the range to what shows the mechanics** (shoulder abduction to 160°, knee flexion to 70°): the
  extremes cost far more tuning than they teach.

The pipeline from there:

1. **Bake** (`npm run bake`). Offline, for every pose on a grid (`bake` in `scripts/lib/pathcheck.ts`),
   each strand's band is walked from rest in steps of at most 3°, so it can't tunnel through a bone, and
   relaxed off the bones' distance fields and off the meshes of the muscles beneath it, `layer` by layer
   (deep muscles are baked first and are obstacles for the ones over them). `over` names muscles it must
   pass above, `obstacle: false` keeps a thin sheet from being an obstacle, and `collide` limits the bones
   it keeps off. Chains of poses run on worker threads. At runtime the app interpolates the bake.
   A changed strand (its fixed points) makes its bake stale; `npm run bake -- <joint>` redoes stale ones.
2. **Mesh corrections** (`npm run correct`). Where a band can't keep two meshes apart (one muscle's belly
   through another's), per-pose offsets of about 96 handles per mesh push it back out, or above or below the
   muscles its layers and `over` name. They are solved over the bake grid and smoothed across it.
3. **Hand tuning** (`#debug`, Tune). Keys at poses on a coarse lattice: roll, lift off the bone, sideways
   shift, and belly length, per muscle, blended between keys and confined to the stretches that cross the
   joint. Saving writes `src/joints/<joint>/tuning.json` and re-solves the corrections in the background.
   Tune last: keys set before a structural fix can fight it.

Tendon and fascia the source meshes lack are generated in the pipeline (`pipeline/lib/sheets.py`): the knee's
quadriceps end at the patella and their aponeurosis is its own translucent sheet, listed with
`tissue: true` and lit with the muscles it `follows`.

## Adding a joint

The hip and the knee were built this way from the start; follow them.

1. `pipeline/joints/<joint>.py`: bones, muscles (BodyParts3D FMA ids), axis fitting, fields.
2. `python pipeline/fetch_sources.py <joint>` then `python pipeline/build.py <joint> --refit-axes`.
3. `src/joints/<joint>/`: `rig.ts` (bone chain, rest angles, ranges), `content.ts` (muscles,
   movements, scenarios), `reference.ts`, `paths.ts`, `tuning.json` (a lattice, no keys yet), and
   `index.ts` exporting a `JointModule` (with the `baked` and, once solved, `corrections` asset URLs).
4. Strands: `npm run route -- draft <joint> <mesh> --strands K` gives each muscle's ends from its
   attachment footprints; check them (a footprint can land on a tendon's far side). Give every muscle
   `baked: true` and a `layer` (0 on the bone, outward from there).
5. Add the joint to `JOINTS` in `scripts/lib/pathcheck.ts` (test poses, bake grid; `bakeGuide: true` for
   new joints), then `npm run bake -- <joint>`.
6. Look at it in `#debug` through the whole range with Paths on. Fix structure first (fixed points, layers,
   fascia, range), rebake, then tune and correct.
7. Add it to `JOINTS` in `src/main.ts` (the picker lists joints in that order, proximal to
   distal; `DEFAULT_JOINT` is what first-time visitors see).

A joint whose muscles are skinned instead (the hand) registers its rig and test poses in
`scripts/validate-deform.ts` for `npm run validate -- <joint>`, and can still be tuned
(`JointModule.tuning`).

Each joint is its own model: include only the bones and muscles relevant to it (muscles that
cross it belong; neighbouring joints do not).

A joint can slide its bone along its axis instead of turning it (`slide: true`, value in mm): the jaw's condyles
glide forward onto the articular eminences, and the hyoid drops as the jaw opens.

A bone can carry several joints (`joints: [...]`, outermost first), and `frame: 'root'` poses a
ball joint against the trunk while it rides a moving parent (the shoulder's humerus on the
scapula). A joint's `coupled(pose)` adds motion driven by other joints (scapulohumeral rhythm),
and a joint with no `axis` is a virtual control that drives others that way (the hand's finger
sliders). Sliders can be grouped (`JointControl.group`) and are then shown one group at a time.

## Licensing

Anatomical meshes: BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP
(Mitsuhashi N et al., Nucleic Acids Res 2009;37:D782–5). Everything under `assets/` is a
derivative and carries the same license. Code license: not yet chosen.
