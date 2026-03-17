/**
 * Character Resources — per-character custom resources on character sheets.
 * Inspired by Party Resources (https://github.com/davelens/fvtt-party-resources).
 */

import * as api from "./api.js";
import { renderCharacterResources, injectResourcesIntoSheet, injectResourcesButtonOnly } from "./sheet.js";

const MODULE_ID = "pf2e-character-resources";

Hooks.once("init", () => {
  const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
  game.characterResources = { api, version };
  // Expose on window for macro access (e.g. game.characterResources.api.get(actor, "fate"))
  if (typeof window !== "undefined") window.characterResources = game.characterResources;
});

Hooks.once("ready", () => {
  // Optional: render a global status bar or dashboard per character; can be added later
});

// Inject resources block into any actor sheet (character or NPC)
// Skip PF2e character sheet: that one gets only the button via renderCharacterSheetPF2e
Hooks.on("renderActorSheet", (app, html, data) => {
  if (app.constructor?.name === "CharacterSheetPF2e") return;
  injectResourcesIntoSheet(app, html);
});

// PF2e-specific: inject only a button to avoid breaking the sheet layout (avatar overlap)
Hooks.on("renderCharacterSheetPF2e", (app, html, data) => {
  injectResourcesButtonOnly(app, html);
});

export { api, renderCharacterResources, injectResourcesIntoSheet };
