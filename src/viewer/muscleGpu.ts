/**
 * Centerline deformation on the GPU: the one place the deformation shader lives. Every material
 * that draws a path-driven muscle (the visible one, shadow depth/distance, ID picking) is patched
 * with the same chunk, so all of them see the same deformed surface.
 *
 * Per frame the CPU solves the strands (core/muscle/path.ts) and uploads them, with the bones, as
 * one small float texture; positions never go back up. The bone distance fields sit in one 3D
 * texture. The GLSL below mirrors core/muscle/deform.ts step for step (its constants come from
 * there); keep them in sync.
 *
 * Texture layout (RGBA32F, see PathSolver.writeTexture): row s < strands holds sample i's
 * position + spacing at texel 2i and its frame quaternion at 2i+1, (origin bone, insertion bone,
 * bulge factor, length) at 2N and (drape kept, 0, 0, 0) at 2N+1; the last row holds bone b's
 * translation at 2b and rotation at 2b+1.
 *
 * A mesh with a baked correction (core/muscle/correct.ts) has its own RGBA32F texture: for vertex v,
 * texel 2v (row-major, CORR_WIDTH wide) holds its four handles and texel 2v+1 their weights; the handles'
 * displacements at the pose (vertex frame) are a uniform array, set each frame.
 */
import * as THREE from 'three';
import type { BoundMesh } from '../core/muscle/bind';
import { PROXY_BELLY, RELEASE, RIDGE, RIDGE_FADE } from '../core/muscle/deform';
import type { MuscleSystem } from '../core/muscle/system';
import type { JointAssets } from '../core/types';

/** Proxy capsules the shader can take (two vec4 uniforms each). */
export const MAX_CAPSULES = 64;
/** Width of a correction texture, texels. */
const CORR_WIDTH = 1024;

