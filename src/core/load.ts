import { decodeJointAssets, isGzip } from './assets';
import { decodeBaked } from './muscle/baked';
import { decodeCorrections } from './muscle/correct';
import type { AssetManifest, JointAssets } from './types';

/**
 * Browser loader. Accepts http(s)/relative URLs or data: URLs. Data URLs are decoded by hand
 * because some sandboxes (the Claude artifact viewer among them) block fetch() of data: URLs.
 */
export async function loadBinary(url: string): Promise<ArrayBuffer> {
	let buf: ArrayBuffer;
	if (url.startsWith('data:')) {
		const b64 = url.slice(url.indexOf(',') + 1);
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		buf = bytes.buffer;
	} else {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
		buf = await res.arrayBuffer();
	}
	return isGzip(buf) ? gunzip(buf) : buf;
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
	const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Response(stream).arrayBuffer();
}

export interface JointAssetUrls {
	manifest: AssetManifest;
	geometry: string;
	fields: string;
	/** baked lines of action (muscle/baked.ts), for joints with baked muscles */
	baked?: string;
	/** mesh corrections solved against that bake (muscle/correct.ts) */
	corrections?: string;
}

export async function loadJointAssets(src: JointAssetUrls): Promise<JointAssets> {
	const [geometry, fields, baked, corrections] = await Promise.all([
		loadBinary(src.geometry), loadBinary(src.fields), src.baked ? loadBinary(src.baked) : null, src.corrections ? loadBinary(src.corrections) : null
	]);
	const assets = decodeJointAssets(src.manifest, geometry, fields);
	if (baked) assets.baked = decodeBaked(baked);
	if (corrections) assets.corrections = decodeCorrections(corrections);
	return assets;
}
