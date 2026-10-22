// Plain constants (no Mongoose) so Client Components can import them.
export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];