const PARS = /* glsl */ `
uniform highp sampler2D kData;
uniform highp sampler3D kSdf;
uniform vec4 kGridLo[K_BONES];   // lo.xyz, voxel size (mm)
uniform vec4 kGridDim[K_BONES];  // nx, ny, nz (0 = no field), z offset in the atlas
uniform float kGridQ[K_BONES];   // mm per unit of the normalized texel
uniform vec3 kAtlas;
uniform vec4 kColliders;         // bone per slot, -1 unused
uniform vec4 kCaps[2 * K_MAX_CAPS];
uniform int kCapFirst;            // capsules that push this mesh: kCapCount of kCaps from kCapFirst
uniform int kCapCount;
uniform vec3 kCollide;           // margin, soft, passes
uniform float kEnabled;
uniform highp sampler2D kCorrTex; // baked correction: per vertex, its four handles, then their weights
uniform int kCorrOn;
uniform vec3 kCorrV[K_CORR];      // the handles' displacements at the pose
attribute vec4 kPath;            // s, blend, strand A, strand B
attribute vec3 kOffset;
attribute vec3 kNormal;
attribute vec4 kWeights;         // belly, origin anchor, insertion anchor, rest proxy clearance
attribute vec4 kClear;           // rest clearance per collider slot
attribute float kWindow;         // half-width of the frame's averaging window along the strand, mm
attribute vec3 kDrape;           // the vertex's part of the rest drape (let go as the strand turns)

vec3 kPos;
vec3 kNrm;

vec3 kRot(vec4 q, vec3 v) {
	vec3 t = 2.0 * cross(q.xyz, v);
	return v + q.w * t + cross(q.xyz, t);
}

vec4 kTexel(int x, int y) {
	return texelFetch(kData, ivec2(x, y), 0);
}

// frame and spacing on a strand at share s
void kStrand(int row, float s, out vec3 c, out vec4 q, out float spacing) {
	highp float f = clamp(s, 0.0, 1.0) * float(K_SAMPLES - 1);
	int i = min(int(f), K_SAMPLES - 2);
	highp float u = f - float(i);
	vec4 p0 = kTexel(2 * i, row), p1 = kTexel(2 * i + 2, row);
	vec4 q0 = kTexel(2 * i + 1, row), q1 = kTexel(2 * i + 3, row);
	c = mix(p0.xyz, p1.xyz, u);
	spacing = mix(p0.w, p1.w, u);
	if (dot(q0, q1) < 0.0) q1 = -q1;
	q = normalize(mix(q0, q1, u));
}

// the same averaged over kWindow mm either side of s (weights 1/4, 1/2, 1/4; see core/muscle/deform.ts)
void kWindowed(int row, float s, float len, out vec3 c, out vec4 q, out float spacing) {
	kStrand(row, s, c, q, spacing);
	if (kWindow <= 0.0) return;
	float d = kWindow / max(len, 1e-6);
	vec3 ca, cb;
	vec4 qa, qb;
	float sa, sb;
	kStrand(row, s - d, ca, qa, sa);
	kStrand(row, s + d, cb, qb, sb);
	if (dot(qa, q) < 0.0) qa = -qa;
	if (dot(qb, q) < 0.0) qb = -qb;
	c = 0.5 * c + 0.25 * (ca + cb);
	q = normalize(0.5 * q + 0.25 * (qa + qb));
	spacing = 0.5 * spacing + 0.25 * (sa + sb);
}

vec4 kCorrTexel(int i) {
	return texelFetch(kCorrTex, ivec2(i % K_CORR_WIDTH, i / K_CORR_WIDTH), 0);
}

void kBone(int b, out vec3 t, out vec4 q) {
	t = kTexel(2 * b, K_BONE_ROW).xyz;
	q = kTexel(2 * b + 1, K_BONE_ROW);
}

vec3 kToBone(vec3 p, vec3 t, vec4 q) {
	return kRot(vec4(-q.xyz, q.w), p - t);
}

// signed distance (mm) to bone b at bone-local point l; 99 outside its grid
float kSdfAt(int b, vec3 l) {
	vec4 lo = kGridLo[b], dim = kGridDim[b];
	vec3 v = (l - lo.xyz) / lo.w;
	if (dim.x < 1.0 || any(lessThan(v, vec3(0.0))) || any(greaterThan(v, dim.xyz - 1.0))) return 99.0;
	return texture(kSdf, vec3(v.x + 0.5, v.y + 0.5, v.z + dim.w + 0.5) / kAtlas).r * kGridQ[b];
}

vec3 kSdfGrad(int b, vec3 l) {
	float h = kGridLo[b].w * 0.75;
	vec3 g = vec3(
		kSdfAt(b, l + vec3(h, 0.0, 0.0)) - kSdfAt(b, l - vec3(h, 0.0, 0.0)),
		kSdfAt(b, l + vec3(0.0, h, 0.0)) - kSdfAt(b, l - vec3(0.0, h, 0.0)),
		kSdfAt(b, l + vec3(0.0, 0.0, h)) - kSdfAt(b, l - vec3(0.0, 0.0, h)));
	float n = length(g);
	return n > 1e-6 && n < 50.0 ? g / n : vec3(0.0);
}

float kCapsule(int i, vec3 p, out vec3 g) {
	vec4 A = kCaps[2 * i], B = kCaps[2 * i + 1];
	vec3 e = B.xyz - A.xyz;
	float ee = dot(e, e);
	float h = ee > 1e-12 ? clamp(dot(p - A.xyz, e) / ee, 0.0, 1.0) : 0.0;
	vec3 d = p - (A.xyz + e * h);
	float l = length(d);
	g = l > 1e-9 ? d / l : vec3(0.0);
	return l - mix(A.w, B.w, h);
}

// smooth ramp: 0 up to 0, x²/(4w) up to 2w, then x − w
float kRamp(float x, float w) {
	return x <= 0.0 ? 0.0 : (x < 2.0 * w ? x * x / (4.0 * w) : x - w);
}

// keep bone-local point p out of bone b: back to its surface (or rest depth), then out to target
// along the gradient; let go smoothly where that way out is ambiguous (see core/muscle/deform.ts)
vec3 kAvoidBone(int b, vec3 p, float target) {
	float d = kSdfAt(b, p);
	if (d >= target - 1e-3) return p;
	// deep in (the strand has gone into the bone), or near the middle of a thin part where the way
	// out is ambiguous (the gradient taken K_RIDGE either side shrinks there)
	vec3 r = vec3(
		kSdfAt(b, p + vec3(K_RIDGE, 0.0, 0.0)) - kSdfAt(b, p - vec3(K_RIDGE, 0.0, 0.0)),
		kSdfAt(b, p + vec3(0.0, K_RIDGE, 0.0)) - kSdfAt(b, p - vec3(0.0, K_RIDGE, 0.0)),
		kSdfAt(b, p + vec3(0.0, 0.0, K_RIDGE)) - kSdfAt(b, p - vec3(0.0, 0.0, K_RIDGE)));
	float keep = (1.0 - smoothstep(K_RELEASE0, K_RELEASE1, target - d)) * smoothstep(K_RIDGE_F0, K_RIDGE_F1, length(r) / (2.0 * K_RIDGE));
	if (keep <= 0.0) return p;
	vec3 p0 = p;
	float level = min(target, 0.0);
	if (d < level) {
		p += kSdfGrad(b, p) * (level - d);
		d = kSdfAt(b, p);
	}
	float push = kRamp(target - d, kCollide.y);
	if (push > 0.0) p += kSdfGrad(b, p) * push;
	// or moved far to get out: let go as well
	return mix(p0, p, keep * (1.0 - smoothstep(K_RELEASE0, K_RELEASE1, length(p - p0))));
}

vec3 kAvoidCap(int i, vec3 p, float target) {
	vec3 g;
	float d = kCapsule(i, p, g);
	if (d >= target - 1e-3) return p;
	float level = min(target, 0.0);
	if (d < level) {
		p += g * (level - d);
		d = kCapsule(i, p, g);
	}
	float push = kRamp(target - d, kCollide.y);
	if (push > 0.0) p += g * push;
	return p;
}

void kDeform() {
	kPos = position;
	kNrm = normal;
	if (kEnabled < 0.5) return;
	int ra = int(kPath.z + 0.5), rb = int(kPath.w + 0.5);
	vec4 meta = kTexel(2 * K_SAMPLES, ra);
	vec3 c;
	vec4 q;
	float k = meta.z, spacing, keep = kTexel(2 * K_SAMPLES + 1, ra).x;
	kWindowed(ra, kPath.x, meta.w, c, q, spacing);
	if (rb != ra && kPath.y > 0.0) {
		vec4 meta2 = kTexel(2 * K_SAMPLES, rb);
		vec3 c2;
		vec4 q2;
		float sp2;
		kWindowed(rb, kPath.x, meta2.w, c2, q2, sp2);
		c = mix(c, c2, kPath.y);
		if (dot(q, q2) < 0.0) q2 = -q2;
		q = normalize(mix(q, q2, kPath.y));
		k = mix(k, meta2.z, kPath.y);
		spacing = mix(spacing, sp2, kPath.y);
		keep = mix(keep, kTexel(2 * K_SAMPLES + 1, rb).x, kPath.y);
	}
	float gk = 1.0 + (k - 1.0) * kWeights.x;
	vec3 p = c + kRot(q, vec3(kOffset.x * spacing, (kOffset.yz - (1.0 - keep) * kDrape.yz) * gk));
	// normals take the inverse transpose of that scaling
	vec3 n = kRot(q, normalize(vec3(kNormal.x * gk / spacing, kNormal.yz)));

	// ride the attachment bones rigidly near the ends
	vec3 bt;
	vec4 bq;
	if (kWeights.y > 0.0) {
		kBone(int(meta.x + 0.5), bt, bq);
		p = mix(p, kRot(bq, position) + bt, kWeights.y);
		n = normalize(mix(n, kRot(bq, normal), kWeights.y));
	}
	if (kWeights.z > 0.0) {
		kBone(int(meta.y + 0.5), bt, bq);
		p = mix(p, kRot(bq, position) + bt, kWeights.z);
		n = normalize(mix(n, kRot(bq, normal), kWeights.z));
	}

	// the baked correction for the pose, in the vertex's frame
	if (kCorrOn > 0) {
		vec4 hi = kCorrTexel(2 * gl_VertexID), hw = kCorrTexel(2 * gl_VertexID + 1);
		vec3 d = hw.x * kCorrV[int(hi.x + 0.5)] + hw.y * kCorrV[int(hi.y + 0.5)] + hw.z * kCorrV[int(hi.z + 0.5)] + hw.w * kCorrV[int(hi.w + 0.5)];
		p += kRot(q, d);
	}

	// keep out of bones and, if on, the proxies of lower layers
	float tb = smoothstep(K_PROXY_B0, K_PROXY_B1, kWeights.x) * (1.0 - max(kWeights.y, kWeights.z));
	int passes = int(kCollide.z + 0.5);
	for (int pass = 0; pass < 4; pass++) {
		if (pass >= passes) break;
		for (int slot = 0; slot < 4; slot++) {
			int b = int(floor(kColliders[slot] + 0.5));
			if (b < 0) continue;
			kBone(b, bt, bq);
			vec3 l = kToBone(p, bt, bq);
			if (kSdfAt(b, l) >= 98.0) continue;
			l = kAvoidBone(b, l, min(kClear[slot], kCollide.x));
			p = kRot(bq, l) + bt;
		}
		// tendons slide over the muscles beneath, attachments hold: proxies push the belly only
		if (kCapCount == 0 || tb <= 0.0) continue;
		vec3 p0 = p;
		for (int i = 0; i < K_MAX_CAPS; i++) {
			if (i >= kCapCount) break;
			p = kAvoidCap(kCapFirst + i, p, min(kWeights.w, kCollide.x));
		}
		p = mix(p0, p, tb);
	}
	kPos = p;
	kNrm = n;
}
`;

