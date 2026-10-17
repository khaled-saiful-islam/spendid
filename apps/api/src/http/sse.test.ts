import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { openStream, registerStreams } from "./sse";

describe("server-sent event streams", () => {
	it("end when the server closes, so shutdown doesn't wait forever", async () => {
		const app = Fastify();
		registerStreams(app);
		let closed = false;
		app.get("/stream", (_req, reply) => {
			const send = openStream(reply, () => {
				closed = true;
			});
			send("data: hello\n\n");
		});
		await app.listen({ port: 0, host: "127.0.0.1" });
		const { port } = app.server.address() as { port: number };
		const res = await fetch(`http://127.0.0.1:${port}/stream`);
		const reader = res.body?.getReader();
		const first = await reader?.read();
		expect(new TextDecoder().decode(first?.value)).toContain("hello");

		await app.close();
		expect(closed).toBe(true);
		expect((await reader?.read())?.done).toBe(true);
	}, 5_000);
});
