import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { localAssets } from "./vite-plugins/local-assets";

export default defineConfig({
	plugins: [
		// Must run before the React plugin so generated routes are transformed too.
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		tailwindcss(),
		// Voice (Silero VAD + ONNX) and camera (OpenCV) files come from our own origin, never a CDN.
		localAssets(),
	],
	// Bundle the VAD with its ONNX runtime so the browser never sees a bare `require`.
	optimizeDeps: { include: ["@ricky0123/vad-web", "onnxruntime-web/wasm"] },
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	server: {
		host: "0.0.0.0",
		port: 8600,
		strictPort: true,
		proxy: {
			"/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:8601" },
		},
	},
});
