# Privacy and your data

Spendid holds people's money lives, so the rules here are strict and enforced in code and tests.

## Admins never see spending

- Admins manage accounts and AI allowances only. Every money, family and insight route uses
  `requireMember`, which refuses admin sessions.
- `apps/api/src/modules/admin/admin.boundary.test.ts` fails the build if admin code ever reads a
  spending or family table.
- The web app sends admins to `/admin`; `/app/*` is never shown to them (covered in `e2e/tests/admin.spec.ts`).

## Download everything (Me → Your data)

1. **Download my data** queues a job (`POST /api/me/export`).
2. The API builds a zip, encrypts it with the receipt key, and keeps it for 24 hours.
3. The page updates live (server-sent event `export`) and an email says it's ready.
4. `GET /api/me/exports/:id/download` streams it to the signed-in owner only.

The zip contains a `README.txt` plus:

| File | What |
|---|---|
| `account.json` | Account, settings, email choices |
| `transactions.csv` / `.json` | Every expense (CSV opens in Excel, Numbers, Google Sheets) |
| `categories.json`, `budgets.json`, `goals.json` | Plan data, goal deposits included |
| `receipts.json` + `receipts/` | What was read from each receipt, and the photos |
| `warranties.json`, `wishlist.json`, `check-ins.json` | Reminders, impulse-pause items, nightly check-ins |
| `family.json` | Circle members, relation, and what each side shares |

## Receipt photos

- Stored encrypted on the server (AES-256-GCM, a random IV per file); only the owner can open them.
- The full photo is read once by ILMU; then a smaller copy is kept (JPEG, longest side 1200 px,
  still readable as proof) and the full one is deleted (`apps/worker/src/receipt-photo.ts`).
- A receipt discarded before saving is deleted straight away. A saved one stays with its expense.
- When an expense is removed, its photo stays for 7 days so Undo brings it back, then a daily job
  deletes it for good (`apps/worker/src/receipt-tidy.ts`). The removed expense itself stays removed.

## Delete the account

`DELETE /api/me` needs the password and the word `DELETE` typed. It removes every row and every
receipt photo and export file, ends sessions, and sends a final "account deleted" email. Family
members stop seeing anything immediately. It can't be undone; the page suggests downloading first.

## Hide amounts

The eye button in the header blurs every amount (`.num` and `[data-money]`) for screen sharing or
public places. The choice is kept per device (`localStorage` key `spendid.hideMoney`). Emails have
their own *Hide amounts* setting under **Me → Emails**.

## Sharing

Family sharing needs both people to agree, shows exactly what the other side sees, and can be
paused or stopped by either side at any time. See the README's *Try Family Circle*.
