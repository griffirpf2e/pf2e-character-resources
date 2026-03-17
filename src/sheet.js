/**
 * Injects the character resources block into actor sheets and handles UI.
 */

import * as api from "./api.js";

const MODULE_ID = "pf2e-character-resources";

/**
 * Find an injection point in the sheet: prefer a content area so resources appear in the main body.
 * @param {jQuery} html
 * @returns {jQuery}
 */
function getInjectionTarget(html) {
  const $html = html instanceof jQuery ? html : $(html);
  // PF2e: .sheet-content or .sheet-body; fallback: first .tab or the form
  const $content =
    $html.find(".sheet-content").first().length &&
    $html.find(".sheet-content .sheet-body").first().length
      ? $html.find(".sheet-content .sheet-body").first()
      : $html.find(".sheet-body").first();
  if ($content.length) return $content;
  const $tab = $html.find('[class*="tab"][class*="content"]').first();
  if ($tab.length) return $tab;
  return $html.find("form").first().length ? $html.find("form").first() : $html;
}

/**
 * Find where to put the Character Resources icon on the PF2e character sheet.
 * Prefer the same spot as pf2e-dailies: aside .hitpoints .hp-small (row of roll icons next to HP).
 * @param {jQuery|HTMLElement} html
 * @returns {{ parent: Element | null, useRollIcon: boolean } | { container: jQuery, prepend: boolean, after?: jQuery }}
 */
function getButtonInsertionPoint(html) {
  const $html = html instanceof jQuery ? html : $(html);
  const el = typeof html === "object" && html?.nodeType === 1 ? html : $html[0];
  if (el) {
    const hpSmall = el.querySelector("aside .hitpoints .hp-small");
    if (hpSmall) {
      return { parent: hpSmall, useRollIcon: true };
    }
  }
  // Fallback: sidebar or sheet body
  const $sidebar = $html.find(".sheet-sidebar, .sidebar, .sheet-left").first();
  if ($sidebar.length) {
    return { container: $sidebar, prepend: false };
  }
  const $effects = $html.find("[data-tab=effects], .tab.effects, .sheet-section.effects").first();
  if ($effects.length) {
    return { container: $effects.parent(), prepend: false, after: $effects };
  }
  const $body = $html.find(".sheet-body").first();
  if ($body.length) {
    return { container: $body, prepend: true };
  }
  return { container: $html.find("form").first() || $html, prepend: true };
}

/**
 * Build the resources block HTML and inject it into the sheet. Re-renders when actor updates.
 * @param {ActorSheet} app
 * @param {jQuery|HTMLElement} html
 */
export function injectResourcesIntoSheet(app, html) {
  const actor = app.object;
  if (!actor) return;

  const $target = getInjectionTarget(html);
  const $existing = $target.find("[data-pf2e-character-resources-block]");
  if ($existing.length) $existing.remove();

  const block = document.createElement("div");
  block.dataset[`${MODULE_ID.replace(/-/g, "_")}_block`] = "true";
  block.className = "character-resources-block";
  block.innerHTML = renderBlock(actor);
  $target.append(block);

  const $block = $target.find(".character-resources-block").last();
  bindBlockEvents(app, $block, actor);
}

/**
 * Inject only a "Character Resources" control (no inline block) to avoid breaking the sheet layout.
 * Uses the same pattern as pf2e-dailies: when possible, a roll-icon in aside .hitpoints .hp-small
 * so it matches the sheet's existing icon row; otherwise a compact button in the sidebar.
 * @param {ActorSheet} app
 * @param {jQuery|HTMLElement} html
 */
export function injectResourcesButtonOnly(app, html) {
  const actor = app.object;
  if (!actor?.isOwner) return;

  const $html = html instanceof jQuery ? html : $(html);
  $html.find("[data-pf2e-character-resources-btn]").remove();

  const insertion = getButtonInsertionPoint(html);
  const label = game.i18n.localize("CHARRES.Title");

  if (insertion.parent && insertion.useRollIcon) {
    const icon = document.createElement("a");
    icon.href = "#";
    icon.dataset.pf2eCharacterResourcesBtn = "true";
    icon.className = "roll-icon charres";
    icon.setAttribute("data-tooltip", label);
    icon.innerHTML = "<i class='fa-solid fa-boxes-stacked'></i>";
    insertion.parent.appendChild(icon);
    icon.addEventListener("click", (e) => {
      e.preventDefault();
      openResourcesDialog(actor);
    });
    return;
  }

  const btnWrap = document.createElement("div");
  btnWrap.dataset.pf2eCharacterResourcesBtn = "true";
  btnWrap.className = "character-resources-button-wrap";
  btnWrap.innerHTML = `
    <button type="button" class="character-resources-open-btn" data-action="open-resources" title="${label}">
      <i class="fas fa-boxes-stacked"></i>
      <span>${label}</span>
    </button>`;

  if (insertion.after) {
    insertion.after.after(btnWrap);
  } else if (insertion.prepend) {
    insertion.container.prepend(btnWrap);
  } else {
    insertion.container.append(btnWrap);
  }

  $html.find(".character-resources-button-wrap").last().on("click", "[data-action=open-resources]", (e) => {
    e.preventDefault();
    openResourcesDialog(actor);
  });
}

