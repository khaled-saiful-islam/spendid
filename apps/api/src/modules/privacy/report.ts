import { minorDigits, ReceiptDraftSchema } from "@spendid/shared";
import PDFDocument from "pdfkit";
import type { ExportData } from "./export-data";

/** Brand colours, matching the app's light theme. */
const PLUM = "#2a1446";
const GOLD = "#ffb224";
const INK = "#20123a";
const SOFT = "#5b4d72";
const LINE = "#ddd3ee";
const ZEBRA = "#f6f3fc";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const WIDTH = A4.width - MARGIN * 2;
const BOTTOM = A4.height - MARGIN;

/** Characters Windows-1252 (the built-in PDF fonts) can show beyond Latin-1. */
const WIN_ANSI_EXTRA = new Set(
	"€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split("").map((c) => c.codePointAt(0)),
);

/**
 * Text the built-in fonts can draw: emoji go, other scripts become "?". The attached data
 * file keeps every name exactly as written.
 */
export function pdfText(value: unknown): string {
	return String(value ?? "")
		.replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu, "")
		.replace(/[^\n\x20-\x7e\xa0-\xff]/gu, (c) =>
			WIN_ANSI_EXTRA.has(c.codePointAt(0)) ? c : "?",
		)
		.trim();
}

const money = (minor: number, currency: string) =>
	`${currency} ${(minor / 10 ** minorDigits(currency)).toLocaleString("en-US", {
		minimumFractionDigits: minorDigits(currency),
		maximumFractionDigits: minorDigits(currency),
	})}`;

const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

const METHOD_LABEL: Record<string, string> = {
	fifty_thirty_twenty: "50 / 30 / 20",
	envelope: "Envelopes",
	zero_based: "Every ringgit a job (zero-based)",
};

/** AI features in words people use. */
const FEATURE_LABEL: Record<string, string> = {
	"receipt-read": "Reading receipts",
	"merchant-match": "Matching shops",
	"voice-listen": "Hearing voice notes",
	"voice-understand": "Understanding voice notes",
	ask: "Ask Spendid, working out answers",
	"ask-question": "Ask Spendid questions",
};

/** "2026-10" as "October 2026". */
const monthLabel = (ym: string) => {
	const [y, m] = ym.split("-").map(Number) as [number, number];
	return new Intl.DateTimeFormat("en-GB", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(y, m - 1, 15)));
};

interface Column {
	label: string;
	width: number;
	align?: "left" | "right";
}

type Doc = InstanceType<typeof PDFDocument>;

/** Writes the report; every section starts on the same left edge with the same rhythm. */
class Report {
	constructor(
		readonly doc: Doc,
		readonly timeZone: string,
	) {}

	day(at: Date | string | null): string {
		if (!at) return "";
		return new Intl.DateTimeFormat("en-GB", {
			timeZone: this.timeZone,
			day: "numeric",
			month: "short",
			year: "numeric",
		}).format(new Date(at));
	}

	moment(at: Date | string): string {
		return new Intl.DateTimeFormat("en-GB", {
			timeZone: this.timeZone,
			day: "numeric",
			month: "short",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		}).format(new Date(at));
	}

	room(height: number): void {
		if (this.doc.y + height > BOTTOM) this.doc.addPage();
	}

	section(title: string, note?: string): void {
		this.room(70);
		const { doc } = this;
		doc.moveDown(1.2);
		const y = doc.y;
		doc.rect(MARGIN, y + 2, 4, 16).fill(GOLD);
		doc
			.fillColor(INK)
			.font("Helvetica-Bold")
			.fontSize(14)
			.text(title, MARGIN + 12, y, { width: WIDTH - 12 });
		if (note)
			doc
				.font("Helvetica")
				.fontSize(9)
				.fillColor(SOFT)
				.text(pdfText(note), MARGIN + 12, doc.y + 2, { width: WIDTH - 12 });
		doc.moveDown(0.6);
		doc.x = MARGIN;
	}

	empty(text: string): void {
		this.doc
			.font("Helvetica-Oblique")
			.fontSize(10)
			.fillColor(SOFT)
			.text(text, MARGIN, this.doc.y, { width: WIDTH });
	}

	pairs(rows: [string, string][]): void {
		const { doc } = this;
		for (const [label, value] of rows) {
			this.room(18);
			const y = doc.y;
			doc
				.font("Helvetica")
				.fontSize(10)
				.fillColor(SOFT)
				.text(label, MARGIN, y, { width: 150 });
			doc
				.font("Helvetica-Bold")
				.fillColor(INK)
				.text(pdfText(value) || "-", MARGIN + 160, y, { width: WIDTH - 160 });
			doc.y = Math.max(doc.y, y + 14) + 3;
		}
		doc.x = MARGIN;
	}

