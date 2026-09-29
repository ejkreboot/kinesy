import type { Pose } from '../core/rig';
import type { JointModel } from './model';
import type { Stage } from './stage';

export interface BenchStats {
	/** per frame: pose applied (paths solved, uploaded), scene rendered, GPU waited for */
	frameMs: { mean: number; median: number; p95: number };
	/** per frame: the pose step alone (CPU) */
	poseMs: { mean: number };
	/** per frame: GPU time of the render from timer queries, where the browser exposes them */
	gpuMs: { mean: number } | null;
	/** frames per second if every frame cost the mean */
	fps: number;
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

function stats(frame: number[], pose: number[], gpu: number[]): BenchStats {
	const s = [...frame].sort((a, b) => a - b), m = mean(frame);
	return {
		frameMs: { mean: m, median: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)] },
		poseMs: { mean: mean(pose) },
		gpuMs: gpu.length ? { mean: mean(gpu) } : null,
		fps: 1000 / m
	};
}

/**
 * Time a sweep between two poses with the centerline deformation on and then off. Each frame is
 * rendered and then read back (one pixel), which waits for the GPU to finish, so GPU work counts;
 * GPU time alone comes from EXT_disjoint_timer_query_webgl2 where the browser offers it.
 */
export async function benchDeformation(stage: Stage, model: JointModel, from: Pose, to: Pose, frames = 120): Promise<{ on: BenchStats; off: BenchStats }> {
	const gl = stage.renderer.getContext() as WebGL2RenderingContext;
	const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
	const px = new Uint8Array(4);
	const run = async (on: boolean): Promise<BenchStats> => {
		model.setDeformation(on);
		const frame: number[] = [], pose: number[] = [], queries: WebGLQuery[] = [];
		for (let i = 0; i < frames; i++) {
			const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frames), p: Pose = {};
			for (const k in to) p[k] = (from[k] ?? 0) + ((to[k] ?? 0) - (from[k] ?? 0)) * u;
			const t0 = performance.now();
			model.setPose(p);
			model.applyPose();
			const t1 = performance.now();
			const q = timer ? gl.createQuery() : null;
			if (q) gl.beginQuery(timer!.TIME_ELAPSED_EXT, q);
			stage.renderer.render(stage.scene, stage.camera);
			if (q) {
				gl.endQuery(timer!.TIME_ELAPSED_EXT);
				queries.push(q);
			}
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			frame.push(performance.now() - t0);
			pose.push(t1 - t0);
		}
		// timer results arrive a frame or two later
		await new Promise((r) => setTimeout(r, 100));
		const gpu: number[] = [];
		if (timer && !gl.getParameter(timer.GPU_DISJOINT_EXT))
			for (const q of queries.slice(5)) if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
		for (const q of queries) gl.deleteQuery(q);
		return stats(frame.slice(5), pose.slice(5), gpu);
	};
	await run(true); // warm-up: compile programs, upload textures
	const on = await run(true), off = await run(false);
	model.setDeformation(true);
	stage.requestRender();
	return { on, off };
}
