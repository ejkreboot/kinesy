import { decodeJointAssets, isGzip } from './assets';
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
}

export async function loadJointAssets(src: JointAssetUrls): Promise<JointAssets> {
	const [geometry, fields] = await Promise.all([loadBinary(src.geometry), loadBinary(src.fields)]);
	return decodeJointAssets(src.manifest, geometry, fields);
}
