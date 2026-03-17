# Character Resources

A Foundry VTT module that lets **characters** define and track custom numeric resources on their own character sheets. Heavily inspired by [Party Resources](https://github.com/davelens/fvtt-party-resources) (party-wide values), but scoped per character.

## Features

- **Per-character resources** — Each character has their own list of custom resources (e.g. Hero Points, Fate Points, Sanity).
- **Add / Edit / Remove** — Manage resource definitions (name, value, optional max, optional icon) from a "Manage resources" button on the sheet.
- **Increment / Decrement** — +/- buttons on the sheet; hold **Ctrl/Cmd** for ±5, **Shift** for ±10.
- **Optional maximum** — Cap a resource and show a status bar.
- **Optional icon** — Image URL per resource.
- **System-agnostic** — Works with any system; hooks into `renderActorSheet` and `renderCharacterSheetPF2e`.

## Installation

1. Install the module using the manifest URL (or copy the module folder into your Foundry `modules` directory).
2. Enable **Character Resources** in your world.

## Usage

1. Open a character (or NPC) sheet.
2. In the **Character Resources** block, click **Manage resources**.
3. Add resources (name, initial value, optional max, optional icon).
4. Use **+** / **−** on the sheet to change values.

## Macro API

Use `game.characterResources.api` (or `window.characterResources.api`) in script macros:

```js
const actor = game.actors.get("ACTOR_ID"); // or from token, etc.

// Get all resources
game.characterResources.api.getResources(actor);

// Get one resource
game.characterResources.api.get(actor, "hero-points");

// Get/set value
game.characterResources.api.getValue(actor, "hero-points");
game.characterResources.api.set(actor, "hero-points", 3);
game.characterResources.api.increment(actor, "hero-points", 1);
game.characterResources.api.decrement(actor, "hero-points", 1);

// Add/update/remove definitions (usually done via UI)
game.characterResources.api.addResource(actor, { name: "Fate", value: 0, max: 3 });
game.characterResources.api.updateResource(actor, "fate", { max: 5 });
game.characterResources.api.removeResource(actor, "fate");
```

## Data

Resources are stored in actor flags: `actor.flags["pf2e-character-resources"].resources`. Each item has `id`, `name`, `value`, `max` (optional), `icon` (optional), and `order`.

## License

MIT.
