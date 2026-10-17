import { afterEach, describe, expect, it } from "vitest";
import {
	addDays,
	appDayOf,
	appHour,
	appToday,
	formatDay,
	formatTime,
	momentOnDay,
	setAppTimeZone,
} from "./time";

describe("app time zone", () => {
	afterEach(() => setAppTimeZone("Asia/Kuala_Lumpur"));

	it("shows times in the app's zone, whatever the device says", () => {
		setAppTimeZone("Asia/Kuala_Lumpur");
		// 14:02 UTC is 10:02 pm in Kuala Lumpur.
		expect(formatTime("2026-10-17T14:02:35Z")).toMatch(/10:02/);
		setAppTimeZone("UTC");
		expect(formatTime("2026-10-17T14:02:35Z")).toMatch(/2:02/);
	});

	it("knows which day it is in the app's zone", () => {
		setAppTimeZone("Asia/Kuala_Lumpur");
		// 1 am on the 18th in Kuala Lumpur is still the 17th in UTC.
		expect(appToday(new Date("2026-10-17T17:00:00Z"))).toBe("2026-10-18");
		expect(appDayOf("2026-10-17T15:59:00Z")).toBe("2026-10-17");
		expect(appHour(new Date("2026-10-17T14:30:00Z"))).toBe(22);
		expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
	});

	it("files an expense for today at the moment it's logged, another day at noon there", () => {
		setAppTimeZone("Asia/Kuala_Lumpur");
		const now = new Date("2026-10-17T13:54:00Z");
		expect(momentOnDay("2026-10-17", now)).toBe("2026-10-17T13:54:00.000Z");
		expect(momentOnDay("2026-10-16", now)).toBe("2026-10-16T04:00:00.000Z");
	});

	it("shows a calendar day as that day, with no shift", () => {
		setAppTimeZone("Pacific/Kiritimati");
		expect(formatDay("2026-10-17", { day: "numeric", month: "short" })).toMatch(
			/17/,
		);
	});

	it("ignores a zone name it doesn't know", () => {
		setAppTimeZone("Not/AZone");
		expect(formatTime("2026-10-17T14:02:35Z")).toMatch(/10:02/);
	});
});
