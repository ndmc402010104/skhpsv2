/*
檔案位置：skhpsv2/assets/js/css-setting-editor-core.js
時間戳記：2026-06-09 19:00 UTC+8
用途：CSS Setting 共用 editor core；處理編輯、取消編輯、editMoment、default 比對、dirty、undo、redo、儲存成功後 baseline 更新。
*/

(function () {
  "use strict";

  var labels = {
    edit: "編輯",
    cancel: "取消編輯",
    undo: "返回上一動",
    redo: "前進下一動",
    save: "儲存",
    defaultValue: "恢復 default",
    replaceDefault: "取代 default",
    replaceDefault: "取代 default"
  };

  function allEditors(root) {
    return Array.prototype.slice.call(
      (root || document).querySelectorAll('[data-css-setting-editor][data-css-setting-core="on"]')
    );
  }

  function inputList(scope) {
    return Array.prototype.slice.call(
      scope.querySelectorAll("[data-css-var], [data-class-name][data-property]")
    );
  }

  function btn(scope, action) {
    return scope.querySelector('[data-css-setting-action="' + action + '"]');
  }

  function show(el, yes) {
    if (!el) return;
    el.hidden = !yes;
    el.style.display = yes ? "" : "none";
  }

  function setStatus(scope, message) {
    var target = scope.querySelector("[data-css-setting-status]");
    if (target) target.textContent = message;
  }

  function keyOf(input, index) {
    return [
      input.getAttribute("data-class-name") || "",
      input.getAttribute("data-css-var") || "",
      input.getAttribute("data-property") || "",
      input.name || "",
      input.id || "",
      index
    ].join("|");
  }

  function snapshot(scope) {
    var out = {};

    inputList(scope).forEach(function (input, index) {
      out[keyOf(input, index)] = input.value;
    });

    return out;
  }

  function defaultSnapshot(scope) {
    var out = {};

    inputList(scope).forEach(function (input, index) {
      out[keyOf(input, index)] = input.getAttribute("data-default") || "";
    });

    return out;
  }

  function same(a, b) {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  }

  function restoreSnapshot(scope, snap) {
    if (!snap) return;

    inputList(scope).forEach(function (input, index) {
      var key = keyOf(input, index);

      if (Object.prototype.hasOwnProperty.call(snap, key)) {
        input.value = snap[key] == null ? "" : String(snap[key]);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  function setEditable(scope, editable) {
    inputList(scope).forEach(function (input) {
      var type = String(input.type || "").toLowerCase();

      if (type === "color" || type === "range") {
        input.disabled = !editable;
      } else {
        input.readOnly = !editable;
      }
    });
  }

  function ensureUndoRedo(scope) {
    var edit = btn(scope, "edit");
    if (!edit || !edit.parentNode) return;

    var undo = btn(scope, "undo");
    if (!undo) {
      undo = document.createElement("button");
      undo.type = "button";
      undo.textContent = labels.undo;
      undo.setAttribute("data-css-setting-action", "undo");
      edit.parentNode.insertBefore(undo, edit.nextSibling);
    }

    var redo = btn(scope, "redo");
    if (!redo) {
      redo = document.createElement("button");
      redo.type = "button";
      redo.textContent = labels.redo;
      redo.setAttribute("data-css-setting-action", "redo");
      undo.parentNode.insertBefore(redo, undo.nextSibling);
    }
  }


  function ensureReplaceDefault(scope) {
    var replaceDefault = btn(scope, "replace-default");
    if (replaceDefault) return replaceDefault;

    var def = btn(scope, "default");
    var replaceDefault = btn(scope, "replace-default");
    var replaceDefault = btn(scope, "replace-default");
    var save = btn(scope, "save");
    var anchor = def || save || btn(scope, "edit");

    if (!anchor || !anchor.parentNode) return null;

    replaceDefault = document.createElement("button");
    replaceDefault.type = "button";
    replaceDefault.textContent = labels.replaceDefault;
    replaceDefault.setAttribute("data-css-setting-action", "replace-default");

    anchor.parentNode.insertBefore(replaceDefault, anchor.nextSibling);
    return replaceDefault;
  }
  function pushUndo(scope, snap) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s || !snap) return;

    var last = s.undoStack[s.undoStack.length - 1];

    if (!same(snap, last)) {
      s.undoStack.push(snap);
      if (s.undoStack.length > 50) s.undoStack.shift();
    }
  }

  function update(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s) return;

    var edit = btn(scope, "edit");
    var undo = btn(scope, "undo");
    var redo = btn(scope, "redo");
    var save = btn(scope, "save");
    var def = btn(scope, "default");
    var replaceDefault = btn(scope, "replace-default");
    var replaceDefault = btn(scope, "replace-default");

    var current = snapshot(scope);
    var isDirty = s.editing && !same(current, s.editMoment);
    var isDefault = same(current, s.defaultSnapshot);

    s.dirty = isDirty;

    if (!s.editing) {
      if (edit) edit.textContent = labels.edit;

      show(edit, true);
      show(undo, false);
      show(redo, false);
      show(save, false);
      show(def, false);
      show(replaceDefault, false);
      show(replaceDefault, false);

      scope.setAttribute("data-css-setting-edit-mode", "readonly");
      setEditable(scope, false);
      return;
    }

    if (edit) edit.textContent = labels.cancel;

    show(edit, true);
    show(save, isDirty);
    show(undo, s.undoStack.length > 1);
    show(redo, s.redoStack.length > 0);
    show(def, !isDefault);
    show(replaceDefault, !isDefault);
    show(replaceDefault, !isDefault);

    scope.setAttribute("data-css-setting-edit-mode", isDirty ? "dirty" : "editing");
    setEditable(scope, true);
  }

  function beginEdit(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s) return;

    s.editing = true;
    s.editMoment = snapshot(scope);
    s.defaultSnapshot = defaultSnapshot(scope);
    s.undoStack = [s.editMoment];
    s.redoStack = [];
    s.dirty = false;
    s.applying = false;

    setStatus(scope, "編輯中：修改後才會顯示儲存。");
    update(scope);
  }

  function cancelEdit(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s) return;

    s.applying = true;
    restoreSnapshot(scope, s.editMoment);
    s.applying = false;

    s.editing = false;
    s.dirty = false;
    s.undoStack = [];
    s.redoStack = [];

    setStatus(scope, "已取消編輯，回到這次按下編輯時的狀態。");
    update(scope);
  }

  function commitChange(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s || !s.editing || s.applying) return;

    pushUndo(scope, snapshot(scope));
    s.redoStack = [];
    update(scope);
  }

  function undo(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s || !s.editing) return;

    if (s.undoStack.length <= 1) {
      update(scope);
      return;
    }

    var current = s.undoStack.pop();
    s.redoStack.push(current);

    s.applying = true;
    restoreSnapshot(scope, s.undoStack[s.undoStack.length - 1]);
    s.applying = false;

    setStatus(scope, "已返回上一動。");
    update(scope);
  }

  function redo(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s || !s.editing) return;

    if (!s.redoStack.length) {
      update(scope);
      return;
    }

    var next = s.redoStack.pop();
    s.undoStack.push(next);

    s.applying = true;
    restoreSnapshot(scope, next);
    s.applying = false;

    setStatus(scope, "已前進下一動。");
    update(scope);
  }

  function restoreDefault(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s || !s.editing) return;

    pushUndo(scope, snapshot(scope));

    s.applying = true;
    restoreSnapshot(scope, s.defaultSnapshot);
    s.applying = false;

    pushUndo(scope, snapshot(scope));
    s.redoStack = [];

    setStatus(scope, "已恢復 default，尚未儲存。");
    update(scope);
  }

  function replaceDefault(scope) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s || !s.editing) return;

    var current = snapshot(scope);

    if (same(current, s.defaultSnapshot)) {
      update(scope);
      return;
    }

    var ok = window.confirm(
      "警告：你即將用目前欄位值取代 default。\n\n" +
      "這會刪除同一組 component + className + property 的所有舊設定列，\n" +
      "並讓目前設定成為新的 default。\n\n" +
      "這個動作會直接寫入 Google Sheet，影響之後所有使用這組樣式的頁面。\n\n" +
      "確定要繼續嗎？"
    );

    if (!ok) return;

    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      setStatus(scope, "取代 default 失敗：找不到 SKHPSBackend.call。");
      return;
    }

    var rows = collectRows(scope);
    var tabKey = scope.getAttribute("data-css-setting-tab-key") || "";

    if (!tabKey || !rows.length) {
      setStatus(scope, "取代 default 失敗：缺少 tabKey 或 rows。");
      return;
    }

    setStatus(scope, "取代 default：寫回 Google Sheet 中...");

    window.SKHPSBackend.call("replaceCssSheetDefaultRows", {
      tabKey: tabKey,
      rows: rows
    })
      .then(function (response) {
        if (!response || response.ok !== true) {
          throw new Error(response && response.message ? response.message : JSON.stringify(response));
        }

        inputList(scope).forEach(function (input, index) {
          var key = keyOf(input, index);

          if (Object.prototype.hasOwnProperty.call(current, key)) {
            input.setAttribute("data-default", current[key] == null ? "" : String(current[key]));
          }
        });

        afterSave(scope, {
          response: response
        });

        setStatus(
          scope,
          "已取代 default 並寫回 Sheet：" +
          (response.replacedRows || rows.length) +
          " 筆；已刪除舊設定列：" +
          (response.deletedRows || response.deletedDefaultRows || 0) +
          " 筆。"
        );
      })
      .catch(function (error) {
        setStatus(scope, "取代 default 失敗：" + (error && error.message ? error.message : String(error)));
      });
  }
  function afterSave(scope, detail) {
    var s = scope.__skhpsCssSettingCoreState;
    if (!s) return;

    var current = snapshot(scope);

    s.editMoment = current;
    s.sheetValue = current;
    s.defaultSnapshot = defaultSnapshot(scope);
    s.undoStack = [current];
    s.redoStack = [];
    s.editing = false;
    s.dirty = false;
    s.applying = false;

    var response = detail && detail.response;

    if (response && response.appendedRows !== undefined) {
      setStatus(scope, "已寫回 Sheet：" + response.appendedRows + " 筆，updatedAt=" + response.updatedAt);
    } else {
      setStatus(scope, "已寫回 Sheet。");
    }

    update(scope);
  }

  function bind(scope) {
    if (!scope || scope.__skhpsCssSettingCoreBound) return;

    ensureUndoRedo(scope);
    ensureReplaceDefault(scope);
    ensureReplaceDefault(scope);

    scope.__skhpsCssSettingCoreBound = true;
    scope.__skhpsCssSettingCoreState = {
      editing: false,
      dirty: false,
      applying: false,
      editMoment: snapshot(scope),
      defaultSnapshot: defaultSnapshot(scope),
      sheetValue: snapshot(scope),
      undoStack: [],
      redoStack: []
    };

    scope.addEventListener("click", function (event) {
      var button = event.target.closest("[data-css-setting-action]");
      if (!button || !scope.contains(button)) return;

      var action = button.getAttribute("data-css-setting-action");

      if (action === "edit") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (!scope.__skhpsCssSettingCoreState.editing) {
          beginEdit(scope);
        } else {
          cancelEdit(scope);
        }

        return;
      }

      if (action === "undo") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        undo(scope);
        return;
      }

      if (action === "redo") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        redo(scope);
        return;
      }

      if (action === "replace-default") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        replaceDefault(scope);
        return;
      }

      if (action === "default") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        restoreDefault(scope);
      }
    }, true);

    scope.addEventListener("input", function (event) {
      if (!event.target.closest("[data-css-var], [data-class-name][data-property]")) return;

      var s = scope.__skhpsCssSettingCoreState;
      if (!s || !s.editing || s.applying) return;

      /*
        手動輸入代表開新分支。
        redoStack 要立刻清空，避免 A-B-C undo 到 B 後輸入 D，還能 redo 回 C。
      */
      s.redoStack = [];
      update(scope);
    });

    scope.addEventListener("change", function (event) {
      if (!event.target.closest("[data-css-var], [data-class-name][data-property]")) return;
      commitChange(scope);
    });

    scope.addEventListener("skhps-css-setting-save-success", function (event) {
      afterSave(scope, event.detail || {});
    });

    update(scope);
  }

  function init(root) {
    allEditors(root || document).forEach(bind);
  }

  window.SKHPSCssSettingEditorCore = {
    init: init,
    bind: bind
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init(document);
    });
  } else {
    init(document);
  }
})();