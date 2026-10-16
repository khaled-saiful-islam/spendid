import { z } from "zod";

export const ServiceStatusSchema = z.enum(["up", "down"]);

/** Response of `GET /api/health` — read by the web app's status chip. */
export const HealthSchema = z.object({
	status: z.enum(["ok", "degraded"]),
	version: z.string(),
	uptimeSeconds: z.number().nonnegative(),
	services: z.object({
		database: ServiceStatusSchema,
		redis: ServiceStatusSchema,
	}),
});

export type Health = z.infer<typeof HealthSchema>;
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
