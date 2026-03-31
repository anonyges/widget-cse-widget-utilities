/* 
  author: kimd@fortinet.com
  modified: 250102 
*/
"use strict";

(function () {
  angular.module("cybersponse").factory("cseJSUtil_v2", cseJSUtil_v2);

  cseJSUtil_v2.$inject = ["$http", "$resource", "API"];

  function cseJSUtil_v2($http, $resource, API) {
    const service = {
      jinja: jinja,
      isUUID4: isUUID4,
      isJsonString: isJsonString,
      getObjectKeyLength: getObjectKeyLength,
      getObjectKeySorted: getObjectKeySorted,
      waitForElement: waitForElement,
      waitForElements: waitForElements,
    };

    /**
     * Processes a template string using the Jinja editor API.
     * @param {string|object} template - The string containing {{vars}} or an object to be stringified.
     * @param {object|string} value - The context values for the template.
     */
    function jinja(template, value) {
      // 1. Ensure template is a String
      const normalizedTemplate =
        typeof template === "object" ? JSON.stringify(template) : template;

      // 2. Ensure value is an Object (Safe parsing)
      let normalizedValue = value;
      if (typeof value === "string") {
        try {
          normalizedValue = JSON.parse(value);
        } catch (e) {
          console.error("Jinja Error: 'value' parameter is not valid JSON", e);
          normalizedValue = {}; // Fallback to empty object
        }
      }

      // 3. Return the resource promise
      return $resource(`${API.WORKFLOW}api/jinja-editor/?format=json`).save({
        template: normalizedTemplate,
        values: normalizedValue,
      }).$promise;
    }

    /**
     * Validates if a string is a valid UUID v4.
     * @param {string} uuid - The string to validate.
     * @returns {boolean}
     */
    function isUUID4(uuid) {
      if (typeof uuid !== "string") return false;

      const v4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return v4Regex.test(uuid);
    }

    /**
     * Validates if a string is a valid JSON structure.
     * @param {string} str - The string to test.
     * @returns {boolean}
     */
    function isJsonString(str) {
      if (typeof str !== "string") return false;
      try {
        const result = JSON.parse(str);

        // Ensure result is an object or array (optional check)
        // This prevents strings like "true" or "123" from being treated as "JSON objects"
        return typeof result === "object" && result !== null;
      } catch (e) {
        return false;
      }
    }

    /**
     * Calculates the number of an object's own enumerable properties.
     * * @param {Object} obj - The object to evaluate.
     * @returns {number} The count of keys belonging directly to the object.
     * @note This is more memory-efficient than Object.keys() for large objects
     * as it avoids array allocation.
     */
    function getObjectKeyLength(obj) {
      if (!obj) return 0; // Guard clause for null/undefined

      let count = 0;
      for (const key in obj) {
        // Only count properties defined on the object itself
        if (Object.hasOwn(obj, key)) {
          count++;
        }
      }
      return count;
    }

    /**
     * Returns a sorted array of the object's own enumerable keys.
     * @param {Object} obj - The object to extract keys from.
     * @returns {string[]} A sorted array of strings representing the keys.
     */
    function getObjectKeySorted(obj) {
      if (!obj) return []; // Return empty array if null/undefined

      const keys = [];
      for (const key in obj) {
        // Following your pattern: only use properties defined on the object itself
        if (Object.hasOwn(obj, key)) {
          keys.push(key);
        }
      }

      // Returns keys sorted alphabetically (A-Z)
      return keys.sort();
    }

    /**
     * Asynchronously waits for a DOM element to exist based on a CSS selector.
     * * This function is useful for scripts that need to interact with elements
     * that are rendered dynamically (e.g., via AJAX or framework mounting).
     * It first checks if the element is already present; if not, it uses a
     * MutationObserver to watch for DOM changes and resolves once the element appears.
     *
     * @param {string} query - The CSS selector of the element to wait for (e.g., '#my-id' or '.my-class').
     * @returns {Promise<Element>} A promise that resolves with the found Element.
     */
    function waitForElement(query = "") {
      return new Promise((resolve) => {
        // 1. Check if it already exists
        const el = document.querySelector(query);
        if (el) return resolve(el);

        // 2. Observe with a "Wait a moment" check
        const observer = new MutationObserver((mutations, obs) => {
          // Use requestAnimationFrame or a 0ms timeout
          // to wait for the browser to finish the current paint
          window.requestAnimationFrame(() => {
            const el = document.querySelector(query);
            if (el) {
              obs.disconnect();
              resolve(el);
            }
          });
        });

        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      });
    }

    /**
     * Waits for a specific list of CSS selectors to appear in the DOM.
     * * This function monitors the document for changes and only resolves when
     * EVERY selector provided in the 'queries' array exists. It returns
     * an array of the matching elements in the same order as the queries.
     *
     * @param {string[]} queries - An array of CSS selector strings (e.g., ['.btn', '#nav']).
     * @returns {Promise<Element[]>} - A promise that resolves with the found Elements.
     */
    function waitForElements(queries = [""]) {
      return new Promise((resolve) => {
        // Helper to check if every selector in the list exists
        const getAllFound = () => {
          const results = queries.map((q) => document.querySelector(q));
          return results.every((el) => el !== null) ? results : null;
        };

        // 1. Initial check
        const existing = getAllFound();
        if (existing) return resolve(existing);

        // 2. Observe for changes
        const observer = new MutationObserver((mutations, obs) => {
          window.requestAnimationFrame(() => {
            const found = getAllFound();
            if (found) {
              obs.disconnect();
              resolve(found);
            }
          });
        });

        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      });
    }

    return service;
  }
})();
