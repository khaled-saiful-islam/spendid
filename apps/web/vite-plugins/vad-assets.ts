import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

/** The few files the in-browser voice detector needs, served from our own origin. */
function assetFiles(): Map<string, string> {
	const vadDist = dirname(require.resolve("@ricky0123/vad-web"));
	const ortDist = dirname(require.resolve("onnxruntime-web"));
	const files = new Map<string, string>([
		["vad.worklet.bundle.min.js", join(vadDist, "vad.worklet.bundle.min.js")],
		["silero_vad_v5.onnx", join(vadDist, "silero_vad_v5.onnx")],
	]);
	for (const name of [
		"ort-wasm-simd-threaded.mjs",
		"ort-wasm-simd-threaded.wasm",
		"ort-wasm-simd-threaded.jsep.mjs",
		"ort-wasm-simd-threaded.jsep.wasm",
	]) {
		files.set(name, join(ortDist, name));
	}
	for (const [name, path] of files) if (!existsSync(path)) throw new Error(`voice asset missing: ${name} (${path})`);
	return files;
}

function contentType(name: string): string {
	if (name.endsWith(".wasm")) return "application/wasm";
	if (name.endsWith(".js") || name.endsWith(".mjs")) return "text/javascript";
	return "application/octet-stream";
}

/** Dev: serves /vad/* from node_modules. Build: emits the same files under dist/vad/. */
export function vadAssets(): Plugin {
	const files = assetFiles();
	return {
		name: "spendid-vad-assets",
		configureServer(server) {
			server.middlewares.use("/vad", (req, res, next) => {
				const path = files.get(basename((req.url ?? "").split("?")[0] ?? ""));
				if (!path) return next();
				res.setHeader("Content-Type", contentType(path));
				res.setHeader("Cache-Control", "public, max-age=86400");
				createReadStream(path).pipe(res);
			});
		},
		generateBundle() {
			for (const [name, path] of files) {
				this.emitFile({ type: "asset", fileName: `vad/${name}`, source: readFileSync(path) });
			}
		},
	};
}
