import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

/**
 * Heavy browser-only files (voice detector, OpenCV) served from our own origin under
 * `/vad/*` and `/cv/*`. Kept out of Vite's bundler on purpose: they're large, load only
 * when the mic or camera opens, and pre-bundling them exhausted the dev container's memory.
 */
function assetFiles(): Map<string, string> {
	const vadDist = dirname(require.resolve("@ricky0123/vad-web"));
	const ortDist = dirname(require.resolve("onnxruntime-web"));
	const cvDist = dirname(require.resolve("@techstark/opencv-js"));
	const workers = fileURLToPath(new URL("../workers", import.meta.url));
	const files = new Map<string, string>([
		["vad/vad.worklet.bundle.min.js", join(vadDist, "vad.worklet.bundle.min.js")],
		["vad/silero_vad_v5.onnx", join(vadDist, "silero_vad_v5.onnx")],
		["cv/opencv.js", join(cvDist, "opencv.js")],
		["cv/scanner.worker.js", join(workers, "scanner.worker.js")],
	]);
	for (const name of [
		"ort-wasm-simd-threaded.mjs",
		"ort-wasm-simd-threaded.wasm",
		"ort-wasm-simd-threaded.jsep.mjs",
		"ort-wasm-simd-threaded.jsep.wasm",
	]) {
		files.set(`vad/${name}`, join(ortDist, name));
	}
	for (const [name, path] of files) if (!existsSync(path)) throw new Error(`browser asset missing: ${name} (${path})`);
	return files;
}

function contentType(name: string): string {
	if (name.endsWith(".wasm")) return "application/wasm";
	if (name.endsWith(".js") || name.endsWith(".mjs")) return "text/javascript";
	return "application/octet-stream";
}

/** Dev: serves the files from node_modules. Build: emits them under dist/ at the same paths. */
export function localAssets(): Plugin {
	const files = assetFiles();
	return {
		name: "spendid-local-assets",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = files.get((req.url ?? "").split("?")[0]?.replace(/^\//, "") ?? "");
				if (!path) return next();
				res.setHeader("Content-Type", contentType(path));
				res.setHeader("Cache-Control", "public, max-age=86400");
				createReadStream(path).pipe(res);
			});
		},
		generateBundle() {
			for (const [name, path] of files) {
				this.emitFile({ type: "asset", fileName: name, source: readFileSync(path) });
			}
		},
	};
}
