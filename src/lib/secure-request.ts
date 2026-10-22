/**
 * True when the browser reached us over https. Auth.js decides the session cookie name from this
 * (`__Secure-authjs.session-token` on https, `authjs.session-token` on http), and it reads the
 * protocol the same way: `x-forwarded-proto` first, then the request URL. Anything that reads the
 * session cookie by hand (proxy.ts) must use the same answer or it never finds the cookie in production.
 */
export function isHttpsRequest(headers: Pick<Headers, "get">, urlProtocol: string): boolean {
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return (forwarded || urlProtocol.replace(/:$/, "").toLowerCase()) === "https";
}
