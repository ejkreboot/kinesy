import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Dev server only, for the Tune panel: POST /__kinesy/tuning?joint=<id> with a joint's tuning (JSON) writes
 * it to src/joints/<id>/tuning.json, without reloading the page that saved it, and re-solves the joint's
 * mesh corrections against it in the background (`scripts/correct.ts <id> --existing`; a save during a run
 * runs it again after). GET /__kinesy/tuning/status?joint=<id> reports that run. The corrections file is
 * kept from reloading pages as well: the panel offers a reload once it is written.
 */
function tuningSave(): Plugin {
	type Job = { running: boolean; again: boolean; started: number; last: { ok: boolean; at: number; message: string } | null };
	const jobs = new Map<string, Job>();
	const tsx = resolve(__dirname, 'node_modules/.bin/tsx');
	const correct = (joint: string) => {
		const j = jobs.get(joint) ?? jobs.set(joint, { running: false, again: false, started: 0, last: null }).get(joint)!;
		if (j.running) {
			j.again = true;
			return;
		}
		// a joint without mesh corrections (no bake: the hand) has none to re-solve
		if (!existsSync(resolve(__dirname, 'assets', joint, 'corrections.bin.gz'))) {
			j.last = { ok: true, at: Date.now(), message: `${joint}: nothing to correct` };
			return;
		}
		Object.assign(j, { running: true, again: false, started: Date.now() });
		const child = spawn(tsx, ['scripts/correct.ts', joint, '--existing'], { cwd: __dirname });
		let tail = '';
		const keep = (d: Buffer) => (tail = (tail + d.toString()).slice(-2000));
		child.stdout.on('data', keep);
		child.stderr.on('data', keep);
		child.on('close', (code) => {
			const lines = tail.trim().split('\n').filter((l) => !/poses, /.test(l));
			j.running = false;
			j.last = { ok: code === 0, at: Date.now(), message: lines.slice(-3).join('\n') };
			if (j.again) correct(joint);
		});
	};
	return {
		name: 'kinesy-tuning-save',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/__kinesy/tuning', (req, res) => {
				const url = new URL(req.url ?? '', 'http://x'), joint = url.searchParams.get('joint') ?? '';
				const file = resolve(__dirname, 'src/joints', joint, 'tuning.json');
				if (!/^[a-z]+$/.test(joint) || !existsSync(file)) {
					res.statusCode = 400;
					res.end('bad request');
					return;
				}
				if (url.pathname === '/status' && req.method === 'GET') {
					const j = jobs.get(joint);
					res.setHeader('content-type', 'application/json');
					res.end(JSON.stringify({ running: !!j?.running, queued: !!j?.again, started: j?.started ?? 0, last: j?.last ?? null }));
					return;
				}
				if (req.method !== 'POST') {
					res.statusCode = 405;
					res.end('POST the tuning');
					return;
				}
				let body = '';
				req.on('data', (c) => (body += c));
				req.on('end', () => {
					try {
						writeFileSync(file, JSON.stringify(JSON.parse(body), null, '\t') + '\n');
						correct(joint);
						res.end('ok');
					} catch (e) {
						res.statusCode = 400;
						res.end(String(e));
					}
				});
			});
		},
		// the page that saved the tuning already has it; corrections are offered as a reload
		handleHotUpdate: ({ file }) => (file.endsWith('/tuning.json') || file.endsWith('/corrections.bin.gz') ? [] : undefined)
	};
}

export default defineConfig(({ mode }) => {
	const artifact = mode === 'artifact';
	return {
		assetsInclude: ['**/*.bin.gz'],
		plugins: artifact ? [viteSingleFile()] : [tuningSave()],
		build: {
			outDir: artifact ? 'dist-artifact' : 'dist',
			target: 'es2022',
			// singlefile raises the inline limit so binary assets become data: URIs
			chunkSizeWarningLimit: 4000
		}
	};
});
