import { test } from 'node:test';
import assert from 'node:assert/strict';

test('installed React and React DOM can render together', async () => {
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  const html = renderToString(React.createElement('button', { type: 'button' }, 'Shop REWEAR'));
  assert.equal(html, '<button type="button">Shop REWEAR</button>');
});
