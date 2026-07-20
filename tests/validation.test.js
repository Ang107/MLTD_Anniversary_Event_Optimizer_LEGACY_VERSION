"use strict";

import assert from "node:assert/strict";
import { DEFAULTS } from "../js/config.js";
import { applyFieldErrors, validate } from "../js/validation.js";

const validResult = validate(structuredClone(DEFAULTS));
assert.deepEqual(validResult.errors, [], "default configuration should be valid");

// UI モジュールも DOM のない Node 環境で安全に import できることを確認する。
await import("../js/tools-counter.js");

const inserted = [];
const input = {
  classList: { add() {} },
  insertAdjacentElement(position, node) { inserted.push({ position, node }); },
};

globalThis.document = {
  querySelectorAll() { return []; },
  getElementById(id) { return id === "target" ? input : null; },
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(),
      className: "",
      textContent: "",
      setAttribute() {},
      appendChild() {},
    };
  },
};

applyFieldErrors({ target: "入力値が不正です" });
assert.equal(inserted.length, 1);
assert.equal(inserted[0].position, "afterend");
assert.equal(inserted[0].node.className, "field-error");
assert.equal(inserted[0].node.textContent, "入力値が不正です");

console.log("PASS validation module tests");