	/** A table that wraps long cells and repeats its header on each new page. */
	table(columns: Column[], rows: string[][]): void {
		const { doc } = this;
		const scale = WIDTH / columns.reduce((s, c) => s + c.width, 0);
		const cols = columns.map((c) => ({ ...c, width: c.width * scale }));
		const pad = 5;
		const header = () => {
			this.room(40);
			const y = doc.y;
			doc.rect(MARGIN, y, WIDTH, 18).fill(PLUM);
			let x = MARGIN;
			for (const c of cols) {
				doc
					.font("Helvetica-Bold")
					.fontSize(8.5)
					.fillColor("#ffffff")
					.text(c.label, x + pad, y + 5, {
						width: c.width - pad * 2,
						align: c.align ?? "left",
						lineBreak: false,
					});
				x += c.width;
			}
			doc.y = y + 18;
		};
		header();
		rows.forEach((row, index) => {
			doc.font("Helvetica").fontSize(8.5);
			const height =
				Math.max(
					...row.map((cell, i) =>
						doc.heightOfString(pdfText(cell) || " ", {
							width: (cols[i]?.width ?? 40) - pad * 2,
						}),
					),
				) +
				pad * 2;
			if (doc.y + height > BOTTOM) {
				doc.addPage();
				header();
			}
			const y = doc.y;
			if (index % 2 === 1) doc.rect(MARGIN, y, WIDTH, height).fill(ZEBRA);
			let x = MARGIN;
			row.forEach((cell, i) => {
				const c = cols[i];
				if (!c) return;
				doc
					.font("Helvetica")
					.fontSize(8.5)
					.fillColor(INK)
					.text(pdfText(cell), x + pad, y + pad, {
						width: c.width - pad * 2,
						align: c.align ?? "left",
					});
				x += c.width;
			});
			doc
				.moveTo(MARGIN, y + height)
				.lineTo(MARGIN + WIDTH, y + height)
				.lineWidth(0.5)
				.strokeColor(LINE)
				.stroke();
			doc.y = y + height;
		});
		doc.x = MARGIN;
	}
}

/** The cover band: the Spendid coin and name, who this is for and when it was made. */
function cover(r: Report, data: ExportData): void {
	const { doc } = r;
	doc.rect(0, 0, A4.width, 150).fill(PLUM);
	doc.circle(MARGIN + 18, 58, 18).fill(GOLD);
	doc
		.font("Helvetica-Bold")
		.fontSize(20)
		.fillColor(PLUM)
		.text("S", MARGIN + 11, 47, { width: 16, align: "center" });
	doc
		.font("Helvetica-Bold")
		.fontSize(22)
		.fillColor("#ffffff")
		.text("Spendid", MARGIN + 46, 45);
	doc
		.font("Helvetica-Bold")
		.fontSize(26)
		.fillColor(GOLD)
		.text("Your data", MARGIN, 92);
	doc
		.font("Helvetica")
		.fontSize(10)
		.fillColor("#d9ccf1")
		.text(
			pdfText(
				`${data.account?.name ?? ""} - exported ${r.moment(data.exportedAt)}`,
			),
			MARGIN,
			124,
		);
	doc.y = 172;
	doc.x = MARGIN;
	doc
		.font("Helvetica")
		.fontSize(9.5)
		.fillColor(SOFT)
		.text(
			"Everything you have put into Spendid. Your expenses as a spreadsheet, every detail as a data file and your receipt photos are also attached inside this PDF (open the attachments panel in your PDF reader).",
			{ width: WIDTH },
		);
}

