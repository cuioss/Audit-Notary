import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { currentLocale, messagesStore } from './lib/i18n';
import { loadMessages } from './test/catalogue-fixture';

/** A Storage the tests control; jsdom's is shared across files. */
class MemoryStorage implements Storage {
  private store: Record<string, string> = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  writable: true,
  configurable: true,
});

// jsdom has no <dialog> behaviour; the component falls back to the `open` attribute.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom's File has no `text()`, which every browser has and the import of descriptors reads files with.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text === 'undefined') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom measures no layout and has no ResizeObserver, which `bind:clientWidth` uses: a silent one stands in, so a
// measuring component falls back to its documented default width.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

const english = loadMessages('en');

beforeEach(() => {
  storage.clear();
  currentLocale.set('en');
  messagesStore.set(english);
  vi.restoreAllMocks();
});
