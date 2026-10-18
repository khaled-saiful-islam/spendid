import { describe, expect, it } from "vitest";
import { inAppBrowser, installPlatform } from "./install";

const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID =
	"Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const CHROME_IOS =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";

describe("installPlatform", () => {
	it("knows an iPhone, and an iPad that asks for the desktop site", () => {
		expect(installPlatform(IPHONE, 5)).toBe("ios");
		expect(installPlatform(IPAD_DESKTOP_MODE, 5)).toBe("ios");
		expect(installPlatform(CHROME_IOS, 5)).toBe("ios");
	});

	it("knows Android and a Mac without touch", () => {
		expect(installPlatform(ANDROID, 5)).toBe("android");
		expect(installPlatform(IPAD_DESKTOP_MODE, 0)).toBe("desktop");
	});
});

describe("inAppBrowser", () => {
	it("spots browsers inside other apps, which can't install", () => {
		expect(
			inAppBrowser(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]",
			),
		).toBe("Facebook");
		expect(
			inAppBrowser(
				"Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 Instagram 350.0.0",
			),
		).toBe("Instagram");
		expect(
			inAppBrowser(
				"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36 Telegram-Android/11.2",
			),
		).toBe("Telegram");
		expect(inAppBrowser(`${IPHONE} Line/14.0`)).toBe("LINE");
		expect(inAppBrowser(`${ANDROID} MicroMessenger/8.0`)).toBe("WeChat");
		expect(inAppBrowser(`${ANDROID} musical_ly_2024`)).toBe("TikTok");
		expect(
			inAppBrowser(
				"Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 Version/4.0 Chrome/141.0 Mobile Safari/537.36",
			),
		).toBe("another app");
	});

	it("leaves real browsers alone", () => {
		expect(inAppBrowser(IPHONE)).toBeNull();
		expect(inAppBrowser(ANDROID)).toBeNull();
		expect(inAppBrowser(CHROME_IOS)).toBeNull();
	});
});
