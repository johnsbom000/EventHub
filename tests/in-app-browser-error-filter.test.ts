import assert from "node:assert/strict";

import { dropInAppBrowserBridgeExceptions } from "../client/src/lib/inAppBrowserErrorFilter";

/**
 * The only $exception the project has seen is "Java object is gone" from the
 * Facebook in-app browser's injected bridge script — not an EventHub bug. The
 * before_send hook must drop those events while letting every real event pass.
 */

type Frame = { function?: string };

/** Builds a $exception CaptureResult whose stack names the given functions. */
function exceptionEvent(functionNames: string[]) {
  return {
    event: "$exception",
    properties: {
      $exception_list: [
        {
          type: "Error",
          value: "Error invoking postMessage: Java object is gone",
          stacktrace: { frames: functionNames.map((fn): Frame => ({ function: fn })) },
        },
      ],
    },
  } as never;
}

// Drops the Facebook in-app browser bridge error.
assert.equal(dropInAppBrowserBridgeExceptions(exceptionEvent(["sendDataToNative"])), null);
assert.equal(
  dropInAppBrowserBridgeExceptions(exceptionEvent(["sendJsBlockingTimeMessage"])),
  null,
);

// Drops it even when the bridge frame is not first in the stack.
assert.equal(
  dropInAppBrowserBridgeExceptions(exceptionEvent(["onClick", "sendDataToNative"])),
  null,
);

// Keeps a real EventHub exception.
const realError = exceptionEvent(["handleBookingSubmit", "onClick"]);
assert.equal(dropInAppBrowserBridgeExceptions(realError), realError);

// Passes non-exception events straight through.
const pageview = { event: "$pageview", properties: {} } as never;
assert.equal(dropInAppBrowserBridgeExceptions(pageview), pageview);

// Tolerates a $exception with no stack trace and a null event.
const noStack = { event: "$exception", properties: {} } as never;
assert.equal(dropInAppBrowserBridgeExceptions(noStack), noStack);
assert.equal(dropInAppBrowserBridgeExceptions(null), null);

console.log("in-app-browser-error-filter: all assertions passed");
