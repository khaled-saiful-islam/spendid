import { describe, expect, it } from "vitest";
import { parseEventData, reconnectDelay } from "./sse";

describe("parseEventData", () => {
	it("reads JSON and shrugs off anything else", () => {
		expect(parseEventData('{"type":"receipt"}')).toEqual({ type: "receipt" });
		expect(parseEventData("<html>Bad gateway</html>")).toBeUndefined();
		expect(parseEventData('{"type":')).toBeUndefined();
	});
});

describe("reconnectDelay", () => {
	it("waits longer after each failure, up to a minute", () => {
		const half = () => 1;
		expect(reconnectDelay(0, half)).toBe(1_000);
		expect(reconnectDelay(3, half)).toBe(8_000);
		expect(reconnectDelay(20, half)).toBe(60_000);
	});

	it("spreads retries out so many apps don't reconnect at once", () => {
		expect(reconnectDelay(3, () => 0)).toBe(4_000);
	});
});
