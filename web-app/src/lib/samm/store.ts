/**
 * The SAMM data of the views: the pinned models, the scopes and the assessments, read through the one client. A model
 * never changes once pinned, so it is kept for the visit; scopes and assessments are read fresh whenever a view asks,
 * so a save by another assessor is never hidden by a cache (AUN-WEB-5).
 */
import { apiClient } from '../api/client';
import type { SammModel } from '../api/types';

const models = new Map<string, Promise<SammModel>>();

/**
 * @param version a pinned model version
 * @returns the model, read once per visit
 */
export function loadModel(version: string): Promise<SammModel> {
  let model = models.get(version);
  if (!model) {
    model = apiClient.getSammModel(version);
    models.set(version, model);
    model.catch(() => models.delete(version));
  }
  return model;
}

/** Forgets every model, for tests. */
export function clearModels(): void {
  models.clear();
}
