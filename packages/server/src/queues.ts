/** Notification work the API's notifier handles: the hourly digest tick and events from the worker. */
export const NOTIFY_QUEUE = "notifications";

export type NotifyJob = { kind: "tick" } | { kind: "ai-limit"; userId: string };
