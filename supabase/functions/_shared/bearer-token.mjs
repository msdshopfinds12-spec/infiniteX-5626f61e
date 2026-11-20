/** Parse exactly one HTTP Bearer credential without decoding or trusting its claims. */
export function parseBearerToken(header) {
  if (typeof header !== "string") return null;
  const value = header.trim();
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match ? match[1] : null;
}
