import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Spendid admins manage accounts, never people's money or identities.
 * Compared with Better Auth's default admin role this removes:
 *  - impersonate / impersonate-admins (no "log in as user")
 *  - set-password / set-email / update (no way to take over an account)
 */
export const ac = createAccessControl(defaultStatements);

export const adminRole = ac.newRole({
	user: ["create", "list", "set-role", "ban", "delete", "get"],
	session: ["list", "revoke", "delete"],
});

export const userRole = ac.newRole({ user: [], session: [] });
