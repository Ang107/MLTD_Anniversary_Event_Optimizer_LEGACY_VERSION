"use strict";

let resultAvailable = false;
let savingSuppressed = false;

export function hasResult() {
  return resultAvailable;
}

export function setHasResult(value) {
  resultAvailable = Boolean(value);
}

export function isSaveSuppressed() {
  return savingSuppressed;
}

export function setSaveSuppressed(value) {
  savingSuppressed = Boolean(value);
}