/** Renders the export as a branded, readable PDF with the raw data attached. */
export function renderReport(
	data: ExportData,
	opts: { compress?: boolean } = {},
): Promise<Buffer> {
	const doc = new PDFDocument({
		size: "A4",
		margin: MARGIN,
		compress: opts.compress ?? true,
		info: {
			Title: "Your Spendid data",
			Author: "Spendid",
			Subject: "Data export",
		},
	});
	const chunks: Buffer[] = [];
	doc.on("data", (c: Buffer) => chunks.push(c));
	const done = new Promise<Buffer>((resolve, reject) => {
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);
	});

	const s = data.settings;
	const home = s?.homeCurrency ?? "MYR";
	const r = new Report(doc, s?.timeZone ?? "UTC");
	cover(r, data);

	r.section("Account and settings");
	r.pairs([
		["Name", data.account?.name ?? ""],
		["Email", data.account?.email ?? ""],
		["Username", data.account?.username ?? ""],
		["Joined", r.day(data.account?.createdAt ?? null)],
		["Home currency", home],
		[
			"Monthly income",
			s?.monthlyIncomeMinor == null
				? "Not set"
				: money(s.monthlyIncomeMinor, home),
		],
		[
			"Budget style",
			METHOD_LABEL[s?.budgetMethod ?? ""] ?? s?.budgetMethod ?? "",
		],
		["Time zone", s?.timeZone ?? ""],
		["Language", s?.locale === "ms" ? "Bahasa Melayu" : "English"],
	]);

	const byMonth = new Map<string, number>();
	for (const t of data.live) {
		const key = new Intl.DateTimeFormat("en-GB", {
			timeZone: r.timeZone,
			month: "long",
			year: "numeric",
		}).format(t.occurredAt);
		byMonth.set(key, (byMonth.get(key) ?? 0) + t.homeAmountMinor);
	}
	r.section(
		"Spending by month",
		`In your home currency (${home}), from ${data.live.length} expenses.`,
	);
	if (byMonth.size === 0) r.empty("No expenses yet.");
	else
		r.table(
			[
				{ label: "Month", width: 3 },
				{ label: "Spent", width: 2, align: "right" },
			],
			[...byMonth].map(([m, minor]) => [m, money(minor, home)]),
		);

	r.section(
		"Expenses",
		"Newest first. Amounts in the currency paid and in your home currency.",
	);
	if (data.live.length === 0) r.empty("No expenses yet.");
	else
		r.table(
			[
				{ label: "Date", width: 3.1 },
				{ label: "Shop", width: 3 },
				{ label: "Category", width: 2.1 },
				{ label: "Paid", width: 2, align: "right" },
				{ label: home, width: 2, align: "right" },
				{ label: "Note", width: 2 },
			],
			data.live.map((t) => [
				r.moment(t.occurredAt),
				t.merchant ?? "",
				t.category,
				money(t.amountMinor, t.currency),
				money(t.homeAmountMinor, t.homeCurrency),
				t.note ?? "",
			]),
		);

	r.section("Goals");
	if (data.goals.length === 0) r.empty("No goals.");
	else
		r.table(
			[
				{ label: "Goal", width: 3 },
				{ label: "Saved", width: 2, align: "right" },
				{ label: "Target", width: 2, align: "right" },
				{ label: "By", width: 2 },
				{ label: "Deposits", width: 1.4, align: "right" },
			],
			data.goals.map((g) => [
				g.name,
				money(g.savedMinor, home),
				money(g.targetMinor, home),
				r.day(g.targetDate),
				String(g.deposits.length),
			]),
		);

	r.section("Monthly limits");
	if (data.budgets.length === 0) r.empty("No limits set.");
	else
		r.table(
			[
				{ label: "Category", width: 3 },
				{ label: "Limit a month", width: 2, align: "right" },
			],
			data.budgets.map((b) => [b.category, money(b.monthlyLimitMinor, home)]),
		);

	r.section("Subscriptions and bills");
	if (data.subscriptions.length === 0) r.empty("None added.");
	else
		r.table(
			[
				{ label: "Name", width: 3 },
				{ label: "Amount", width: 2, align: "right" },
				{ label: "Every", width: 1.6 },
				{ label: "Next due", width: 2 },
				{ label: "Status", width: 1.6 },
			],
			data.subscriptions.map((x) => [
				x.name,
				money(x.amountMinor, x.currency),
				capital(x.cycle),
				r.day(x.nextDue),
				x.cancelledAt ? "Cancelled" : "Active",
			]),
		);

	r.section(
		"Family circle",
		"Other people appear by name and relation only. What they share stays theirs.",
	);
	if (data.family.connections.length === 0) r.empty("No one in your circle.");
	else
		r.table(
			[
				{ label: "With", width: 3 },
				{ label: "Relation", width: 2 },
				{ label: "Since", width: 2 },
				{ label: "Ended", width: 2 },
			],
			data.family.connections.map((c) => [
				c.with,
				capital(c.relation),
				r.day(c.since),
				r.day(c.endedAt),
			]),
		);

	r.section("Split bills");
	if (data.splits.length === 0) r.empty("No split bills.");
	else
		r.table(
			[
				{ label: "Bill", width: 3 },
				{ label: "Made", width: 2 },
				{ label: "Currency", width: 1.4 },
			],
			data.splits.map((x) => [x.title, r.day(x.createdAt), x.currency]),
		);

	r.section("Warranties");
	if (data.warranties.length === 0) r.empty("No warranties.");
	else
		r.table(
			[
				{ label: "Item", width: 3 },
				{ label: "Until", width: 2 },
			],
			data.warranties.map((w) => [w.itemName, r.day(w.endsOn)]),
		);

	r.section("Wait before you buy");
	if (data.wishes.length === 0) r.empty("Nothing on the list.");
	else
		r.table(
			[
				{ label: "Item", width: 3 },
				{ label: "Price", width: 2, align: "right" },
				{ label: "Decided", width: 2 },
			],
			data.wishes.map((w) => [
				w.name,
				money(w.priceMinor, w.currency),
				w.decision ?? "Waiting",
			]),
		);

	r.section(
		"Ask Spendid chats",
		"Titles here; every message is in the attached data file.",
	);
	if (data.chats.length === 0) r.empty("No saved chats.");
	else
		r.table(
			[
				{ label: "Chat", width: 4 },
				{ label: "Started", width: 2 },
				{ label: "Messages", width: 1.4, align: "right" },
			],
			data.chats.map((c) => [
				c.title,
				r.day(c.createdAt),
				String(Array.isArray(c.messages) ? c.messages.length : ""),
			]),
		);

	r.section("AI use", "Counts only, never what was said.");
	if (data.aiUsage.length === 0) r.empty("No AI used yet.");
	else
		r.table(
			[
				{ label: "Month", width: 2 },
				{ label: "Feature", width: 3 },
				{ label: "Uses", width: 1.4, align: "right" },
			],
			data.aiUsage.map((u) => [
				monthLabel(u.month),
				FEATURE_LABEL[u.feature] ?? u.feature,
				String(u.calls),
			]),
		);

	receipts(r, data);
	attach(doc, data);
	doc.end();
	return done;
}

