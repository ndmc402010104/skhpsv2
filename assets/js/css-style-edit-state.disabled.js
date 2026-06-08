/*
File: skhpsv2/assets/js/css-style-edit-state.js
Purpose: Shared per-field CSS Setting edit-state controller.
Rules:
- No MutationObserver.
- No hard-coded visual CSS.
- Each field has its own edit / cancel / undo / save controls.
- input event previews only.
- change event commits one undo snapshot.
*/

(function () {
  "use strict";

  var STATE_KEY = "__skhpsCssEditState";
  var CONTROL_BAR_CLASS = "skhps-css-edit-controls";

  var labels = {
    edit: "\u7de8\u8f2f",
    cancel: "\u53d6\u6d88\u7de8\u8f2f",
    undo: "\u8fd4\u56de\u4e0a\u4e00\u52d5",
    save: "\u5132\u5b58",
    restoreSheet: "\u56de\u5230 Sheet \u503c",
    restoreDefault: "\u6062\u5fa9 default",
    replaceDefault: "\u53d6\u4ee3 default"
  };

  function isEditableControl(el) {
    if (!el || !el.tagName) return false;

    var tag = el.tagName.toLowerCase();
    var type = String(el.type || "").toLowerCase();

    if (el.closest("." + CONTROL_BAR_CLASS)) return false;
    if (el.hasAttribute("data-skhps-edit-ignore")) return false;
    if (type === "hidden") return false;
    if (type === "button" || type === "submit" || type === "reset") return false;

    return tag === "input" || tag === "select" || tag === "textarea" || el.getAttribute("contenteditable") === "true";
  }

  function getValue(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    var type = String(el.type || "").toLowerCase();

    if (tag === "input" && (type === "checkbox" || type === "radio")) {
      return !!el.checked;
    }

    if (el.getAttribute("contenteditable") === "true") {
      return el.textContent;
    }

    return el.value;
  }

  function setValue(el, value) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    var type = String(el.type || "").toLowerCase();

    if (tag === "input" && (type === "checkbox" || type === "radio")) {
      el.checked = !!value;
    } else if (el.getAttribute("contenteditable") === "true") {
      el.textContent = value == null ? "" : String(value);
    } else {
      el.value = value == null ? "" : String(value);
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findFieldScope(el) {
    return el.closest(
      "[data-css-style-field], [data-skhps-style-field], .css-token-row, .token-row, .setting-row, .editor-row, .theme-row, .skhps-field, .field-row, tr, label"
    ) || el.parentElement;
  }

  function makeButton(text, role) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.className = "skhps-btn skhps-btn-secondary skhps-css-edit-btn";
    btn.setAttribute("data-skhps-css-edit-role", role);
    return btn;
  }

  function ensureControlBar(scope) {
    var bar = scope.querySelector(":scope > ." + CONTROL_BAR_CLASS);

    if (!bar) {
      bar = document.createElement("span");
      bar.className = CONTROL_BAR_CLASS + " skhps-toolbar";
      bar.setAttribute("data-skhps-edit-ignore", "1");
      scope.appendChild(bar);
    }

    var roles = [
      ["edit", labels.edit],
      ["undo", labels.undo],
      ["save", labels.save],
      ["restoreSheet", labels.restoreSheet],
      ["restoreDefault", labels.restoreDefault],
      ["replaceDefault", labels.replaceDefault]
    ];

    roles.forEach(function (item) {
      var role = item[0];
      var text = item[1];

      if (!bar.querySelector('[data-skhps-css-edit-role="' + role + '"]')) {
        bar.appendChild(makeButton(text, role));
      }
    });

    return bar;
  }

  function getButton(scope, role) {
    return scope.querySelector('[data-skhps-css-edit-role="' + role + '"]');
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.style.display = visible ? "" : "none";
  }

  function setFieldEditable(el, editable) {
    if (el.getAttribute("contenteditable") === "true" || el.hasAttribute("contenteditable")) {
      el.setAttribute("contenteditable", editable ? "true" : "false");
      return;
    }

    el.disabled = !editable;
  }

  function updateScopeClass(scope, state) {
    scope.classList.toggle("skhps-css-edit-readonly", !state.editing);
    scope.classList.toggle("skhps-css-edit-editing", state.editing);
    scope.classList.toggle("skhps-css-edit-dirty", state.dirty);
    scope.setAttribute("data-skhps-edit-mode", state.editing ? (state.dirty ? "dirty" : "editing") : "readonly");
  }

  function updateButtons(scope, state) {
    var edit = getButton(scope, "edit");
    var undo = getButton(scope, "undo");
    var save = getButton(scope, "save");
    var restoreSheet = getButton(scope, "restoreSheet");
    var restoreDefault = getButton(scope, "restoreDefault");
    var replaceDefault = getButton(scope, "replaceDefault");

    if (!state.editing) {
      edit.textContent = labels.edit;
      setVisible(edit, true);
      setVisible(undo, false);
      setVisible(save, false);
      setVisible(restoreSheet, false);
      setVisible(restoreDefault, false);
      setVisible(replaceDefault, false);
      updateScopeClass(scope, state);
      return;
    }

    edit.textContent = labels.cancel;

    setVisible(edit, true);

    if (!state.dirty) {
      setVisible(undo, false);
      setVisible(save, false);
      setVisible(restoreSheet, false);
      setVisible(restoreDefault, false);
      setVisible(replaceDefault, false);
      updateScopeClass(scope, state);
      return;
    }

    setVisible(undo, state.undoStack.length > 1);
    setVisible(save, true);
    setVisible(restoreSheet, true);
    setVisible(restoreDefault, true);
    setVisible(replaceDefault, true);
    updateScopeClass(scope, state);
  }

  function createState(el, scope) {
    return {
      el: el,
      scope: scope,
      editing: false,
      dirty: false,
      baseline: getValue(el),
      sheetValue: getValue(el),
      defaultValue: el.getAttribute("data-default-value") || el.getAttribute("data-skhps-default-value") || getValue(el),
      undoStack: [],
      applying: false
    };
  }

  function beginEdit(state) {
    state.editing = true;
    state.dirty = false;
    state.baseline = getValue(state.el);
    state.sheetValue = getValue(state.el);
    state.undoStack = [state.baseline];

    setFieldEditable(state.el, true);
    updateButtons(state.scope, state);
  }

  function cancelEdit(state) {
    state.applying = true;
    setValue(state.el, state.baseline);
    state.applying = false;

    state.editing = false;
    state.dirty = false;
    state.undoStack = [];

    setFieldEditable(state.el, false);
    updateButtons(state.scope, state);
  }

  function refreshDirty(state) {
    state.dirty = getValue(state.el) !== state.baseline;
  }

  function commit(state) {
    if (!state.editing || state.applying) return;

    var value = getValue(state.el);
    var last = state.undoStack[state.undoStack.length - 1];

    if (value !== last) {
      state.undoStack.push(value);
    }

    refreshDirty(state);
    updateButtons(state.scope, state);
  }

  function preview(state) {
    if (!state.editing || state.applying) return;

    refreshDirty(state);
    updateButtons(state.scope, state);
  }

  function undo(state) {
    if (!state.editing) return;

    if (state.undoStack.length > 1) {
      state.undoStack.pop();
    }

    var target = state.undoStack[state.undoStack.length - 1] || state.baseline;

    state.applying = true;
    setValue(state.el, target);
    state.applying = false;

    refreshDirty(state);
    updateButtons(state.scope, state);
  }

  function restoreSheet(state) {
    if (!state.editing) return;

    state.applying = true;
    setValue(state.el, state.sheetValue);
    state.applying = false;

    commit(state);
  }

  function restoreDefault(state) {
    if (!state.editing) return;

    state.applying = true;
    setValue(state.el, state.defaultValue);
    state.applying = false;

    commit(state);
  }

  function afterSave(state) {
    state.baseline = getValue(state.el);
    state.sheetValue = getValue(state.el);
    state.undoStack = [state.baseline];
    state.dirty = false;
    state.editing = false;

    setFieldEditable(state.el, false);
    updateButtons(state.scope, state);
  }

  function dispatchFieldAction(state, action) {
    var detail = {
      action: action,
      value: getValue(state.el),
      baseline: state.baseline,
      sheetValue: state.sheetValue,
      defaultValue: state.defaultValue,
      control: state.el,
      scope: state.scope
    };

    state.scope.dispatchEvent(new CustomEvent("skhps-css-style-field-action", {
      bubbles: true,
      detail: detail
    }));
  }

  function bindField(el) {
    if (!isEditableControl(el)) return;
    if (el.dataset.skhpsCssEditBound === "1") return;

    var scope = findFieldScope(el);
    if (!scope) return;

    ensureControlBar(scope);

    var state = createState(el, scope);
    el[STATE_KEY] = state;
    scope[STATE_KEY] = state;

    el.dataset.skhpsCssEditBound = "1";

    setFieldEditable(el, false);
    updateButtons(scope, state);

    scope.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-skhps-css-edit-role]");
      if (!btn || !scope.contains(btn)) return;

      var role = btn.getAttribute("data-skhps-css-edit-role");
      event.preventDefault();

      if (role === "edit") {
        if (!state.editing) {
          beginEdit(state);
        } else {
          cancelEdit(state);
        }
        return;
      }

      if (role === "undo") {
        undo(state);
        return;
      }

      if (role === "restoreSheet") {
        restoreSheet(state);
        dispatchFieldAction(state, "restoreSheet");
        return;
      }

      if (role === "restoreDefault") {
        restoreDefault(state);
        dispatchFieldAction(state, "restoreDefault");
        return;
      }

      if (role === "replaceDefault") {
        dispatchFieldAction(state, "replaceDefault");
        commit(state);
        return;
      }

      if (role === "save") {
        dispatchFieldAction(state, "save");

        window.setTimeout(function () {
          afterSave(state);
        }, 800);
      }
    });

    el.addEventListener("input", function () {
      preview(state);
    });

    el.addEventListener("change", function () {
      commit(state);
    });
  }

  function init(root) {
    if (!root) return;

    var controls = Array.prototype.slice.call(
      root.querySelectorAll("input, select, textarea, [contenteditable='true']")
    ).filter(isEditableControl);

    controls.forEach(bindField);

    /*
      Some fragment renderers create inputs after AJAX insertion.
      Retry a few times without MutationObserver.
    */
    [100, 300, 700].forEach(function (ms) {
      window.setTimeout(function () {
        Array.prototype.slice.call(
          root.querySelectorAll("input, select, textarea, [contenteditable='true']")
        ).filter(isEditableControl).forEach(bindField);
      }, ms);
    });
  }

  window.SKHPSCssStyleEditState = {
    init: init
  };
})();
