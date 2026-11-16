let amplifySecrets: Record<string, unknown> | undefined;

function getAmplifySecrets() {
  if (amplifySecrets) return amplifySecrets;
  const serialized = process.env.secrets;
  if (!serialized) return (amplifySecrets = {});

  try {
    const parsed: unknown = JSON.parse(serialized);
    amplifySecrets = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    amplifySecrets = {};
  }
  return amplifySecrets;
}

export function getServerEnvironmentValue(name: string) {
  const directValue = process.env[name];
  if (directValue) return directValue;

  const secretValue = getAmplifySecrets()[name];
  return typeof secretValue === "string" ? secretValue : undefined;
}
