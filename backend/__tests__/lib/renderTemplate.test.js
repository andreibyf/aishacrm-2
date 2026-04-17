import test from 'node:test';
import assert from 'node:assert/strict';

import { injectVariables, renderTemplate } from '../../lib/templates/renderTemplate.js';

test('injectVariables replaces known variables and blanks missing ones', () => {
  const out = injectVariables('Hi {{name}} from {{company}} {{missing}}', {
    name: 'Ana',
    company: 'AiSHA',
  });
  assert.equal(out, 'Hi Ana from AiSHA ');
});

test('renderTemplate renders supported block types', () => {
  const html = renderTemplate(
    {
      blocks: [
        { type: 'text', content: 'Hi {{contact_name}}' },
        { type: 'image', url: 'https://example.com/a.png', alt: 'Banner' },
        { type: 'button', text: 'Book', url: 'https://example.com/book' },
        { type: 'divider' },
      ],
    },
    { contact_name: 'Chris' },
  );

  assert.match(html, /Hi Chris/);
  assert.match(html, /<img /);
  assert.match(html, /https:\/\/example.com\/a.png/);
  assert.match(html, /<a href=/);
  assert.match(html, /Book/);
  assert.match(html, /<hr /);
});

test('renderTemplate skips invalid non-absolute urls', () => {
  const html = renderTemplate({
    blocks: [
      { type: 'image', url: '/relative/image.png', alt: 'x' },
      { type: 'button', text: 'Go', url: 'javascript:alert(1)' },
    ],
  });

  assert.equal(html.includes('<img '), false);
  assert.equal(html.includes('<a href='), false);
});