function escapeHtml(str) {
  if (str == null) return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Spellcraft-style resource row: icon, name (content link if uuid), Uses, +/-, edit, delete.
 */
function renderResourceRow(r, canEdit) {
  const nameCell = r.uuid
    ? `<a class="content-link charres-resource-link" data-uuid="${escapeHtml(r.uuid)}">${escapeHtml(r.name)} &gt;&gt;</a>`
    : `<span class="charres-resource-name">${escapeHtml(r.name)}</span>`;
  const usesStr = r.max != null ? `${r.value} / ${r.max}` : String(r.value);
  return `
    <tr class="charres-row" data-resource-id="${escapeHtml(r.id)}">
      <td class="charres-cell-icon">${r.icon ? `<img class="charres-icon" src="${escapeHtml(r.icon)}" alt="" />` : '<span class="charres-icon-placeholder"></span>'}</td>
      <td class="charres-cell-name">${nameCell}</td>
      <td class="charres-cell-uses">${usesStr}</td>
      <td class="charres-cell-controls">
        ${canEdit ? `<button type="button" class="charres-btn minus" data-action="decrement" title="-">−</button><button type="button" class="charres-btn plus" data-action="increment" title="+">+</button>` : ""}
        ${canEdit ? `<button type="button" class="charres-btn edit" data-action="edit" title="${game.i18n.localize("CHARRES.Edit")}"><i class="fas fa-pencil-alt"></i></button><button type="button" class="charres-btn delete" data-action="delete" title="${game.i18n.localize("CHARRES.Remove")}"><i class="fas fa-trash"></i></button>` : ""}
      </td>
    </tr>`;
}

/**
 * Spellcraft-style dialog content: header, table of resources, + add box and drop zone.
 */
function renderSpellcraftBlock(actor) {
  const resources = api.getResources(actor).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const canEdit = actor.canUserModify(game.user, "update");

  const rowsHtml = resources.map((r) => renderResourceRow(r, canEdit)).join("");
  const addRow =
    canEdit &&
    `
    <tr class="charres-add-row">
      <td colspan="2" class="charres-add-cell">
        <div class="charres-add-area">
          <button type="button" class="charres-add-box" data-action="add-custom" title="${game.i18n.localize("CHARRES.AddCustom")}">
            <i class="fas fa-plus"></i>
          </button>
          <div class="charres-drop-zone" data-drop-zone>
            <i class="fas fa-arrow-down"></i>
            <span>${game.i18n.localize("CHARRES.DropHere")}</span>
          </div>
        </div>
      </td>
      <td colspan="2"></td>
    </tr>`;

  return `
    <header class="charres-header">
      <h3 class="charres-title">${game.i18n.localize("CHARRES.Title")}</h3>
    </header>
    <div class="charres-body">
      <table class="charres-table">
        <thead>
          <tr>
            <th class="charres-th-icon"></th>
            <th class="charres-th-name">${game.i18n.localize("CHARRES.Name")}</th>
            <th class="charres-th-uses">${game.i18n.localize("CHARRES.Uses")}</th>
            <th class="charres-th-controls"></th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="4" class="charres-empty">${game.i18n.localize("CHARRES.NoResources")}</td></tr>`}
          ${addRow || ""}
        </tbody>
      </table>
    </div>`;
}

function renderBlock(actor) {
  const resources = api.getResources(actor).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const canEdit = actor.canUserModify(game.user, "update");

  let listHtml = resources
    .map(
      (r) => `
    <li class="character-resource" data-resource-id="${r.id}">
      <div class="resource-header">
        ${r.icon ? `<img class="resource-icon" src="${r.icon}" alt="" />` : ""}
        <span class="resource-name">${r.name}</span>
        <span class="resource-value" data-value>${r.value}</span>
        ${r.max != null ? `<span class="resource-max">/ ${r.max}</span>` : ""}
      </div>
      <div class="resource-controls">
        <button type="button" class="resource-btn minus" data-action="decrement" ${!canEdit ? "disabled" : ""}>−</button>
        <button type="button" class="resource-btn plus" data-action="increment" ${!canEdit ? "disabled" : ""}>+</button>
        ${canEdit ? `<button type="button" class="resource-btn edit" data-action="edit" title="${game.i18n.localize("CHARRES.Edit")}">✎</button>` : ""}
      </div>
      ${r.max != null ? `<div class="resource-bar"><div class="resource-fill" style="width: ${Math.min(100, (r.value / r.max) * 100)}%"></div></div>` : ""}
    </li>`
    )
    .join("");

  if (!listHtml) {
    listHtml = `<li class="character-resource-empty">${game.i18n.localize("CHARRES.NoResources")}</li>`;
  }

  const manageBtn =
    canEdit &&
    `<button type="button" class="character-resources-manage" data-action="manage">${game.i18n.localize("CHARRES.Manage")}</button>`;

  return `
    <section class="character-resources">
      <h3 class="character-resources-title">${game.i18n.localize("CHARRES.Title")}</h3>
      <ul class="character-resources-list">${listHtml}</ul>
      ${manageBtn || ""}
    </section>`;
}

/**
 * @param {Application} app - Sheet app (for re-render), or null when used inside a dialog
 * @param {jQuery} $block
 * @param {Actor} actor
 * @param {() => void} [onRefresh] - If provided (e.g. dialog refresh), called instead of app.render
 */
function bindBlockEvents(app, $block, actor, onRefresh) {
  const refresh = onRefresh ?? (() => refreshBlock(app));

  $block.on("click", "[data-action=increment]", (e) => {
    e.preventDefault();
    const id = $(e.currentTarget).closest("[data-resource-id]").attr("data-resource-id");
    if (!id) return;
    const delta = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 5 : 1;
    api.increment(actor, id, delta).then(refresh);
  });

  $block.on("click", "[data-action=decrement]", (e) => {
    e.preventDefault();
    const id = $(e.currentTarget).closest("[data-resource-id]").attr("data-resource-id");
    if (!id) return;
    const delta = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 5 : 1;
    api.decrement(actor, id, delta).then(refresh);
  });

  $block.on("click", "[data-action=edit]", (e) => {
    e.preventDefault();
    const id = $(e.currentTarget).closest("[data-resource-id]").attr("data-resource-id");
    if (id) openEditResourceDialog(actor, id, refresh);
  });

  $block.on("click", "[data-action=manage]", (e) => {
    e.preventDefault();
    openManageDialog(actor, refresh);
  });
}

function refreshBlock(app) {
  app.render(false);
}

/**
 * Resolve a UUID to a document (Foundry v10/v11 compatible).
 * @param {string} uuid
 * @returns {Promise<foundry.abstract.Document|null>}
 */
function resolveUuid(uuid) {
  if (!uuid) return Promise.resolve(null);
  if (typeof fromUuid === "function") return fromUuid(uuid);
  if (typeof game !== "undefined" && game.documents?.fromUuid) return game.documents.fromUuid(uuid);
  return Promise.resolve(null);
}

/**
 * Open the spellcraft-style Character Resources dialog: table with Uses, + box, drop zone.
 * @param {Actor} actor
 */
function openResourcesDialog(actor) {
  const contentHtml = `<div class="charres-dialog-content">${renderSpellcraftBlock(actor)}</div>`;

  new Dialog(
    {
      title: game.i18n.localize("CHARRES.Title"),
      content: contentHtml,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Close"),
        },
      },
      default: "close",
      render: (html) => {
        const el = html?.currentTarget ?? html?.target ?? (html?.length ? html[0] : html);
        const $scope = el ? (el.nodeType ? $(el) : $(html)) : $(document.body);
        let $content = $scope.find(".charres-dialog-content").first();
        if (!$content.length) $content = $(document.querySelector(".dialog .window-content .charres-dialog-content") || []);
        if (!$content.length) return;
        const refresh = () => {
          const freshActor = game.actors?.get(actor.id) ?? actor;
          $content.empty().append(renderSpellcraftBlock(freshActor));
          bindSpellcraftEvents($content, freshActor, refresh);
        };
        bindSpellcraftEvents($content, actor, refresh);
      },
    },
    { width: 520 }
  ).render(true);
}

/**
 * Bind events for the spellcraft-style dialog: row actions, + add custom, drop zone, content links.
 */
function bindSpellcraftEvents($content, actor, refresh) {
  const canEdit = actor.canUserModify(game.user, "update");

  const getResourceId = (el) => $(el).closest("[data-resource-id]").attr("data-resource-id");

  $content.on("click", "[data-action=increment]", (e) => {
    e.preventDefault();
    const id = getResourceId(e.currentTarget);
    if (!id) return;
    const delta = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 5 : 1;
    api.increment(actor, id, delta).then(refresh);
  });
  $content.on("click", "[data-action=decrement]", (e) => {
    e.preventDefault();
    const id = getResourceId(e.currentTarget);
    if (!id) return;
    const delta = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 5 : 1;
    api.decrement(actor, id, delta).then(refresh);
  });
  $content.on("click", "[data-action=edit]", (e) => {
    e.preventDefault();
    const id = getResourceId(e.currentTarget);
    if (id) openEditResourceDialog(actor, id, refresh);
  });
  $content.on("click", "[data-action=delete]", (e) => {
    e.preventDefault();
    const id = getResourceId(e.currentTarget);
    if (!id) return;
    if (window.confirm(game.i18n.localize("CHARRES.ConfirmDelete"))) {
      api.removeResource(actor, id).then(refresh);
    }
  });
  $content.on("click", "[data-action=add-custom]", (e) => {
    e.preventDefault();
    openEditResourceDialog(actor, null, refresh);
  });

  // Content links: open linked document sheet
  $content.on("click", "a.content-link.charres-resource-link", (e) => {
    e.preventDefault();
    const uuid = e.currentTarget.dataset.uuid;
    if (uuid) {
      resolveUuid(uuid).then((doc) => doc?.sheet?.render(true));
    }
  });

  // Drop zone: accept Item (and other documents with name/img)
  const dropZone = $content.find("[data-drop-zone]").get(0);
  if (dropZone && canEdit) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("charres-drop-over");
    });
    dropZone.addEventListener("dragleave", (e) => {
      dropZone.classList.remove("charres-drop-over");
    });
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("charres-drop-over");
      let uuid = e.dataTransfer.getData("text/plain");
      if (!uuid) {
        const json = e.dataTransfer.getData("application/json");
        if (json) {
          try {
            const data = JSON.parse(json);
            uuid = data.uuid ?? data.document?.uuid ?? data.id ?? "";
          } catch (_) {}
        }
      }
      if (!uuid) return;
      try {
        const doc = await resolveUuid(uuid);
        if (doc && typeof doc.name === "string") {
          await api.addResourceFromDocument(actor, doc, { value: 0, max: 1 });
          refresh();
        }
      } catch (_) {
        // ignore
      }
    });
  }
}

/**
 * Render the resources block only (for use in dialogs or elsewhere).
 * @param {Actor} actor
 * @returns {string}
 */
export function renderCharacterResources(actor) {
  return renderBlock(actor);
}

/**
 * Open dialog to add or edit a resource (name, description, quantity). Linked resources show "Linked to document".
 * @param {Actor} actor
 * @param {string|null} resourceId - null = add new (custom)
 * @param {() => void} onClose
 */
function openEditResourceDialog(actor, resourceId, onClose) {
  const resource = resourceId ? api.get(actor, resourceId) : null;
  const isNew = !resource;
  const isLinked = !!resource?.uuid;
  const nameVal = resource?.name ?? "";
  const descVal = resource?.description ?? "";
  const valueVal = resource?.value ?? 0;
  const maxVal = resource?.max ?? "";
  const iconVal = resource?.icon ?? "";

  const linkedNote = isLinked
    ? `<p class="charres-form-linked-note"><i class="fas fa-link"></i> ${game.i18n.localize("CHARRES.LinkedTo")}</p>`
    : "";

  const content = `
    <form class="character-resource-form charres-form">
      ${linkedNote}
      <div class="form-group">
        <label>${game.i18n.localize("CHARRES.Name")}</label>
        <input type="text" name="name" value="${escapeHtml(nameVal)}" ${isLinked ? "readonly" : ""} required />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("CHARRES.Description")}</label>
        <textarea name="description" rows="3" placeholder="${game.i18n.localize("CHARRES.DescriptionPlaceholder")}">${escapeHtml(descVal)}</textarea>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("CHARRES.Value")}</label>
        <input type="number" name="value" min="0" value="${valueVal}" />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("CHARRES.Max")}</label>
        <input type="number" name="max" min="0" placeholder="${game.i18n.localize("CHARRES.NoMax")}" value="${maxVal === null || maxVal === "" ? "" : maxVal}" />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("CHARRES.Icon")}</label>
        <input type="text" name="icon" placeholder="${game.i18n.localize("CHARRES.IconPlaceholder")}" value="${escapeHtml(iconVal)}" ${isLinked ? "readonly" : ""} />
      </div>
    </form>`;

  new Dialog(
    {
      title: isNew ? game.i18n.localize("CHARRES.AddCustom") : game.i18n.localize("CHARRES.EditResource"),
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("CHARRES.Save"),
          callback: async (html) => {
            const form = html[0].querySelector("form");
            const name = form.name.value.trim();
            const description = form.description?.value?.trim() ?? "";
            const value = parseInt(form.value.value, 10) || 0;
            const max = form.max.value.trim() === "" ? null : Math.max(0, parseInt(form.max.value, 10));
            const icon = form.icon.value.trim();
            if (isNew) {
              await api.addResource(actor, { name, description, value, max, icon });
            } else {
              await api.updateResource(actor, resourceId, { name, description, max, icon });
              await api.set(actor, resourceId, value);
            }
            onClose?.();
          },
        },
        delete: isNew
          ? undefined
          : {
              icon: '<i class="fas fa-trash"></i>',
              label: game.i18n.localize("CHARRES.Delete"),
              callback: async () => {
                if (window.confirm(game.i18n.localize("CHARRES.ConfirmDelete"))) {
                  await api.removeResource(actor, resourceId);
                  onClose?.();
                }
              },
            },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel"),
        },
      },
      default: "save",
    },
    { width: 400 }
  ).render(true);
}

/**
 * Open dialog to manage (add, remove, reorder) all resources.
 * @param {Actor} actor
 * @param {() => void} onClose
 */
function openManageDialog(actor, onClose) {
  const resources = [...api.getResources(actor)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const listItems = resources
    .map(
      (r, i) => `
    <li class="manage-resource-item" data-resource-id="${r.id}">
      <span class="drag-handle">☰</span>
      <span class="name">${r.name}</span>
      <span class="value">${r.value}${r.max != null ? ` / ${r.max}` : ""}</span>
      <button type="button" class="edit-item" data-id="${r.id}">${game.i18n.localize("CHARRES.Edit")}</button>
      <button type="button" class="remove-item" data-id="${r.id}">${game.i18n.localize("CHARRES.Remove")}</button>
    </li>`
    )
    .join("");

  const content = `
    <p class="charres-manage-hint">${game.i18n.localize("CHARRES.ManageHint")}</p>
    <ul class="manage-resources-list">${listItems || ""}</ul>
    <button type="button" class="add-resource-btn">${game.i18n.localize("CHARRES.AddResource")}</button>`;

  const dlg = new Dialog(
    {
      title: game.i18n.localize("CHARRES.ManageResources"),
      content,
      buttons: {
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Close"),
        },
      },
      default: "close",
      render: (html) => {
        const $html = $(html);
        $html.find(".add-resource-btn").on("click", () => {
          openEditResourceDialog(actor, null, () => refreshManageList(dlg, actor, onClose));
        });
        $html.find(".edit-item").on("click", (e) => {
          const id = $(e.currentTarget).data("id");
          openEditResourceDialog(actor, id, () => refreshManageList(dlg, actor, onClose));
        });
        $html.find(".remove-item").on("click", async (e) => {
          const id = $(e.currentTarget).data("id");
          if (window.confirm(game.i18n.localize("CHARRES.ConfirmDelete"))) {
            await api.removeResource(actor, id);
            refreshManageList(dlg, actor, onClose);
          }
        });
      },
    },
    { width: 440 }
  ).render(true);
}

function refreshManageList(dlg, actor, onClose) {
  const $list = dlg.element.find(".manage-resources-list");
  if (!$list.length) return;
  const updated = api.getResources(actor).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  $list.empty();
  updated.forEach((r) => {
    $list.append(
      $(`
        <li class="manage-resource-item" data-resource-id="${r.id}">
          <span class="drag-handle">☰</span>
          <span class="name">${r.name}</span>
          <span class="value">${r.value}${r.max != null ? ` / ${r.max}` : ""}</span>
          <button type="button" class="edit-item" data-id="${r.id}">${game.i18n.localize("CHARRES.Edit")}</button>
          <button type="button" class="remove-item" data-id="${r.id}">${game.i18n.localize("CHARRES.Remove")}</button>
        </li>`
    )
    );
  });
  dlg.element.find(".edit-item").on("click", (e) => {
    const id = $(e.currentTarget).data("id");
    openEditResourceDialog(actor, id, () => refreshManageList(dlg, actor, onClose));
  });
  dlg.element.find(".remove-item").on("click", async (e) => {
    const id = $(e.currentTarget).data("id");
    if (window.confirm(game.i18n.localize("CHARRES.ConfirmDelete"))) {
      await api.removeResource(actor, id);
      refreshManageList(dlg, actor, onClose);
    }
  });
  onClose?.();
}
