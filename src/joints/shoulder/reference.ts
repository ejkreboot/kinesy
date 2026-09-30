export const reference = /* html */ `
<div>
	<p class="eyebrow">Articulations</p>
	<table>
		<tr><th>Joint</th><th>Type</th><th>Motion</th></tr>
		<tr><td>Glenohumeral</td><td>Ball-and-socket (spheroidal)</td><td>Flexion / extension, abduction / adduction, rotation</td></tr>
		<tr><td>Sternoclavicular</td><td>Saddle; moves like a ball</td><td>Clavicle elevation / depression, protraction / retraction, rotation</td></tr>
		<tr><td>Acromioclavicular</td><td>Plane (gliding)</td><td>Small rotations that keep the scapula on the thorax</td></tr>
		<tr><td>Scapulothoracic</td><td>Functional, not a true joint</td><td>Scapula glides on the ribs: elevation / depression, protraction / retraction, upward / downward rotation</td></tr>
	</table>
</div>
<div>
	<p class="eyebrow">Planes, axes, range</p>
	<table>
		<tr><th>Movement</th><th>Plane · axis</th><th>Normal ROM</th></tr>
		<tr><td>Flexion</td><td>Sagittal · mediolateral</td><td class="num">0–180°</td></tr>
		<tr><td>Extension</td><td>Sagittal · mediolateral</td><td class="num">0–60°</td></tr>
		<tr><td>Abduction</td><td>Frontal · anteroposterior</td><td class="num">0–180°</td></tr>
		<tr><td>Internal rotation</td><td>Transverse · longitudinal</td><td class="num">0–70°</td></tr>
		<tr><td>External rotation</td><td>Transverse · longitudinal</td><td class="num">0–90°</td></tr>
		<tr><td>Horizontal abduction / adduction</td><td>Transverse · vertical</td><td class="num">0–45° / 0–135°</td></tr>
	</table>
	<p class="small" style="margin-top:6px">ROM per AAOS; rotation measured at 90° abduction, horizontal motion from 90° abduction (Norkin &amp; White). Arm angles are measured against the trunk, so they include the scapula's share.</p>
</div>
<div>
	<p class="eyebrow">Scapulohumeral rhythm</p>
	<p class="small">Raising the arm overhead takes about 150° at the glenohumeral joint and 30° of scapular upward rotation. The first ~30° is a setting phase in which the scapula moves little. In this model the scapula starts turning at 30° and then rotates 1° for every 5° of arm elevation; the clavicle elevating at the sternoclavicular joint supplies about a quarter of it. The readout under the sliders shows the split.</p>
</div>
<div>
	<p class="eyebrow">Force couples</p>
	<table>
		<tr><th>Result</th><th>Muscles</th></tr>
		<tr><td>Scapular upward rotation</td><td>Upper trapezius + lower trapezius + serratus anterior</td></tr>
		<tr><td>Glenohumeral abduction</td><td>Deltoid lifts; the rotator cuff holds the humeral head down in the glenoid</td></tr>
		<tr><td>Scapular downward rotation</td><td>Rhomboids + levator scapulae + pectoralis minor</td></tr>
	</table>
</div>
<div>
	<p class="eyebrow">Model</p>
	<p class="small">Sliders: arm flexion, abduction, and rotation (against the trunk), and shoulder-girdle elevation and protraction (clavicle angles at the sternoclavicular joint). Scapular upward rotation follows arm elevation automatically. The arm moves by flexion first, then abduction, then rotation, so at 90° flexion the abduction slider performs horizontal abduction.</p>
</div>
<div>
	<p class="eyebrow">Source</p>
	<p class="small">3D meshes: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a>, © The Database Center for Life Science, licensed under <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noopener">CC BY-SA 2.1 JP</a>. Mitsuhashi N et al., Nucleic Acids Res 2009;37:D782–5. The meshes here are simplified and re-posed derivatives, shared under the same license.</p>
</div>
`;
