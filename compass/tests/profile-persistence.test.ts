import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROFILE_HANDLE,
  DEFAULT_PROFILE_NAME,
  isValidProfileDraft,
  MAX_PROFILE_HANDLE_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  normalizeProfileHandle,
  normalizeProfileName,
  profileInitials,
} from "../src/shared/profile.ts";

test("missing or non-string profile values fall back to safe empty defaults", () => {
  assert.equal(normalizeProfileName(undefined), DEFAULT_PROFILE_NAME);
  assert.equal(normalizeProfileName(null), DEFAULT_PROFILE_NAME);
  assert.equal(normalizeProfileName(42), DEFAULT_PROFILE_NAME);
  assert.equal(normalizeProfileHandle(undefined), DEFAULT_PROFILE_HANDLE);
  assert.equal(normalizeProfileHandle(null), DEFAULT_PROFILE_HANDLE);
});

test("old hardcoded identity is not preserved — defaults are neutral", () => {
  // The previous UI hardcoded "ChordJiang" / "@chord_jiang"; the normalized
  // defaults must never reintroduce a specific person's identity.
  assert.notEqual(DEFAULT_PROFILE_NAME, "ChordJiang");
  assert.notEqual(DEFAULT_PROFILE_HANDLE, "chord_jiang");
});

test("names are trimmed, collapsed, and capped at the configured length", () => {
  assert.equal(normalizeProfileName("  Ada  Lovelace  "), "Ada Lovelace");
  const long = "x".repeat(MAX_PROFILE_NAME_LENGTH + 10);
  assert.equal(normalizeProfileName(long).length, MAX_PROFILE_NAME_LENGTH);
});

test("handles strip a leading @, collapse whitespace to underscores, and cap length", () => {
  assert.equal(normalizeProfileHandle("@chord_jiang"), "chord_jiang");
  assert.equal(normalizeProfileHandle("@@double"), "double");
  assert.equal(normalizeProfileHandle("  some body  "), "some_body");
  const long = "y".repeat(MAX_PROFILE_HANDLE_LENGTH + 10);
  assert.equal(normalizeProfileHandle(long).length, MAX_PROFILE_HANDLE_LENGTH);
});

test("profileInitials derive up to two uppercase letters from a name", () => {
  assert.equal(profileInitials("Ada Lovelace"), "AL");
  assert.equal(profileInitials("Grace"), "G");
  assert.equal(profileInitials(""), "");
  assert.equal(profileInitials("   "), "");
  // Single-word non-Latin names yield their first character.
  assert.equal(profileInitials("晓东"), "晓");
});

test("isValidProfileDraft rejects oversized or non-string drafts", () => {
  assert.equal(isValidProfileDraft("Ada", "ada"), true);
  assert.equal(isValidProfileDraft("", ""), true);
  assert.equal(isValidProfileDraft("x".repeat(MAX_PROFILE_NAME_LENGTH + 1), "a"), false);
  assert.equal(isValidProfileDraft("Ada", "y".repeat(MAX_PROFILE_HANDLE_LENGTH + 1)), false);
  assert.equal(isValidProfileDraft(123, "ada"), false);
});
