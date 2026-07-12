import type { UiModel } from "../../../shared/types.ts";

export function filterAndSortModels(models: UiModel[], query: string): UiModel[] {
  const normalizedQuery = query.trim().toLowerCase();
  return [...models]
    .filter((model) => (
      !normalizedQuery ||
      `${model.name} ${model.id} ${model.providerName}`.toLowerCase().includes(normalizedQuery)
    ))
    .sort((a, b) => (
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
      a.providerName.localeCompare(b.providerName, "en", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id, "en", { sensitivity: "base" })
    ));
}
