export function updateEnabledModelKeys(
  enabledModelKeys: string[],
  modelKey: string,
  enabled: boolean,
): string[] {
  const currentlyEnabled = enabledModelKeys.includes(modelKey);
  if (currentlyEnabled === enabled) return enabledModelKeys;
  return enabled
    ? [...enabledModelKeys, modelKey]
    : enabledModelKeys.filter((key) => key !== modelKey);
}

export function rollbackEnabledModelKeys(
  enabledModelKeys: string[],
  modelKey: string,
  requestedEnabled: boolean,
  previousEnabled: boolean,
): string[] {
  if (enabledModelKeys.includes(modelKey) !== requestedEnabled) {
    return enabledModelKeys;
  }
  return updateEnabledModelKeys(enabledModelKeys, modelKey, previousEnabled);
}
