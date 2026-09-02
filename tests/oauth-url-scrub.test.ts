import assert from "node:assert/strict";

import { scrubSensitiveUrlParams, scrubEventUrls } from "../client/src/lib/scrubUrl";

/**
 * Auth0 redirects back to the app origin with the OAuth `code` and `state` in
 * the address bar. PostHog captures the URL (pageview and session recording
 * start URL) before Auth0 cleans it, so these tests lock in that analytics
 * never receives the callback parameters, while the rest of the URL survives.
 */

const CALLBACK_URL =
  "https://eventhub.example.com/?code=abc123SECRET&state=xyz789STATE&utm_source=meta";

// scrubSensitiveUrlParams removes code and state, keeps path and other params.
{
  const scrubbed = scrubSensitiveUrlParams(CALLBACK_URL);
  assert.ok(!scrubbed.includes("code="), "code must be removed");
  assert.ok(!scrubbed.includes("abc123SECRET"), "code value must be gone");
  assert.ok(!scrubbed.includes("state="), "state must be removed");
  assert.ok(!scrubbed.includes("xyz789STATE"), "state value must be gone");
  assert.ok(scrubbed.includes("utm_source=meta"), "unrelated params must survive");
}

// session_state (OIDC) is scrubbed too.
{
  const scrubbed = scrubSensitiveUrlParams(
    "https://eventhub.example.com/dashboard?session_state=oidc123&page=2",
  );
  assert.ok(!scrubbed.includes("session_state"), "session_state must be removed");
  assert.ok(scrubbed.includes("page=2"), "unrelated params must survive");
}

// A URL without sensitive params is returned unchanged.
{
  const clean = "https://eventhub.example.com/vendors?category=catering";
  assert.equal(scrubSensitiveUrlParams(clean), clean);
}

// Relative paths and non-URL strings pass through untouched.
{
  assert.equal(scrubSensitiveUrlParams("/vendors?code=abc"), "/vendors?code=abc");
  assert.equal(scrubSensitiveUrlParams("not a url"), "not a url");
}

// scrubEventUrls cleans every URL-bearing property on a captured event.
{
  const event = {
    properties: {
      $current_url: CALLBACK_URL,
      $session_recording_start_url: CALLBACK_URL,
      $referrer: "https://eventhub.example.com/login?state=leak",
      $pathname: "/",
      plan: "pro",
    },
    $set: { $initial_current_url: CALLBACK_URL },
    $set_once: { $initial_referrer: CALLBACK_URL },
  };

  const scrubbed = scrubEventUrls(event);
  const serialized = JSON.stringify(scrubbed);
  assert.ok(!serialized.includes("abc123SECRET"), "no code value anywhere in the event");
  assert.ok(!serialized.includes("xyz789STATE"), "no state value anywhere in the event");
  assert.ok(!serialized.includes("leak"), "referrer state value removed");
  assert.equal(scrubbed.properties.$pathname, "/", "non-URL property untouched");
  assert.equal(scrubbed.properties.plan, "pro", "unrelated property untouched");
}

// A null event (before_send may receive null) is returned as-is.
{
  assert.equal(scrubEventUrls(null), null);
}

console.log("oauth-url-scrub: all assertions passed");
