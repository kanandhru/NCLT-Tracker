/* NCLT Tracker — data binding loader
 * ----------------------------------------------------------------------
 * Single source of truth: data.json (sibling file).
 * Every page binds values to elements via data-key attributes.
 *
 * Usage in HTML:
 *   <span data-key="headline.cases_admitted.value">8,659</span>
 *   <span data-key="headline.cases_admitted.delta_text">▴ 1,044 this quarter</span>
 *   <span data-key="_meta.data_as_of">31 Mar 2026</span>
 *
 * The hard-coded value in the HTML acts as a fallback so the page still
 * renders meaningfully if data.json fails to load (e.g. when viewed via
 * file:// where fetch may be blocked).
 *
 * The loader logs any missing or extra keys to the console so we catch
 * binding drift before deploy.
 * ---------------------------------------------------------------------- */

(function () {
  'use strict';

  function resolve(obj, path) {
    return path.split('.').reduce(function (acc, k) {
      return (acc == null) ? undefined : acc[k];
    }, obj);
  }

  function bind(data) {
    var nodes = document.querySelectorAll('[data-key]');
    var missing = [];
    var bound = 0;

    nodes.forEach(function (el) {
      var key = el.getAttribute('data-key');
      var val = resolve(data, key);
      if (val === undefined || val === null) {
        missing.push(key);
        return;
      }
      // Primitive values get rendered as text; preserve any complex HTML siblings.
      if (typeof val === 'string') {
        el.textContent = val;
        bound++;
      } else if (typeof val === 'number') {
        // Format numbers consistently. data-format="raw" opts out (for percentages
        // or years where commas would look wrong). Otherwise: Indian locale, no
        // decimals for integers, up to 2 decimals for floats.
        var fmt = el.getAttribute('data-format');
        if (fmt === 'raw') {
          el.textContent = String(val);
        } else if (Number.isInteger(val)) {
          el.textContent = val.toLocaleString('en-IN');
        } else {
          el.textContent = val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        }
        bound++;
      } else if (Array.isArray(val) || typeof val === 'object') {
        // Skip — these are consumed by page-specific renderers (see below).
      }
    });

    // Also wire up data-key-href for source URLs on <a> elements.
    document.querySelectorAll('[data-key-href]').forEach(function (el) {
      var key = el.getAttribute('data-key-href');
      var val = resolve(data, key);
      if (typeof val === 'string') {
        el.setAttribute('href', val);
      } else {
        missing.push(key + ' (href)');
      }
    });

    if (missing.length) {
      console.warn('[NCLT Tracker] Missing data keys:', missing);
    }
    console.info('[NCLT Tracker] Data loaded · ' + bound + ' bindings · as of ' + (data._meta && data._meta.data_as_of));
  }

  // Page-specific renderers register here and are called once data loads.
  // Example: window.NCLTTracker.renderers.push(function(data){ ... });
  window.NCLTTracker = window.NCLTTracker || { renderers: [], data: null };

  function load() {
    fetch('data.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        window.NCLTTracker.data = data;
        bind(data);
        window.NCLTTracker.renderers.forEach(function (fn) {
          try { fn(data); } catch (e) { console.error('[NCLT Tracker] Renderer error:', e); }
        });
      })
      .catch(function (err) {
        console.warn('[NCLT Tracker] data.json failed to load — using HTML fallback values.', err);
        // Still call renderers with null so they can decide what to do.
        window.NCLTTracker.renderers.forEach(function (fn) {
          try { fn(null); } catch (e) { console.error('[NCLT Tracker] Renderer error:', e); }
        });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
