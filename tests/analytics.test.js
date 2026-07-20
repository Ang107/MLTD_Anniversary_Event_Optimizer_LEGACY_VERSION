"use strict";

import assert from "node:assert/strict";
import { trackEvent } from "../js/analytics.js";

const originalGtag = globalThis.gtag;

delete globalThis.gtag;
assert.doesNotThrow(() => trackEvent("disabled"));

const calls = [];
globalThis.gtag = (...args) => calls.push(args);
trackEvent("optimize", { mode: "test" });
assert.deepEqual(calls, [["event", "optimize", { mode: "test" }]]);

globalThis.gtag = () => { throw new Error("analytics unavailable"); };
assert.doesNotThrow(() => trackEvent("ignored-error"));

if (originalGtag === undefined) delete globalThis.gtag;
else globalThis.gtag = originalGtag;

console.log("PASS analytics module tests");
