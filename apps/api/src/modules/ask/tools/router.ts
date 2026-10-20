/**
 * Which kinds of tools a question needs. ILMU picks the right tool more reliably from a short
 * list, so each question gets the everyday tools plus only the areas it mentions.
 */
export const AREAS = [
	"expenses",
	"subscriptions",
	"goals",
	"plan",
	"challenges",
	"family",
	"settings",
	"data",
	"receipt",
] as const;
export type Area = (typeof AREAS)[number];

/** English and Malay words that point at an area. Matched on whole words, case-insensitive. */
const WORDS: Record<Exclude<Area, "receipt">, string[]> = {
	expenses: [
		"edit",
		"change",
		"fix",
		"correct",
		"wrong",
		"delete",
		"remove",
		"undo",
		"actually",
		"instead",
		"mistake",
		"typo",
		"duplicate",
		"twice",
		"move",
		"padam",
		"buang",
		"tukar",
		"ubah",
		"betulkan",
		"salah",
		"sepatutnya",
		"pindah",
	],
	subscriptions: [
		"subscription",
		"subscriptions",
		"bill",
		"bills",
		"netflix",
		"spotify",
		"youtube",
		"disney",
		"unifi",
		"astro",
		"tnb",
		"electricity",
		"gym",
		"insurance",
		"paid",
		"cancel",
		"unsubscribe",
		"renew",
		"due",
		"langganan",
		"bil",
		"bayar",
		"dibayar",
		"batal",
	],
	goals: [
		"goal",
		"goals",
		"save",
		"saving",
		"savings",
		"jar",
		"jars",
		"target",
		"deadline",
		"archive",
		"withdraw",
		"tabung",
		"simpan",
		"simpanan",
		"matlamat",
	],
	plan: [
		"budget",
		"limit",
		"cap",
		"income",
		"salary",
		"paycheck",
		"earn",
		"earning",
		"envelope",
		"zero-based",
		"50/30/20",
		"transfer",
		"transfers",
		"style",
		"method",
		"gaji",
		"pendapatan",
		"had",
		"belanjawan",
		"bajet",
	],
	challenges: [
		"challenge",
		"challenges",
		"no-spend",
		"cook",
		"cooking",
		"cabaran",
		"masak",
	],
	family: [
		"family",
		"wife",
		"husband",
		"spouse",
		"partner",
		"mum",
		"mom",
		"dad",
		"parent",
		"parents",
		"son",
		"daughter",
		"kid",
		"kids",
		"child",
		"brother",
		"sister",
		"share",
		"sharing",
		"pause",
		"resume",
		"invite",
		"split",
		"owe",
		"owes",
		"circle",
		"keluarga",
		"isteri",
		"suami",
		"ibu",
		"ayah",
		"anak",
		"abang",
		"kakak",
		"adik",
		"kongsi",
		"bahagi",
		"jemput",
	],
	settings: [
		"language",
		"english",
		"malay",
		"bahasa",
		"melayu",
		"hide",
		"blur",
		"quiet",
		"notification",
		"notifications",
		"email",
		"emails",
		"reminder",
		"reminders",
		"setting",
		"settings",
		"emel",
		"senyap",
		"sembunyi",
		"tetapan",
	],
	data: ["download", "export", "backup", "eksport", "muat"],
};

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const PATTERNS = Object.fromEntries(
	Object.entries(WORDS).map(([area, words]) => [
		area,
		new RegExp(
			`(^|[^\\p{L}\\d])(${words.map(escapeRe).join("|")})(?=$|[^\\p{L}\\d])`,
			"iu",
		),
	]),
) as Record<Exclude<Area, "receipt">, RegExp>;

/**
 * The areas a question touches. `texts` is the question plus the last turns, so a follow-up
 * ("yes, the second one") keeps the tools of what came before. `people` are the first names in
 * the person's family circle: "split it with Adam" means family.
 */
export function pickAreas(
	texts: string[],
	opts: { people?: string[]; hasReceipt?: boolean } = {},
): Set<Area> {
	const text = texts.join("\n");
	const areas = new Set<Area>();
	for (const [area, pattern] of Object.entries(PATTERNS))
		if (pattern.test(text)) areas.add(area as Area);
	for (const name of opts.people ?? []) {
		if (
			name.length >= 2 &&
			new RegExp(`(^|[^\\p{L}])${escapeRe(name)}(?=$|[^\\p{L}])`, "iu").test(
				text,
			)
		)
			areas.add("family");
	}
	if (opts.hasReceipt) areas.add("receipt");
	return areas;
}
