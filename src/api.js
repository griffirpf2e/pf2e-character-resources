/**
 * API for character-scoped resources. Data is stored in actor.flags["pf2e-character-resources"].
 * @module api
 */

const FLAG_SCOPE = "pf2e-character-resources";
const FLAG_KEY = "resources";

/**
 * @typedef {Object} CharacterResource
 * @property {string} id - Unique id (e.g. slug)
 * @property {string} name - Display name
 * @property {number} value - Current value
 * @property {number|null} [max=null] - Optional maximum (null = no cap)
 * @property {string} [icon] - Optional icon image path
 * @property {number} [order=0] - Sort order
 * @property {string} [description] - Optional custom description (for non-linked resources)
 * @property {string} [uuid] - Optional document UUID (feat, spell, item) for linked resources; name/icon from document
 */

/**
 * Get the resources array from an actor (default empty array).
 * @param {Actor} actor
 * @returns {CharacterResource[]}
 */
export function getResources(actor) {
  if (!actor?.flags?.[FLAG_SCOPE]?.[FLAG_KEY]) return [];
  return foundry.utils.duplicate(actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? []);
}

/**
 * Replace all resources on an actor.
 * @param {Actor} actor
 * @param {CharacterResource[]} resources
 */
export async function setResources(actor, resources) {
  await actor.setFlag(FLAG_SCOPE, FLAG_KEY, resources);
}

/**
 * Get a single resource by id.
 * @param {Actor} actor
 * @param {string} resourceId
 * @returns {CharacterResource|undefined}
 */
export function get(actor, resourceId) {
  const list = getResources(actor);
  return list.find((r) => r.id === resourceId);
}

/**
 * Get current value of a resource (0 if missing).
 * @param {Actor} actor
 * @param {string} resourceId
 * @returns {number}
 */
export function getValue(actor, resourceId) {
  const r = get(actor, resourceId);
  return r ? Number(r.value) : 0;
}

/**
 * Set a resource's value. Creates the resource if it doesn't exist (not recommended; add via UI first).
 * @param {Actor} actor
 * @param {string} resourceId
 * @param {number} value
 * @param {{ notify?: boolean }} [options]
 */
export async function set(actor, resourceId, value, options = {}) {
  const resources = getResources(actor);
  const idx = resources.findIndex((r) => r.id === resourceId);
  const num = Math.max(0, Number(value));
  if (idx >= 0) {
    const max = resources[idx].max != null ? Number(resources[idx].max) : null;
    resources[idx].value = max != null ? Math.min(num, max) : num;
  } else {
    resources.push({ id: resourceId, name: resourceId, value: num, max: null, order: resources.length });
  }
  await setResources(actor, resources);
  if (options.notify) {
    // Optional: chat message; could be implemented via Hooks or a small helper
    console.log(`Character Resources: ${actor.name} — ${resourceId} = ${resources.find((r) => r.id === resourceId)?.value}`);
  }
}

/**
 * Increment a resource by delta.
 * @param {Actor} actor
 * @param {string} resourceId
 * @param {number} [delta=1]
 */
export async function increment(actor, resourceId, delta = 1) {
  const v = getValue(actor, resourceId);
  await set(actor, resourceId, v + Number(delta));
}

/**
 * Decrement a resource by delta.
 * @param {Actor} actor
 * @param {string} resourceId
 * @param {number} [delta=1]
 */
export async function decrement(actor, resourceId, delta = 1) {
  const v = getValue(actor, resourceId);
  await set(actor, resourceId, Math.max(0, v - Number(delta)));
}

/**
 * Add a new resource definition.
 * @param {Actor} actor
 * @param {Partial<CharacterResource> & { name: string }} def - name required; id will be slugified if omitted
 */
export async function addResource(actor, def) {
  const resources = getResources(actor);
  const id = def.id || slugify(def.name) || `resource-${Date.now()}`;
  if (resources.some((r) => r.id === id)) throw new Error(`Resource id already exists: ${id}`);
  const order = def.order != null ? def.order : resources.length;
  resources.push({
    id,
    name: def.name ?? id,
    value: def.value != null ? Number(def.value) : 0,
    max: def.max != null ? Number(def.max) : null,
    icon: def.icon ?? "",
    order,
    description: def.description ?? "",
    uuid: def.uuid ?? "",
  });
  await setResources(actor, resources);
}

/**
 * Update an existing resource (name, max, icon, order). Use set() for value.
 * @param {Actor} actor
 * @param {string} resourceId
 * @param {Partial<CharacterResource>} updates
 */
export async function updateResource(actor, resourceId, updates) {
  const resources = getResources(actor);
  const idx = resources.findIndex((r) => r.id === resourceId);
  if (idx < 0) return;
  if (updates.name != null) resources[idx].name = updates.name;
  if (updates.max !== undefined) resources[idx].max = updates.max == null ? null : Number(updates.max);
  if (updates.icon !== undefined) resources[idx].icon = updates.icon;
  if (updates.order !== undefined) resources[idx].order = Number(updates.order);
  if (updates.description !== undefined) resources[idx].description = updates.description;
  if (updates.uuid !== undefined) resources[idx].uuid = updates.uuid;
  await setResources(actor, resources);
}

/**
 * Remove a resource.
 * @param {Actor} actor
 * @param {string} resourceId
 */
export async function removeResource(actor, resourceId) {
  const resources = getResources(actor).filter((r) => r.id !== resourceId);
  await setResources(actor, resources);
}

/**
 * Add a resource from a dropped document (Item, etc.). Uses document name and img; links via uuid.
 * @param {Actor} actor
 * @param {foundry.abstract.Document} doc - e.g. Item (feat, spell)
 * @param {{ value?: number, max?: number }} [options]
 */
export async function addResourceFromDocument(actor, doc, options = {}) {
  const uuid = doc.uuid ?? "";
  const name = doc.name ?? "Unnamed";
  const icon = doc.img ?? "";
  const resources = getResources(actor);
  const baseId = slugify(name);
  let id = baseId;
  let n = 0;
  while (resources.some((r) => r.id === id)) {
    id = `${baseId}-${++n}`;
  }
  await addResource(actor, {
    id,
    name,
    icon,
    uuid,
    value: options.value != null ? Number(options.value) : 0,
    max: options.max != null ? Number(options.max) : null,
  });
}

/**
 * Reorder resources by the given order of ids.
 * @param {Actor} actor
 * @param {string[]} orderedIds
 */
export async function reorderResources(actor, orderedIds) {
  const resources = getResources(actor);
  const byId = Object.fromEntries(resources.map((r) => [r.id, r]));
  const ordered = orderedIds.map((id, i) => ({ ...byId[id], order: i })).filter((r) => r.id);
  const rest = resources.filter((r) => !orderedIds.includes(r.id));
  const merged = [...ordered, ...rest].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  merged.forEach((r, i) => (r.order = i));
  await setResources(actor, merged);
}

function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
