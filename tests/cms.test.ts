import test from 'node:test';
import assert from 'node:assert/strict';
import { cmsContent, defaultCmsContent, validCmsContent } from '../lib/cms';

test('CMS fallback provides the requested live video dating hero content', () => {
  assert.equal(defaultCmsContent.hero.heading, 'Meet Hot & Sexy\nPeople on');
  assert.equal(defaultCmsContent.hero.highlight, 'Live Video Chat.');
  assert.equal(defaultCmsContent.hero.ctaText, 'Start Video Chat Free');
});

test('CMS content validator accepts fallback and only permits safe image and CTA URLs', () => {
  assert.equal(validCmsContent(defaultCmsContent), true);
  assert.equal(validCmsContent({ ...defaultCmsContent, hero: { ...defaultCmsContent.hero, image: '//example.test/img.png' } }), false);
  assert.equal(validCmsContent({ ...defaultCmsContent, hero: { ...defaultCmsContent.hero, ctaHref: 'javascript:alert(1)' } }), false);
  assert.equal(validCmsContent({ ...defaultCmsContent, sections: null }), false);
});

test('CMS content migration merging keeps fallback data when optional published fields are absent', () => {
  const value = cmsContent({ hero: { heading: 'Updated heading' } });
  assert.equal(value.hero.heading, 'Updated heading');
  assert.equal(value.hero.image, defaultCmsContent.hero.image);
  assert.deepEqual(value.navigation, defaultCmsContent.navigation);
});