/** Each receipt with what was read from it, and its photo (JPEG and PNG; all are attached). */
function receipts(r: Report, data: ExportData): void {
	const { doc } = r;
	r.room(320);
	r.section(
		"Receipts",
		`${data.receipts.length} ${data.receipts.length === 1 ? "receipt" : "receipts"}. Every photo is also attached as a file.`,
	);
	if (data.receipts.length === 0) {
		r.empty("No receipts.");
		return;
	}
	const photo = new Map(data.photos.map((p) => [p.id, p]));
	for (const rec of data.receipts) {
		r.room(236);
		const y = doc.y;
		const p = photo.get(rec.id);
		if (p && (p.mime === "image/jpeg" || p.mime === "image/png")) {
			try {
				doc.image(Buffer.from(p.bytes), MARGIN, y, { fit: [150, 220] });
			} catch {
				// An unreadable photo still leaves its details beside it.
			}
		}
		const read = ReceiptDraftSchema.safeParse(rec.draft);
		const x = MARGIN + 165;
		const w = WIDTH - 165;
		doc
			.font("Helvetica-Bold")
			.fontSize(11)
			.fillColor(INK)
			.text(
				pdfText(read.success ? read.data.merchant : "Receipt") || "Receipt",
				x,
				y,
				{
					width: w,
				},
			);
		if (read.success) {
			doc
				.font("Helvetica-Bold")
				.fontSize(10)
				.fillColor(INK)
				.text(money(read.data.totalMinor, read.data.currency), x, doc.y + 2, {
					width: w,
				});
			if (read.data.date)
				doc
					.font("Helvetica")
					.fontSize(9)
					.fillColor(SOFT)
					.text(r.day(read.data.date), x, doc.y + 1, { width: w });
			for (const item of read.data.items.slice(0, 12))
				doc
					.font("Helvetica")
					.fontSize(8.5)
					.fillColor(SOFT)
					.text(
						pdfText(
							`${item.name}  ${money(item.totalMinor, read.data.currency)}`,
						),
						x,
						doc.y + 1,
						{ width: w },
					);
		}
		doc
			.font("Helvetica")
			.fontSize(8.5)
			.fillColor(SOFT)
			.text(`Added ${r.moment(rec.createdAt)}`, x, doc.y + 4, { width: w });
		doc.y = Math.max(doc.y, y + 222) + 8;
		doc.x = MARGIN;
	}
}

/** The raw data rides along inside the PDF, for spreadsheets and other apps. */
function attach(doc: Doc, data: ExportData): void {
	const day = data.exportedAt.toISOString().slice(0, 10);
	doc.file(Buffer.from(data.csv), {
		name: `spendid-expenses-${day}.csv`,
		type: "text/csv",
		description: "Every expense, for Excel, Numbers or Google Sheets",
	});
	const { photos: _p, csv: _c, live: _l, ...rest } = data;
	doc.file(Buffer.from(JSON.stringify(rest, null, 2)), {
		name: `spendid-data-${day}.json`,
		type: "application/json",
		description: "Everything, with every field",
	});
	for (const p of data.photos)
		doc.file(Buffer.from(p.bytes), {
			name: `receipt-${p.id}.${p.ext}`,
			type: p.mime,
			description: "Receipt photo",
		});
}
