import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`                  -> dist/          static site (assets emitted as files)
// `vite build --mode artifact`  -> dist-artifact/ one self-contained HTML file (assets inlined)
export default defineConfig(({ mode }) => {
	const artifact = mode === 'artifact';
	return {
		assetsInclude: ['**/*.bin.gz'],
		plugins: artifact ? [viteSingleFile()] : [],
		build: {
			outDir: artifact ? 'dist-artifact' : 'dist',
			target: 'es2022',
			// singlefile raises the inline limit so binary assets become data: URIs
			chunkSizeWarningLimit: 4000
		}
	};
});
