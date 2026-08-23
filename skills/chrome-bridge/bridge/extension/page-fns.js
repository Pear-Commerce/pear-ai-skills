// Page-side functions injected with chrome.scripting.executeScript({ func }).
// CRITICAL: executeScript({func}) serializes ONE function and re-evaluates it
// in the tab — module-scope references (imports, constants, helpers) DO NOT
// survive. Every function below must therefore be fully self-contained, with
// all helpers it uses declared inside its own body, duplication and all.
// (Verified live: self-contained funcs work; closure-referencing funcs fail
// silently with an empty result.)
//
// snapshot/click-prep/type-prep/waitFor run in the ISOLATED world (default):
// the ref registry on window.__chromeBridgeRefs persists across calls within
// one document and disappears on navigation — which is exactly why refs go
// stale after navigation and the agent is told to re-snapshot.
//
// evaluate runs in the MAIN world (set by background.js) so expressions see
// the page's real window.

export function snapshotPage(maxChars) {
  const REF_REGISTRY_KEY = "__chromeBridgeRefs";
  function getRegistry(resetMap) {
    let reg = window[REF_REGISTRY_KEY];
    if (!reg || typeof reg !== "object") {
      reg = { next: 1, map: {} };
      window[REF_REGISTRY_KEY] = reg;
    }
    if (resetMap) reg.map = {};
    return reg;
  }
  function interactiveSelector() {
    return [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "summary",
      "label",
      "[role='button']",
      "[role='link']",
      "[role='menuitem']",
      "[role='tab']",
      "[role='checkbox']",
      "[role='switch']",
      "[role='combobox']",
      "[contenteditable='']",
      "[contenteditable='true']",
      "[onclick]",
      "[tabindex]",
    ].join(",");
  }
  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (el.getClientRects().length === 0) return false;
    return true;
  }
  function textOf(el, max = 60) {
    const raw = (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
    return raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
  }
  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const parts = [`<${tag}>`];
    const label = textOf(el, 60);
    if (label) parts.push(JSON.stringify(label));
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const type = el.getAttribute("type");
      const name = el.getAttribute("name");
      const placeholder = el.getAttribute("placeholder");
      const meta = [
        type ? `type=${type}` : null,
        name ? `name=${name}` : null,
        placeholder ? `placeholder=${JSON.stringify(placeholder)}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      if (meta) parts.push(`(${meta})`);
    }
    if (tag === "a") {
      const href = el.getAttribute("href");
      if (href) parts.push(`href=${JSON.stringify(href.length > 80 ? href.slice(0, 79) + "…" : href)}`);
    }
    return parts.join(" ");
  }

  const limit = typeof maxChars === "number" && maxChars > 0 ? maxChars : 12_000;
  const reg = getRegistry(true);
  const lines = [];
  let truncated = false;

  const push = (line) => {
    if (truncated) return;
    const next = lines.join("\n").length + line.length + 1;
    if (next > limit) {
      truncated = true;
      lines.push(`… [truncated at ${limit} chars — scroll down or navigate to a narrower page and snapshot again]`);
      return;
    }
    lines.push(line);
  };

  const walk = (node, depth) => {
    if (truncated || !(node instanceof Element)) return;
    if (depth > 14) return;
    if (!isVisible(node)) return;

    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const label = textOf(node, 100);
      if (label) push(`${"  ".repeat(depth)}heading ${JSON.stringify(label)}`);
    }

    if (node.matches(interactiveSelector())) {
      const ref = `ref_${reg.next++}`;
      reg.map[ref] = node;
      push(`${"  ".repeat(depth)}[${ref}] ${describeElement(node)}`);
    }

    for (const child of node.children) walk(child, depth + 1);
  };

  if (document.body) walk(document.body, 0);
  if (lines.length === 0) push("(no visible interactive content)");
  return { url: location.href, title: document.title, tree: lines.join("\n") };
}

// CDP actuation support: the service worker drives real input events via
// chrome.debugger (Input.dispatchMouseEvent / dispatchKeyEvent / insertText),
// which need viewport-relative coordinates and in-page focus/selection. These
// prepare functions do exactly that page-side part — scroll-into-view, settle,
// measure — and hand coordinates / readiness back; the actual events are
// dispatched by background.js over CDP (trusted input, unlike DOM events).

export async function preparePointAtRef(ref) {
  const REF_REGISTRY_KEY = "__chromeBridgeRefs";
  function lookupRef(r) {
    const reg = window[REF_REGISTRY_KEY];
    const el = reg && typeof reg === "object" ? reg.map[r] : null;
    if (!el || !(el instanceof Element) || !el.isConnected) {
      throw new Error(`${r} is stale or missing — take a fresh browser_snapshot and use a ref from it`);
    }
    return el;
  }
  function textOf(el, max = 40) {
    const raw = (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
    return raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
  }
  function settleFrames() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  const el = lookupRef(ref);
  el.scrollIntoView({ block: "center", inline: "center" });
  await settleFrames();
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    throw new Error(`${ref} has no visible box — take a fresh browser_snapshot and use a ref from it`);
  }
  return {
    ok: true,
    ref,
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
    label: textOf(el, 40),
  };
}

export function prepareTypeAtRef(ref) {
  const REF_REGISTRY_KEY = "__chromeBridgeRefs";
  function lookupRef(r) {
    const reg = window[REF_REGISTRY_KEY];
    const el = reg && typeof reg === "object" ? reg.map[r] : null;
    if (!el || !(el instanceof Element) || !el.isConnected) {
      throw new Error(`${r} is stale or missing — take a fresh browser_snapshot and use a ref from it`);
    }
    return el;
  }

  const el = lookupRef(ref);
  el.scrollIntoView({ block: "center", inline: "center" });
  el.focus();
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") {
    el.select();
  } else if (el.isContentEditable) {
    window.getSelection().selectAllChildren(el);
  } else {
    throw new Error(`${ref} is a <${tag}>, not a text input — pick an input/textarea/contenteditable ref from browser_snapshot`);
  }
  return { ok: true, ref };
}

export function viewportCenter() {
  return { ok: true, x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
}

export function waitForInPage(opts) {
  const text = opts && typeof opts.text === "string" && opts.text ? opts.text : null;
  const selector = opts && typeof opts.selector === "string" && opts.selector ? opts.selector : null;
  const timeoutMs = opts && Number.isFinite(opts.timeoutMs) ? Math.max(250, opts.timeoutMs) : 30_000;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      let found = false;
      if (selector) {
        try {
          found = !!document.querySelector(selector);
        } catch {
          reject(new Error(`invalid CSS selector ${JSON.stringify(selector)}`));
          return;
        }
      } else if (text) {
        found = (document.body?.innerText ?? "").toLowerCase().includes(text.toLowerCase());
      }
      if (found) {
        resolve({ found: true });
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`timed out after ${timeoutMs}ms waiting for ${selector ? `selector ${JSON.stringify(selector)}` : `text ${JSON.stringify(text)}`}`));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

export function evaluateInPage(expression) {
  const value = (0, eval)(expression);
  try {
    return { value: JSON.parse(JSON.stringify(value === undefined ? null : value)) };
  } catch {
    return { value: String(value) };
  }
}
