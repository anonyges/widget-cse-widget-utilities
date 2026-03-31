/* 
  author: kimd@fortinet.com
  modified: 260221 
*/
"use strict";

(function () {
  angular
    .module("cybersponse")
    .factory("cseMonacoEditor_jsonjinja", cseMonacoEditor_jsonjinja);

  cseMonacoEditor_jsonjinja.$inject = [];

  function cseMonacoEditor_jsonjinja() {
    const service = {
      create_editor: create_editor,
    };

    // -----------------------------------------------------------------
    function create_editor(monaco_editor_id = "") {
      const langId = "json-jinja";
      const isRegistered = monaco.languages
        .getLanguages()
        .some((lang) => lang.id === langId);

      if (isRegistered) {
        console.debug(
          `Language ${langId} already exists, skipping registration.`,
        );
      } else {
        console.debug(`Registering ${langId}.`);
        monaco.languages.register({ id: langId });

        // 1. MONARCH TOKENIZER (Visuals)
        monaco.languages.setMonarchTokensProvider(langId, {
          tokenizer: {
            root: [
              [/"([^"\\ \n]|\\.)+"(?=\s*:)/, "type.identifier"], // Keys
              [
                /"/,
                { token: "string.quote", bracket: "@open", next: "@string" },
              ],
              [
                /\{\{/,
                {
                  token: "string.quote",
                  bracket: "@open",
                  next: "@bracketString_1",
                },
              ],
              [
                /\{\%\-/,
                {
                  token: "string.quote",
                  bracket: "@open",
                  next: "@bracketString_2",
                },
              ],
              [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
              [/\b(?:true|false|null)\b/, "keyword"],
              [/[{} [\]]/, "delimiter.bracket"],
              [/:/, "operator"],
              [/,/, "delimiter"],
              { include: "@whitespace" },
            ],
            string: [
              [/[^\\" \n\r]+/, "string"],
              [/\\(?:[\\"\/bfnrt]|u[0-9A-Fa-f]{4})/, "string.escape"],
              [/\\./, "string.escape.invalid"],
              [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
              [/[\n\r]/, { token: "error", next: "@pop" }], // Visual error on newline
            ],
            bracketString_1: [
              [/[^}]+/, "string"],
              [
                /\}\}/,
                { token: "string.quote", bracket: "@close", next: "@pop" },
              ],
              [/}/, "string"],
            ],
            bracketString_2: [
              [
                /\-\%\}/,
                { token: "string.quote", bracket: "@close", next: "@pop" },
              ],
              [/[^-%\s}]+/, "string"],
              [/[-%]/, "string"],
              [/\s+/, "string"],
            ],
            whitespace: [[/[ \t\r\n]+/, "white"]],
          },
        });
      }

      // 2. VALIDATION LOGIC (The "Squiggles")
      function validate(model) {
        const markers = [];
        const fullText = model.getValue();

        // 1. Tokenizer Individual Patterns
        const patterns = {
          // Note: Removed the space from the punctuation character class
          standardString: /"(?:[^"\\\n]|\\.)*"/,
          bracketString_1: /\{\{[\s\S]*?\}\}/,
          bracketString_2: /\{\%\-[\s\S]*?\-\%\}/,
          jsonNumber: /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,
          jsonKeyword: /\b(?:true|false|null)\b/,
          punctuation: /[{}[\]:,]/, // Cleaned: no space inside here
          whitespace: /\s+/,
        };

        // 2. Combine using Named Capture Groups for clarity
        const tokenRegex = new RegExp(
          `(?<stdStr>${patterns.standardString.source})|` +
            `(?<brkStr_1>${patterns.bracketString_1.source})|` +
            `(?<brkStr_2>${patterns.bracketString_2.source})|` +
            `(?<num>${patterns.jsonNumber.source})|` +
            `(?<kw>${patterns.jsonKeyword.source})|` +
            `(?<punct>${patterns.punctuation.source})|` +
            `(?<ws>${patterns.whitespace.source})`,
          "g",
        );

        let lastIndex = 0;
        let match;
        let tokens = [];

        // Phase 1: Syntax & Token Collection
        while ((match = tokenRegex.exec(fullText)) !== null) {
          const groups = match.groups;

          // Check for gaps (unrecognized text)
          if (match.index > lastIndex) {
            const errorText = fullText.substring(lastIndex, match.index).trim();
            if (errorText.length > 0) {
              addMarker(
                lastIndex,
                match.index,
                `Invalid syntax: "${errorText}"`,
              );
            }
          }

          // Only collect non-whitespace tokens
          if (!groups.ws) {
            tokens.push({
              text: match[0],
              index: match.index,
              // If the 'punct' group matched, it's punctuation; otherwise, it's a value
              type: groups.punct ? "punctuation" : "value",
            });
          }
          lastIndex = tokenRegex.lastIndex;
        }

        // Phase 2: Refine "value" into "key"
        // A 'value' is actually a 'key' if the next token is a colon
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].type === "value") {
            const nextToken = tokens[i + 1];
            if (nextToken && nextToken.text === ":") {
              tokens[i].type = "key";
            }
          }
          // console.debug(tokens[i]);
        }

        let insideObjectStack = 0;
        let expectingKey = false;

        // Phase 2: Structural Validation
        for (let i = 0; i < tokens.length; i++) {
          const curr = tokens[i];
          const next = tokens[i + 1];

          // Track if we are inside an object
          if (curr.text === "{" && curr.type === "key") {
            insideObjectStack++;
            expectingKey = true; // After '{', we expect a key
          } else if (curr.text === "}" && curr.type === "key") {
            insideObjectStack--;
            expectingKey = false;
          } else if (curr.text === ",") {
            if (insideObjectStack > 0) expectingKey = true; // After ',', we expect a key
          }

          // --- THE FIX: Check if we got a { when we expected a Key ---
          if (expectingKey && curr.text === "{" && i > 0) {
            // If the current token is '{' but the structure dictates we needed a "key":
            // We only trigger this if it's NOT the very first opening brace.
            addMarker(
              curr.index,
              curr.index + 1,
              "Expected a object key, but found an opening brace.",
            );
          }

          // --- Check if a Value is missing a Key ---
          if (expectingKey && curr.text === ":") {
            addMarker(
              curr.index,
              curr.index + 1,
              "Colon found without a preceding key.",
            );
          }

          if (!next) break;

          // 1. Check for Missing Colon (Key must be followed by ':')
          if (curr.type === "key") {
            if (!next || next.text !== ":") {
              addMarker(
                curr.index,
                curr.index + curr.text.length,
                "Expected a colon after this key.",
              );
            }
          }

          // 2. Check for Missing Value (Colon must be followed by a value/object/array)
          if (curr.text === ":") {
            if (
              !next ||
              (next.type !== "value" && next.text !== "{" && next.text !== "[")
            ) {
              addMarker(
                curr.index,
                curr.index + 1,
                "Expected a value after this colon.",
              );
            }
          }

          if (!next) break;

          // 3. Comma Logic (Existing)
          if (isEnd(curr) && isStart(next)) {
            // If current is NOT a key (i.e., it's a finished value or block)
            // and the next thing is a start of a new pair, we need a comma.
            if (curr.type !== "key" && next.text !== ":") {
              addMarker(
                curr.index,
                curr.index + curr.text.length,
                "Expected a comma after this element.",
              );
            }
          }

          // --- TRAILING COMMA LOGIC ---
          if (curr.text === "," && (next.text === "}" || next.text === "]")) {
            addMarker(
              curr.index,
              curr.index + 1,
              "Trailing commas are not allowed.",
            );
          }

          // --- DOUBLE COMMA LOGIC ---
          if (curr.text === "," && next.text === ",") {
            addMarker(next.index, next.index + 1, "Unexpected extra comma.");
          }

          if (curr.text === "}" && next.type === "key") {
            addMarker(
              next.index,
              next.index + 1,
              "Expected a comma after this element.",
            );
          }
        }

        function isEnd(t) {
          return t.type === "value" || t.text === "}" || t.text === "]";
        }

        function isStart(t) {
          return t.type === "key" || t.text === "{" || t.text === "[";
        }

        function addMarker(sIdx, eIdx, msg) {
          const start = model.getPositionAt(sIdx);
          const end = model.getPositionAt(eIdx);
          markers.push({
            message: msg,
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          });
        }

        monaco.editor.setModelMarkers(model, "owner", markers);
      }

      // 3. INITIALIZE EDITOR
      const editor = monaco.editor.create(
        document.getElementById(monaco_editor_id),
        {
          language: langId,
          theme: "vs-dark",
          automaticLayout: true,
          tabSize: 2,
        },
      );

      // Run validation on change
      editor.onDidChangeModelContent(() => {
        validate(editor.getModel());
      });
      validate(editor.getModel()); // Run once at start

      // 4. FORMATTING PROVIDER (Resilient to syntax errors)
      monaco.languages.registerDocumentFormattingEditProvider(langId, {
        provideDocumentFormattingEdits(model, options) {
          const text = model.getValue();
          const tab = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";

          // Step 1: Extract all strings and {{blocks}} to protect them from whitespace changes
          const placeholders = [];
          const protectedText = text.replace(
            /(\{\{[\s\S]*?\}\})|("(?:[^"\\]|\\.)*")|(\{\%\-[\s\S]*?\-\%\})/g,
            (match) => {
              const id = `__PH${placeholders.length}__`;
              placeholders.push({ id, val: match });
              return id;
            },
          );

          // Step 2: Clean up whitespace around structural characters
          let clean = protectedText
            .replace(/\s+/g, " ") // Collapse all whitespace
            .replace(/\{/g, "{\n") // Open brace
            .replace(/\[/g, "[\n") // Open bracket
            .replace(/\}/g, "\n}") // Close brace
            .replace(/\]/g, "\n]") // Close bracket
            .replace(/,/g, ",\n"); // Comma

          // Step 3: Re-apply Indentation
          let indent = 0;
          let lines = clean.split("\n");
          let result = [];

          lines.forEach((line) => {
            line = line.trim();
            if (!line) return;

            if (line.match(/[}\]]/)) indent--;
            result.push(tab.repeat(Math.max(0, indent)) + line);
            if (line.match(/[{[]/)) indent++;
          });

          // Step 4: Restore protected strings
          let finalBody = result.join("\n");
          placeholders.forEach((p) => {
            finalBody = finalBody.replace(p.id, p.val);
          });

          return [{ range: model.getFullModelRange(), text: finalBody }];
        },
      });

      return editor;
    }
    // --------------------------------------------------------------------------------------------------------

    return service;
  }
})();
