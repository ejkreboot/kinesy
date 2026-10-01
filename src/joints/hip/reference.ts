export const reference = /* html */ `
<div>
	<p class="eyebrow">Articulation</p>
	<table>
		<tr><th>Joint</th><th>Type</th><th>Motion</th></tr>
		<tr><td>Hip (coxofemoral)</td><td>Ball-and-socket (spheroidal)</td><td>Flexion / extension, abduction / adduction, internal / external rotation</td></tr>
	</table>
	<p class="small" style="margin-top:6px">The femoral head sits deep in the acetabulum, deepened further by the labrum: far more stable than the shoulder, at the cost of range. The femoral neck meets the shaft at about 125° and points about 15° forward (anteversion).</p>
</div>
<div>
	<p class="eyebrow">Planes, axes, range</p>
	<table>
		<tr><th>Movement</th><th>Plane · axis</th><th>Normal ROM</th></tr>
		<tr><td>Flexion</td><td>Sagittal · mediolateral</td><td class="num">0–120°</td></tr>
		<tr><td>Extension</td><td>Sagittal · mediolateral</td><td class="num">0–30°</td></tr>
		<tr><td>Abduction</td><td>Frontal · anteroposterior</td><td class="num">0–45°</td></tr>
		<tr><td>Adduction</td><td>Frontal · anteroposterior</td><td class="num">0–30°</td></tr>
		<tr><td>Internal rotation</td><td>Transverse · longitudinal</td><td class="num">0–45°</td></tr>
		<tr><td>External rotation</td><td>Transverse · longitudinal</td><td class="num">0–45°</td></tr>
	</table>
	<p class="small" style="margin-top:6px">ROM per AAOS. Hip flexion is measured with the knee bent; with the knee straight the hamstrings stop it near 90°.</p>
</div>
<div>
	<p class="eyebrow">Muscle groups</p>
	<table>
		<tr><th>Group</th><th>Nerve</th><th>Main action</th></tr>
		<tr><td>Iliopsoas</td><td>Femoral (iliacus), L1–L3 rami (psoas)</td><td>Flexion</td></tr>
		<tr><td>Gluteus medius, minimus, TFL</td><td>Superior gluteal</td><td>Abduction, internal rotation</td></tr>
		<tr><td>Gluteus maximus</td><td>Inferior gluteal</td><td>Extension, external rotation</td></tr>
		<tr><td>Deep lateral rotators</td><td>Sacral plexus branches (obturator externus: obturator)</td><td>External rotation</td></tr>
		<tr><td>Adductors, gracilis</td><td>Obturator (pectineus: femoral; magnus also sciatic)</td><td>Adduction</td></tr>
		<tr><td>Hamstrings</td><td>Tibial division of sciatic</td><td>Extension (and knee flexion)</td></tr>
	</table>
</div>
<div>
	<p class="eyebrow">Muscles that change role</p>
	<p class="small">The hip's rotators change their leverage as it flexes: piriformis rotates the extended hip externally but abducts, and then internally rotates, the deeply flexed hip; the anterior adductors flex the hip from extension but extend it from deep flexion.</p>
</div>
<div>
	<p class="eyebrow">Model</p>
	<p class="small">Sliders: hip flexion, abduction, and rotation of the femur on a fixed pelvis (pelvic tilt is not modelled). The femur moves by flexion first, then abduction, then rotation about its long axis. The knee is not in this model: rectus femoris, sartorius, gracilis, the hamstrings, and the iliotibial tract end on the femur near it.</p>
</div>
<div>
	<p class="eyebrow">Source</p>
	<p class="small">3D meshes: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a>, © The Database Center for Life Science, licensed under <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noopener">CC BY-SA 2.1 JP</a>. Mitsuhashi N et al., Nucleic Acids Res 2009;37:D782–5. The meshes here are simplified and re-posed derivatives, shared under the same license.</p>
</div>
`;
