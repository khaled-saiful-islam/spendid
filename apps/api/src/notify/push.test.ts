import { describe, expect, it } from "vitest";
import { isPushService } from "./push";

describe("isPushService", () => {
	it("accepts the browsers' push services", () => {
		for (const url of [
			"https://fcm.googleapis.com/fcm/send/abc",
			"https://updates.push.services.mozilla.com/wpush/v2/abc",
			"https://wns2-par02p.notify.windows.com/w/?token=abc",
			"https://web.push.apple.com/abc",
		])
			expect(isPushService(url), url).toBe(true);
	});

	it("refuses anything else", () => {
		for (const url of [
			"not a url",
			"http://fcm.googleapis.com/fcm/send/abc",
			"https://fcm.googleapis.com:8443/fcm/send/abc",
			"https://user:pw@fcm.googleapis.com/fcm/send/abc",
			"https://fcm.googleapis.com.evil.test/abc",
			"https://evilpush.apple.com/abc",
			"https://localhost/abc",
			"https://10.0.0.5/abc",
			"https://169.254.169.254/latest/meta-data",
		])
			expect(isPushService(url), url).toBe(false);
	});
});
