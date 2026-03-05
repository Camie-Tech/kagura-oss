/**
 * DOM Extractor Service
 * Extracts interactive elements from the current page via Playwright.
 * Returns a structured PageAnalysis object for AI consumption.
 *
 * NOTE: The page.evaluate() call uses a string template instead of a function
 * to avoid esbuild's __name() wrapper injection (keepNames), which would cause
 * "ReferenceError: __name is not defined" when the function is stringified
 * and executed in the browser context.
 */

import type { Page } from 'playwright'

export interface FormInput {
  type: string
  name: string
  placeholder: string
  label: string
  required: boolean
  value: string
}

export interface FormInfo {
  action: string
  method: string
  inputs: FormInput[]
  buttons: { text: string; type: string }[]
}

export interface LinkInfo {
  text: string
  href: string
}

export interface ButtonInfo {
  text: string
  ariaLabel: string
}

export interface PageAnalysis {
  url: string
  title: string
  forms: FormInfo[]
  links: LinkInfo[]
  buttons: ButtonInfo[]
  headings: string[]
  errors: string[]
  modals: boolean
}

// Browser-side extraction script as a string to avoid esbuild __name injection
const EXTRACTION_SCRIPT = `
(() => {
  // Helper: get visible text, trimmed
  const getText = (el) => (el.textContent || '').trim().slice(0, 200);

  // Helper: find associated label for an input
  const getLabel = (input) => {
    // Check for aria-label
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Check for associated <label>
    if (input.id) {
      const label = document.querySelector('label[for="' + input.id + '"]');
      if (label) return getText(label);
    }

    // Check parent label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      // Remove the input itself from the clone to get just the label text
      const inputs = clone.querySelectorAll('input, textarea, select');
      inputs.forEach((i) => i.remove());
      return (clone.textContent || '').trim().slice(0, 200);
    }

    // Check aria-labelledby
    const labelledBy = input.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return getText(labelEl);
    }

    return '';
  };

  // Extract forms
  const forms = [];
  document.querySelectorAll('form').forEach((form) => {
    const inputs = [];
    form.querySelectorAll('input, textarea, select').forEach((el) => {
      const input = el;
      if (input.type === 'hidden') return;
      inputs.push({
        type: input.type || input.tagName.toLowerCase(),
        name: input.name || '',
        placeholder: input.placeholder || '',
        label: getLabel(input),
        required: input.required || false,
        value: input.type === 'password' ? '***' : (input.value || '').slice(0, 100),
      });
    });

    const buttons = [];
    form.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach((el) => {
      const btn = el;
      buttons.push({
        text: getText(btn) || btn.getAttribute('value') || '',
        type: btn.type || 'button',
      });
    });

    forms.push({
      action: form.action || '',
      method: (form.method || 'GET').toUpperCase(),
      inputs,
      buttons,
    });
  });

  // Extract standalone buttons (not inside forms)
  const standaloneButtons = [];
  document.querySelectorAll('button, [role="button"]').forEach((el) => {
    if (el.closest('form')) return;
    const text = getText(el);
    const ariaLabel = el.getAttribute('aria-label') || '';
    if (text || ariaLabel) {
      standaloneButtons.push({ text, ariaLabel });
    }
  });

  // Extract links - top 20 most prominent (with visible text)
  const allLinks = [];
  document.querySelectorAll('a[href]').forEach((el) => {
    const link = el;
    const text = getText(link);
    if (text && link.href) {
      allLinks.push({ text: text.slice(0, 100), href: link.href });
    }
  });
  const links = allLinks.slice(0, 20);

  // Extract headings h1-h3
  const headings = [];
  document.querySelectorAll('h1, h2, h3').forEach((el) => {
    const text = getText(el);
    if (text) headings.push(text.slice(0, 200));
  });

  // Detect error messages
  const errors = [];
  const errorSelectors = [
    '[role="alert"]',
    '.error', '.error-message', '.form-error',
    '.alert-danger', '.alert-error',
    '[class*="error"]', '[class*="Error"]',
    '[data-testid*="error"]',
  ];
  errorSelectors.forEach((sel) => {
    try {
      document.querySelectorAll(sel).forEach((el) => {
        const text = getText(el);
        if (text && text.length > 2) {
          errors.push(text.slice(0, 300));
        }
      });
    } catch {
      // Invalid selector, skip
    }
  });
  // Deduplicate errors
  const uniqueErrors = Array.from(new Set(errors)).slice(0, 5);

  // Detect modals/dialogs
  let modals = false;
  // Check for <dialog> elements that are open
  document.querySelectorAll('dialog[open]').forEach(() => { modals = true; });
  // Check for common modal patterns
  document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach((el) => {
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      modals = true;
    }
  });

  return {
    url: window.location.href,
    title: document.title,
    forms,
    links,
    buttons: standaloneButtons.slice(0, 20),
    headings: headings.slice(0, 10),
    errors: uniqueErrors,
    modals,
  };
})()
`

/**
 * Extract interactive elements from the current page.
 * Waits for network idle before extraction.
 */
export async function extractPageAnalysis(page: Page): Promise<PageAnalysis> {
  // Wait a moment for dynamic content to settle
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForTimeout(500)

  const analysis = await page.evaluate(EXTRACTION_SCRIPT)

  return analysis as PageAnalysis
}

/**
 * Summarize a PageAnalysis into a concise string for AI consumption.
 * Keeps token count low (~200-500 tokens typically).
 */
export function summarizePageAnalysis(analysis: PageAnalysis): string {
  const parts: string[] = []

  parts.push(`URL: ${analysis.url}`)
  parts.push(`Title: ${analysis.title}`)

  if (analysis.headings.length > 0) {
    parts.push(`Headings: ${analysis.headings.join(' | ')}`)
  }

  if (analysis.forms.length > 0) {
    analysis.forms.forEach((form, i) => {
      parts.push(`Form ${i + 1} (${form.method} ${form.action}):`)
      form.inputs.forEach(input => {
        const desc = [input.label, input.placeholder, input.name].filter(Boolean).join(' / ')
        parts.push(`  - ${input.type} input: ${desc}${input.required ? ' (required)' : ''}`)
      })
      form.buttons.forEach(btn => {
        parts.push(`  - button: "${btn.text}" (${btn.type})`)
      })
    })
  }

  if (analysis.buttons.length > 0) {
    parts.push('Standalone buttons:')
    analysis.buttons.forEach(btn => {
      parts.push(`  - "${btn.text}"${btn.ariaLabel ? ` (aria: ${btn.ariaLabel})` : ''}`)
    })
  }

  if (analysis.links.length > 0) {
    parts.push('Top links:')
    analysis.links.slice(0, 10).forEach(link => {
      parts.push(`  - "${link.text}" → ${link.href}`)
    })
  }

  if (analysis.errors.length > 0) {
    parts.push('Visible errors:')
    analysis.errors.forEach(err => parts.push(`  - ${err}`))
  }

  if (analysis.modals) {
    parts.push('NOTE: A modal/dialog is currently open.')
  }

  return parts.join('\n')
}
