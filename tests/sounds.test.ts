import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalog, normalizeUserSoundPreferences, soundEnabledFor } from '../lib/sounds';

test('sound catalog defaults use supplied assets and keep random matching silent', () => {
  const catalog = normalizeCatalog(null);
  assert.equal(catalog.sounds.random_matching.enabled, false);
  assert.equal(catalog.sounds.new_message.url, '/sounds/new_message.wav');
  assert.equal(catalog.masterVolume, 0.6);
});

test('administrator sound disable cannot be overridden by a user preference', () => {
  const catalog = normalizeCatalog({ allowUserPreferences: true, sounds: { new_message: { enabled: false } } });
  const preferences = normalizeUserSoundPreferences({ muted: { new_message: false }, volume: 1 });
  assert.equal(soundEnabledFor(preferences, catalog, 'new_message'), false);
});

test('user mute is applied only when administrator permits user sound preferences', () => {
  const preferences = normalizeUserSoundPreferences({ muted: { gift_received: true }, volume: 2 });
  const enabledCatalog = normalizeCatalog({ allowUserPreferences: true });
  const lockedCatalog = normalizeCatalog({ allowUserPreferences: false });
  assert.equal(preferences.volume, 1);
  assert.equal(soundEnabledFor(preferences, enabledCatalog, 'gift_received'), false);
  assert.equal(soundEnabledFor(preferences, lockedCatalog, 'gift_received'), true);
});

test('sound URLs reject arbitrary paths and restore the bundled asset', () => {
  const catalog = normalizeCatalog({ sounds: { call_ended: { url: 'https://example.test/unsafe.wav', enabled: true } } });
  assert.equal(catalog.sounds.call_ended.url, '/sounds/call_ended.wav');
  assert.equal(catalog.sounds.call_ended.isDefault, true);
});