/** Patch a built-in material's vertex shader to draw a path-driven muscle. */
function patchVertex(shader: { vertexShader: string }, defines: string): void {
	const v = shader.vertexShader;
	for (const anchor of ['#include <common>', 'void main() {', '#include <begin_vertex>'])
		if (!v.includes(anchor)) throw new Error(`Muscle shader: anchor ${anchor} not found`);
	shader.vertexShader = v
		.replace('#include <common>', `#include <common>\n${defines}\n${PARS}`)
		.replace('void main() {', 'void main() {\n\tkDeform();')
		.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = kNrm;\n#ifdef USE_TANGENT\n\tvec3 objectTangent = vec3( tangent.xyz );\n#endif')
		.replace('#include <begin_vertex>', 'vec3 transformed = kPos;\n#ifdef USE_ALPHAHASH\n\tvPosition = vec3( position );\n#endif');
}

/** A picking colour for id (1..2²⁴−1); 0 is "nothing". */
function pickColor(id: number): THREE.Vector3 {
	return new THREE.Vector3((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255);
}

/** Patch a MeshBasicMaterial's fragment shader to output a flat picking colour. */
function patchPickFragment(shader: THREE.WebGLProgramParametersWithUniforms, id: number): void {
	shader.uniforms.kPickColor = { value: pickColor(id) };
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', '#include <common>\nuniform vec3 kPickColor;')
		.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( kPickColor, 1.0 );')
		.replace('#include <tonemapping_fragment>', '')
		.replace('#include <colorspace_fragment>', '');
}

type Uniform<T> = { value: T };

export class MuscleGpu {
	readonly data: THREE.DataTexture;
	readonly sdf: THREE.Data3DTexture;
	/** shared by every patched material (the same objects, so one update reaches all) */
	readonly shared: Record<string, Uniform<unknown>>;
	private readonly buf: Float32Array;
	private readonly width: number;
	private readonly defines: string;
	private readonly key: string;
	private readonly caps: THREE.Vector4[];
	/** per mesh (solver order): its correction texture and the handle values uniform; null for none */
	private readonly corr: ({ tex: THREE.DataTexture; v: Float32Array } | null)[];
	private readonly maxH: number;
	/** stands in for a correction texture where a mesh has none */
	private readonly noCorr: THREE.DataTexture;

	constructor(private readonly system: MuscleSystem, assets: JointAssets) {
		const solver = system.solver;
		const [w, h] = solver.textureSize();
		this.width = w;
		this.buf = new Float32Array(w * h * 4);
		this.data = new THREE.DataTexture(this.buf, w, h, THREE.RGBAFormat, THREE.FloatType);
		this.data.minFilter = this.data.magFilter = THREE.NearestFilter;
		this.data.generateMipmaps = false;

		// bone distance fields stacked along z in one signed-normalized 3D texture
		const nb = assets.boneCount, grids = assets.fields;
		const ax = Math.max(1, ...grids.map((g) => g?.nx ?? 0)), ay = Math.max(1, ...grids.map((g) => g?.ny ?? 0));
		const az = Math.max(1, grids.reduce((s, g) => s + (g?.nz ?? 0), 0));
		const atlas = new Int8Array(ax * ay * az).fill(127);
		const lo: THREE.Vector4[] = [], dim: THREE.Vector4[] = [], q: number[] = [];
		let z0 = 0;
		for (let b = 0; b < nb; b++) {
			const g = grids[b];
			if (!g) {
				lo.push(new THREE.Vector4(0, 0, 0, 1));
				dim.push(new THREE.Vector4(0, 0, 0, 0));
				q.push(0);
				continue;
			}
			for (let z = 0; z < g.nz; z++)
				for (let y = 0; y < g.ny; y++)
					atlas.set(g.data.subarray((z * g.ny + y) * g.nx, (z * g.ny + y + 1) * g.nx), ((z0 + z) * ay + y) * ax);
			lo.push(new THREE.Vector4(g.lo[0], g.lo[1], g.lo[2], g.h));
			dim.push(new THREE.Vector4(g.nx, g.ny, g.nz, z0));
			q.push(127 * g.q);
			z0 += g.nz;
		}
		this.sdf = new THREE.Data3DTexture(atlas, ax, ay, az);
		this.sdf.format = THREE.RedFormat;
		this.sdf.type = THREE.ByteType;
		this.sdf.internalFormat = 'R8_SNORM';
		this.sdf.minFilter = this.sdf.magFilter = THREE.LinearFilter;
		this.sdf.unpackAlignment = 1;
		this.sdf.generateMipmaps = false;
		this.sdf.needsUpdate = true;

		this.caps = Array.from({ length: 2 * MAX_CAPSULES }, () => new THREE.Vector4());
		const maxH = (this.maxH = Math.max(1, ...system.corrections.map((c) => c?.m.H ?? 0)));
		this.noCorr = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
		this.noCorr.needsUpdate = true;
		this.corr = system.corrections.map((c) => {
			if (!c) return null;
			const { m } = c, h = Math.ceil((m.nv * 2) / CORR_WIDTH), data = new Float32Array(CORR_WIDTH * h * 4);
			for (let i = 0; i < m.nv * 4; i++) {
				data[(Math.floor(i / 4) * 2) * 4 + (i % 4)] = m.idx[i];
				data[(Math.floor(i / 4) * 2 + 1) * 4 + (i % 4)] = m.w[i];
			}
			const tex = new THREE.DataTexture(data, CORR_WIDTH, h, THREE.RGBAFormat, THREE.FloatType);
			tex.minFilter = tex.magFilter = THREE.NearestFilter;
			tex.generateMipmaps = false;
			tex.needsUpdate = true;
			return { tex, v: new Float32Array(maxH * 3) };
		});
		const c = system.collide;
		this.shared = {
			kData: { value: this.data },
			kSdf: { value: this.sdf },
			kGridLo: { value: lo },
			kGridDim: { value: dim },
			kGridQ: { value: q },
			kAtlas: { value: new THREE.Vector3(ax, ay, az) },
			kCaps: { value: this.caps },
			kCollide: { value: new THREE.Vector3(c.margin, c.soft, c.passes) },
			kEnabled: { value: 1 }
		};
		this.defines = [
			`#define K_SAMPLES ${solver.N}`,
			`#define K_BONE_ROW ${solver.strands.length}`,
			`#define K_BONES ${nb}`,
			`#define K_MAX_CAPS ${MAX_CAPSULES}`,
			`#define K_RELEASE0 ${RELEASE[0].toFixed(3)}`,
			`#define K_RELEASE1 ${RELEASE[1].toFixed(3)}`,
			`#define K_RIDGE ${RIDGE.toFixed(3)}`,
			`#define K_RIDGE_F0 ${RIDGE_FADE[0].toFixed(3)}`,
			`#define K_RIDGE_F1 ${RIDGE_FADE[1].toFixed(3)}`,
			`#define K_PROXY_B0 ${PROXY_BELLY[0].toFixed(3)}`,
			`#define K_PROXY_B1 ${PROXY_BELLY[1].toFixed(3)}`,
			`#define K_CORR ${maxH}`,
			`#define K_CORR_WIDTH ${CORR_WIDTH}`
		].join('\n');
		this.key = `kinesy-muscle-${solver.N}-${solver.strands.length}-${nb}-${maxH}`;
		if (system.capsules.length / 8 > MAX_CAPSULES) console.warn(`MuscleGpu: ${system.capsules.length / 8} proxy capsules, shader takes ${MAX_CAPSULES}`);
		this.update();
	}

	/** Whether the deformation runs (off: rest pose, for timing comparisons). */
	get enabled(): boolean {
		return this.shared.kEnabled.value === 1;
	}

	set enabled(on: boolean) {
		this.shared.kEnabled.value = on ? 1 : 0;
	}

	/** Upload the system's last solved state (call after system.update). */
	update(): void {
		this.system.solver.writeTexture(this.buf, this.width);
		this.data.needsUpdate = true;
		const C = this.system.capsules, n = Math.min(MAX_CAPSULES, C.length / 8);
		for (let i = 0; i < n; i++) {
			this.caps[2 * i].set(C[i * 8], C[i * 8 + 1], C[i * 8 + 2], C[i * 8 + 3]);
			this.caps[2 * i + 1].set(C[i * 8 + 4], C[i * 8 + 5], C[i * 8 + 6], C[i * 8 + 7]);
		}
		this.corr.forEach((c, i) => {
			if (c) c.v.set(this.system.corrections[i]!.w);
		});
	}

	/** Add the binding attributes to a muscle's (rest-pose) geometry. */
	bindGeometry(g: THREE.BufferGeometry, b: BoundMesh): void {
		g.setAttribute('kPath', new THREE.BufferAttribute(b.path, 4));
		g.setAttribute('kOffset', new THREE.BufferAttribute(b.offset, 3));
		g.setAttribute('kNormal', new THREE.BufferAttribute(b.normal, 3));
		g.setAttribute('kWeights', new THREE.BufferAttribute(b.weights, 4));
		g.setAttribute('kClear', new THREE.BufferAttribute(b.clear, 4));
		g.setAttribute('kWindow', new THREE.BufferAttribute(b.window, 1));
		g.setAttribute('kDrape', new THREE.BufferAttribute(b.drape, 3));
	}

	/** Patch a material (any built-in with begin_vertex) to deform like `b`. */
	patch<M extends THREE.Material>(material: M, b: BoundMesh, fragment?: (s: THREE.WebGLProgramParametersWithUniforms) => void, keySuffix = ''): M {
		const first = Math.min(MAX_CAPSULES, b.capFirst);
		const corr = this.corr[b.muscle];
		const own = {
			kColliders: { value: new THREE.Vector4(...b.colliders) }, kCapFirst: { value: first }, kCapCount: { value: Math.min(MAX_CAPSULES - first, b.caps) },
			kCorrTex: { value: corr?.tex ?? this.noCorr }, kCorrOn: { value: corr ? 1 : 0 }, kCorrV: { value: corr?.v ?? new Float32Array(this.maxH * 3) }
		};
		material.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, this.shared, own);
			patchVertex(shader, this.defines);
			fragment?.(shader);
		};
		material.customProgramCacheKey = () => this.key + keySuffix;
		return material;
	}

	/** Shadow materials sharing the deformation. */
	depthMaterials(b: BoundMesh): { depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial } {
		return {
			depth: this.patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), b),
			distance: this.patch(new THREE.MeshDistanceMaterial(), b)
		};
	}

	/** Flat ID material for GPU picking; deforms like `b`, or not at all for CPU-deformed meshes. */
	pickMaterial(id: number, b: BoundMesh | null): THREE.MeshBasicMaterial {
		const m = new THREE.MeshBasicMaterial({ toneMapped: false });
		if (b) return this.patch(m, b, (s) => patchPickFragment(s, id), '-pick');
		m.onBeforeCompile = (s) => patchPickFragment(s, id);
		m.customProgramCacheKey = () => 'kinesy-pick';
		return m;
	}

	dispose(): void {
		this.data.dispose();
		this.sdf.dispose();
		this.noCorr.dispose();
		for (const c of this.corr) c?.tex.dispose();
	}
}

/** Read back the id under a pixel from a 1x1 RGBA8 pick target. */
export function decodePick(px: Uint8Array): number {
	return px[0] | (px[1] << 8) | (px[2] << 16);
}
