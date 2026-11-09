/**
 * Shared tool activation for the toolkit's switchable tools. Every tool is
 * registered inactive (`defaultActive: false`) and the matching switch decides
 * whether its name is in pi's active set; unrelated tools are left untouched.
 * @module @kxh4892636/pi-toolkit/activation
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Make `names` present in the active tool set exactly when `enabled`.
 *
 * @param pi - extension API providing `getActiveTools` / `setActiveTools`.
 * @param names - tool names owned by one switch.
 * @param enabled - whether those tools belong in the active set.
 */
export const applyToolActivation = (
  pi: ExtensionAPI,
  names: readonly string[],
  enabled: boolean,
): void => {
  const owned = new Set(names);
  const active = pi.getActiveTools();
  const next = active.filter((name) => !owned.has(name) || enabled);
  if (enabled) {
    for (const name of names) {
      if (!next.includes(name)) next.push(name);
    }
  }
  const unchanged =
    next.length === active.length && next.every((name, index) => name === active[index]);
  if (!unchanged) pi.setActiveTools(next);
};
