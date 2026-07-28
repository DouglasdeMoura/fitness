type EnvLike = Record<string, string | undefined>;

/**
 * Read a required environment variable, failing on first access when absent or blank.
 * Error messages name the variable so misconfiguration is obvious at startup.
 */
export function requireEnvString(env: EnvLike, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}
