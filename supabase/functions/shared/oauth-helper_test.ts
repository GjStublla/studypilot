import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  ADMIN_OAUTH_SCOPES,
  ADMIN_TOKEN_LIFETIME_SECONDS,
  LIVE_OAUTH_SCOPE_CANDIDATES,
  LIVE_TOKEN_LIFETIME_SECONDS,
  usesCloudPlatformScope,
} from "./oauth-helper.ts"

Deno.test("Live token lifetime is shorter than admin and at most 15 minutes", () => {
  assertEquals(LIVE_TOKEN_LIFETIME_SECONDS, 900)
  assertEquals(LIVE_TOKEN_LIFETIME_SECONDS < ADMIN_TOKEN_LIFETIME_SECONDS, true)
})

Deno.test("Live scope candidates try non-cloud-platform first", () => {
  assertEquals(LIVE_OAUTH_SCOPE_CANDIDATES.length >= 2, true)
  assertEquals(
    usesCloudPlatformScope(LIVE_OAUTH_SCOPE_CANDIDATES[0]),
    false,
  )
  const last =
    LIVE_OAUTH_SCOPE_CANDIDATES[LIVE_OAUTH_SCOPE_CANDIDATES.length - 1]
  assertEquals(usesCloudPlatformScope(last), true)
})

Deno.test("admin OAuth scopes are not the Live token cache", () => {
  assertEquals(usesCloudPlatformScope(ADMIN_OAUTH_SCOPES), true)
  assertEquals(
    ADMIN_OAUTH_SCOPES.includes(
      "https://www.googleapis.com/auth/generative-language.retriever",
    ),
    true,
  )
  assertEquals(
    LIVE_OAUTH_SCOPE_CANDIDATES.some((scopes) =>
      scopes.includes(
        "https://www.googleapis.com/auth/generative-language.retriever",
      )
    ),
    false,
  )
})
