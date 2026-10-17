import { useCallback, useEffect, useRef, useState } from "react";
import { createSteadiness, type Quad } from "./geometry";

export interface Photo {
	blob: Blob;
	url: string;
	width: number;
	height: number;
}

export type ScannerStatus =
	| "starting"
	| "live"
	| "processing"
	| "captured"
	| "no-camera"
	| "denied";

const DETECT_WIDTH = 480;
const DETECT_EVERY_MS = 90;

type WorkerMsg =
	| { type: "ready" }
	| { type: "quad"; id: number; points: Quad | null }
	| { type: "cropped"; blob: Blob; width: number; height: number }
	| { type: "error"; message: string };

/**
 * Live receipt scanner: camera preview, edge detection in a worker (OpenCV), auto-capture
 * once the receipt has been still for about a second, then a flattened JPEG.
 * Without OpenCV (old browser, slow load) the shutter still works with the whole frame.
 */
export function useScanner() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const worker = useRef<Worker | null>(null);
	const stream = useRef<MediaStream | null>(null);
	const pendingCrop = useRef<((p: Photo) => void) | null>(null);
	const steadiness = useRef(
		createSteadiness({ frames: 9, maxMove: 0.012, minArea: 0.12 }),
	);
	const [status, setStatus] = useState<ScannerStatus>("starting");
	const [quad, setQuad] = useState<Quad | null>(null);
	const [steady, setSteady] = useState(0);
	const [cvReady, setCvReady] = useState(false);
	const [photo, setPhoto] = useState<Photo | null>(null);
	const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({
		available: false,
		on: false,
	});
	const [autoCapture, setAutoCapture] = useState(true);
	const latestQuad = useRef<Quad | null>(null);
	const running = useRef(false);

	const cropIn = useCallback(
		(bitmap: ImageBitmap, points: Quad | null) =>
			new Promise<Photo>((resolve) => {
				pendingCrop.current = resolve;
				worker.current?.postMessage({ type: "crop", bitmap, points }, [bitmap]);
			}),
		[],
	);

	/** Grabs the full-resolution frame and flattens it. */
	const capture = useCallback(async () => {
		const video = videoRef.current;
		if (!video || status === "processing" || status === "captured") return;
		running.current = false;
		setStatus("processing");
		const bitmap = await createImageBitmap(video);
		let result: Photo;
		if (cvReady) {
			result = await cropIn(bitmap, latestQuad.current);
		} else {
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
			const blob = await canvas.convertToBlob({
				type: "image/jpeg",
				quality: 0.85,
			});
			result = {
				blob,
				url: URL.createObjectURL(blob),
				width: bitmap.width,
				height: bitmap.height,
			};
		}
		setPhoto(result);
		setStatus("captured");
	}, [cropIn, cvReady, status]);

	/** A photo from the gallery: detect corners on a small copy, then flatten the original. */
	const fromFile = useCallback(
		async (file: File) => {
			running.current = false;
			setStatus("processing");
			const full = await createImageBitmap(file, {
				imageOrientation: "from-image",
			});
			let points: Quad | null = null;
			if (cvReady) {
				const small = await createImageBitmap(full, {
					resizeWidth: DETECT_WIDTH,
				});
				points = await new Promise<Quad | null>((resolve) => {
					const w = worker.current;
					if (!w) return resolve(null);
					const onMsg = (e: MessageEvent<WorkerMsg>) => {
						if (e.data.type === "quad" && e.data.id === -1) {
							w.removeEventListener("message", onMsg);
							resolve(e.data.points);
						}
					};
					w.addEventListener("message", onMsg);
					w.postMessage({ type: "detect", id: -1, bitmap: small }, [small]);
				});
				setPhoto(await cropIn(full, points));
			} else {
				setPhoto({
					blob: file,
					url: URL.createObjectURL(file),
					width: full.width,
					height: full.height,
				});
			}
			setStatus("captured");
		},
		[cropIn, cvReady],
	);

	/** An image that needs no straightening (a rendered PDF page): use it as it is. */
	const fromReadyImage = useCallback(async (file: File) => {
		running.current = false;
		setStatus("processing");
		const bitmap = await createImageBitmap(file);
		setPhoto({
			blob: file,
			url: URL.createObjectURL(file),
			width: bitmap.width,
			height: bitmap.height,
		});
		bitmap.close();
		setStatus("captured");
	}, []);

	const retake = useCallback(() => {
		if (photo) URL.revokeObjectURL(photo.url);
		setPhoto(null);
		steadiness.current.reset();
		setSteady(0);
		setStatus(stream.current ? "live" : "no-camera");
		running.current = Boolean(stream.current);
	}, [photo]);

	const toggleTorch = useCallback(async () => {
		const track = stream.current?.getVideoTracks()[0];
		if (!track) return;
		const on = !torch.on;
		try {
			await track.applyConstraints({
				advanced: [{ torch: on } as MediaTrackConstraintSet],
			});
			setTorch({ available: true, on });
		} catch {
			setTorch({ available: false, on: false });
		}
	}, [torch.on]);

	// Worker + camera lifecycle.
	useEffect(() => {
		let cancelled = false;
		const w = new Worker("/cv/scanner.worker.js");
		worker.current = w;
		w.onmessage = (e: MessageEvent<WorkerMsg>) => {
			const msg = e.data;
			if (msg.type === "ready") setCvReady(true);
			if (msg.type === "quad" && msg.id >= 0) {
				latestQuad.current = msg.points;
				setQuad(msg.points);
				setSteady(steadiness.current.push(msg.points));
			}
			if (msg.type === "cropped") {
				pendingCrop.current?.({
					blob: msg.blob,
					url: URL.createObjectURL(msg.blob),
					width: msg.width,
					height: msg.height,
				});
				pendingCrop.current = null;
			}
		};

		(async () => {
			try {
				const media = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						facingMode: { ideal: "environment" },
						width: { ideal: 1920 },
						height: { ideal: 1080 },
					},
				});
				if (cancelled) {
					for (const t of media.getTracks()) t.stop();
					return;
				}
				stream.current = media;
				const video = videoRef.current;
				if (video) {
					video.srcObject = media;
					await video.play().catch(() => {});
				}
				const caps = media.getVideoTracks()[0]?.getCapabilities?.() as
					| { torch?: boolean }
					| undefined;
				setTorch({ available: Boolean(caps?.torch), on: false });
				setStatus("live");
				running.current = true;
			} catch (error) {
				setStatus(
					error instanceof DOMException && error.name === "NotAllowedError"
						? "denied"
						: "no-camera",
				);
			}
		})();

		return () => {
			cancelled = true;
			running.current = false;
			w.terminate();
			for (const t of stream.current?.getTracks() ?? []) t.stop();
			stream.current = null;
		};
	}, []);

	// Detection loop: one small frame in flight at a time.
	useEffect(() => {
		if (!cvReady) return;
		let busy = false;
		let id = 0;
		const timer = setInterval(async () => {
			const video = videoRef.current;
			if (
				!running.current ||
				busy ||
				!video ||
				video.readyState < 2 ||
				!worker.current
			)
				return;
			busy = true;
			try {
				const bitmap = await createImageBitmap(video, {
					resizeWidth: DETECT_WIDTH,
					resizeQuality: "low",
				});
				worker.current.postMessage({ type: "detect", id: ++id, bitmap }, [
					bitmap,
				]);
			} finally {
				setTimeout(() => {
					busy = false;
				}, DETECT_EVERY_MS);
			}
		}, DETECT_EVERY_MS);
		return () => clearInterval(timer);
	}, [cvReady]);

	// Auto-capture when steady.
	useEffect(() => {
		if (autoCapture && steady >= 1 && status === "live") void capture();
	}, [autoCapture, steady, status, capture]);

	return {
		videoRef,
		status,
		quad,
		steady,
		cvReady,
		photo,
		torch,
		autoCapture,
		setAutoCapture,
		capture,
		fromFile,
		fromReadyImage,
		retake,
		toggleTorch,
	};
}
