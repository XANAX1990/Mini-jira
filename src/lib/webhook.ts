import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/User";

// Outbound notification to n8n (see PLAN.md, Phase 11). Rule number one: this must never get in
// the way of an issue action. Nothing in here may throw into the caller, nothing awaits the
// network before the action answers, and an unset N8N_WEBHOOK_URL means "do nothing, quietly".

export type WebhookEvent = "issue.created" | "issue.priority_high";

export type IssueWebhookPayload = {
  event: WebhookEvent;
  projectKey: string;
  number: number;
  title: string;
  priority: string;
  assignee: string | null;
  url: string;
  sentAt: string;
};

export const WEBHOOK_TIMEOUT_MS = 3000;

/** `sha256=<hex>`: HMAC-SHA256 of exactly this body string. */
export function signBody(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/** Only the moment the priority *becomes* high counts; saving a high issue again does not. */
export function isPriorityRaisedToHigh(previous: string | null | undefined, next: string | null | undefined): boolean {
  return next === "high" && previous !== "high";
}

export function issueUrl(origin: string, projectKey: string, number: number): string {
  return `${origin.replace(/\/+$/, "")}/projects/${projectKey}/issues/${number}`;
}

export function buildPayload(input: {
  event: WebhookEvent;
  projectKey: string;
  number: number;
  title: string;
  priority: string;
  assignee: string | null;
  origin: string;
  now: Date;
}): IssueWebhookPayload {
  return {
    event: input.event,
    projectKey: input.projectKey,
    number: input.number,
    title: input.title,
    priority: input.priority,
    assignee: input.assignee,
    url: issueUrl(input.origin, input.projectKey, input.number),
    sentAt: input.now.toISOString(),
  };
}

type Logger = { error: (message: string) => void; warn: (message: string) => void };

/**
 * One short line about an error. n8n webhook URLs carry a secret in their path, and `fetch` puts the
 * URL in some messages (even a mistyped one without `https://`), so the configured values are masked
 * as well as anything that looks like a URL.
 */
function describeError(err: unknown, ...hide: (string | undefined)[]): string {
  let raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  for (const value of hide) if (value) raw = raw.split(value).join("<hidden>");
  return raw.replace(/https?:\/\/\S+/gi, "<url>").slice(0, 160);
}

let warnedAboutSecret = false;

/**
 * POST the payload, signed. Resolves in every case: a missing config, a slow or dead n8n, a non-2xx
 * answer are logged as one line (without the URL, the secret or the body) and swallowed.
 */
export async function deliverWebhook(
  payload: IssueWebhookPayload,
  options: {
    url: string | undefined;
    secret: string | undefined;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
    log?: Logger;
  }
): Promise<void> {
  const { url, secret, timeoutMs = WEBHOOK_TIMEOUT_MS, fetchFn = fetch, log = console } = options;
  try {
    if (!url) return;
    if (!secret) {
      // Never send an unsigned message: the receiver could not tell it from a forged one.
      if (!warnedAboutSecret) {
        warnedAboutSecret = true;
        log.warn("[n8n] N8N_WEBHOOK_URL is set but N8N_WEBHOOK_SECRET is not: webhook skipped");
      }
      return;
    }
    const body = JSON.stringify(payload); // this exact string is signed and sent
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "mini-jira-webhook",
        "X-Signature": signBody(body, secret),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual", // never pass the signature on to a redirect target
    });
    if (!res.ok) log.error(`[n8n] webhook answered HTTP ${res.status}`);
  } catch (err) {
    log.error(`[n8n] webhook failed: ${describeError(err, url, secret)}`);
  }
}

/** For tests: forget that the missing-secret warning was already shown. */
export function resetWebhookWarnings() {
  warnedAboutSecret = false;
}

/**
 * The origin used in the issue link. A request header is only a last resort (local development):
 * anyone who can call a Server Action can send their own `x-forwarded-host`, and the link ends up in
 * somebody's chat. So: APP_URL, then the production domain Vercel itself provides, then the request.
 */
async function resolveOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel && process.env.VERCEL_ENV === "production") return `https://${vercel}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}

async function assigneeName(assigneeId: string | null): Promise<string | null> {
  if (!assigneeId) return null;
  try {
    await connectDB();
    const user = await UserModel.findById(assigneeId).select("name").lean();
    return user?.name ?? null;
  } catch {
    return null; // a name is nice to have; the alert goes out without it
  }
}

/**
 * Called from an issue action after the change is saved. Does nothing at all when
 * N8N_WEBHOOK_URL is unset. Otherwise the send (and the assignee lookup) is handed to `after()`:
 * it runs once the action has already answered, and on Vercel the function is kept alive for it.
 */
export async function scheduleIssueWebhook(input: {
  event: WebhookEvent;
  projectKey: string;
  number: number;
  title: string;
  priority: string;
  assigneeId: string | null;
}): Promise<void> {
  try {
    const url = process.env.N8N_WEBHOOK_URL?.trim();
    if (!url) return;
    const origin = await resolveOrigin();
    const secret = process.env.N8N_WEBHOOK_SECRET;
    after(async () => {
      const assignee = await assigneeName(input.assigneeId);
      const payload = buildPayload({ ...input, assignee, origin, now: new Date() });
      await deliverWebhook(payload, { url, secret });
    });
  } catch (err) {
    console.error(`[n8n] could not schedule the webhook: ${describeError(err)}`);
  }
}
