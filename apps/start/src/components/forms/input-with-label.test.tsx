// @vitest-environment jsdom

// A label with spaces used to become the field's id, and aria-describedby
// splits on spaces, so the input never pointed at its hint or error.

import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { fieldMessageId, InputWithLabel, WithLabel } from './input-with-label';

describe('InputWithLabel', () => {
  test('ties the label and the message to the input with single-token ids', () => {
    const { container } = render(
      <InputWithLabel error="Required" label="Client name" />
    );
    const input = container.querySelector('input');
    const label = container.querySelector('label');
    const message = container.querySelector('[data-slot="field-error"]');

    expect(input?.id).toBeTruthy();
    expect(input?.id).not.toMatch(/\s/);
    expect(label?.getAttribute('for')).toBe(input?.id);
    expect(input?.getAttribute('aria-describedby')).toBe(message?.id);
    expect(message?.id).not.toMatch(/\s/);
  });

  test('omits aria-describedby when there is nothing to describe', () => {
    const { container } = render(<InputWithLabel label="Client name" />);
    expect(
      container.querySelector('input')?.hasAttribute('aria-describedby')
    ).toBe(false);
  });
});

describe('WithLabel', () => {
  test('lets a caller point its own control at the label and hint', () => {
    const { container } = render(
      <WithLabel
        hint="Shown under the field"
        id="client-type"
        label="Type of client"
      >
        <button
          aria-describedby={fieldMessageId('client-type')}
          id="client-type"
          type="button"
        />
      </WithLabel>
    );
    expect(container.querySelector('label')?.getAttribute('for')).toBe(
      'client-type'
    );
    expect(container.querySelector('[data-slot="field-hint"]')?.id).toBe(
      container.querySelector('button')?.getAttribute('aria-describedby')
    );
  });
});
