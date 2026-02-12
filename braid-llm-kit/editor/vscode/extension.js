// Braid Language Extension - Formatter & Language Features
// VS Code extension entry point

const vscode = require('vscode');

// ─── Braid Formatter ───────────────────────────────────────────────────────────

class BraidFormatter {
  constructor() {
    this.indentSize = 2;
  }

  /**
   * Format a complete Braid document.
   * Handles: indentation, spacing, blank-line normalization, trailing whitespace.
   */
  format(text, options = {}) {
    this.indentSize = options.tabSize || 2;
    const insertFinalNewline = options.insertFinalNewline !== false;

    const lines = text.split('\n');
    const formatted = [];
    let indentLevel = 0;
    let inBlockComment = false;
    let prevLineBlank = false;
    let prevLineWasCloseBrace = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // ── Block comment tracking ──
      if (inBlockComment) {
        // Preserve block comment content, just trim trailing whitespace
        formatted.push(this._rtrim(line));
        if (line.includes('*/')) {
          inBlockComment = false;
        }
        prevLineBlank = false;
        prevLineWasCloseBrace = false;
        continue;
      }

      if (line.trimStart().startsWith('/*')) {
        inBlockComment = !line.includes('*/');
        formatted.push(this._rtrim(line));
        prevLineBlank = false;
        prevLineWasCloseBrace = false;
        continue;
      }

      // ── Trim and analyze ──
      const trimmed = line.trim();

      // Collapse multiple blank lines into one
      if (trimmed === '') {
        if (!prevLineBlank) {
          formatted.push('');
          prevLineBlank = true;
        }
        prevLineWasCloseBrace = false;
        continue;
      }
      prevLineBlank = false;

      // ── Determine indent adjustment BEFORE this line ──
      const closersAtStart = this._countLeadingClosers(trimmed);
      if (closersAtStart > 0) {
        indentLevel = Math.max(0, indentLevel - closersAtStart);
      }

      // ── Insert blank line before top-level `fn` (except first) ──
      if (indentLevel === 0 && trimmed.startsWith('fn ') && formatted.length > 0) {
        const lastNonBlank = this._lastNonBlankLine(formatted);
        if (lastNonBlank !== null && lastNonBlank !== '' && !lastNonBlank.startsWith('//') && !lastNonBlank.startsWith('import')) {
          if (!prevLineWasCloseBrace || formatted[formatted.length - 1] !== '') {
            formatted.push('');
          }
        }
      }

      // ── Insert blank line before top-level comment blocks that precede fn ──
      // (Only if previous line was a closing brace)
      if (indentLevel === 0 && trimmed.startsWith('//') && prevLineWasCloseBrace) {
        if (formatted.length > 0 && formatted[formatted.length - 1] !== '') {
          formatted.push('');
        }
      }

      // ── Format the line ──
      const formattedLine = this._formatLine(trimmed);
      const indent = ' '.repeat(this.indentSize * indentLevel);
      formatted.push(indent + formattedLine);

      // ── Determine indent adjustment AFTER this line ──
      const netOpeners = this._countNetOpeners(trimmed);
      indentLevel = Math.max(0, indentLevel + netOpeners);

      prevLineWasCloseBrace = /^[}\])]/.test(trimmed);
    }

    // Remove trailing blank lines
    while (formatted.length > 0 && formatted[formatted.length - 1] === '') {
      formatted.pop();
    }

    let result = formatted.join('\n');
    if (insertFinalNewline) {
      result += '\n';
    }
    return result;
  }

  /**
   * Format a single line (spacing fixes only, no indent).
   */
  _formatLine(line) {
    // Skip comments and strings-only lines
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      return line;
    }

    let result = line;

    // Normalize multiple spaces (outside strings) to single space
    result = this._normalizeSpaces(result);

    // Ensure space after keywords
    result = result.replace(/\b(fn|let|return|match|if|else|type|enum|import|from|const|trait|impl|for|actor|async|spawn|policy)\b(?=\S)/g, '$1 ');

    // Ensure space around arrows
    result = result.replace(/\s*->\s*/g, ' -> ');
    result = result.replace(/\s*=>\s*/g, ' => ');

    // Ensure space around = (but not ==, !=, <=, >=, =>)
    result = result.replace(/(?<![=!<>])=(?!=|>)/g, ' = ');
    // Clean up double spaces that could result
    result = result.replace(/ {2,}= {2,}/g, ' = ');

    // Ensure space after colon in key-value pairs (but not ::)
    result = result.replace(/(?<!:):(?!:)\s*/g, ': ');

    // Ensure space after comma
    result = result.replace(/,(?!\s)/g, ', ');

    // Clean up any resulting multiple spaces
    result = this._normalizeSpaces(result);

    return result;
  }

  /**
   * Normalize multiple consecutive spaces to single space, respecting strings.
   */
  _normalizeSpaces(line) {
    const segments = this._splitByStrings(line);
    return segments.map(seg => {
      if (seg.isString) return seg.text;
      return seg.text.replace(/ {2,}/g, ' ');
    }).join('');
  }

  /**
   * Split a line into string and non-string segments.
   */
  _splitByStrings(line) {
    const segments = [];
    let current = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (escape) {
        current += ch;
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        current += ch;
        escape = true;
        continue;
      }
      if (ch === '"') {
        if (inString) {
          current += ch;
          segments.push({ text: current, isString: true });
          current = '';
          inString = false;
        } else {
          if (current) segments.push({ text: current, isString: false });
          current = ch;
          inString = true;
        }
        continue;
      }
      current += ch;
    }
    if (current) {
      segments.push({ text: current, isString: inString });
    }
    return segments;
  }

  /**
   * Count opening brackets that aren't closed on this line.
   */
  _countNetOpeners(line) {
    // Ignore strings and comments
    const code = this._stripStringsAndComments(line);
    let count = 0;
    for (const ch of code) {
      if (ch === '{' || ch === '(') count++;
      if (ch === '}' || ch === ')') count--;
    }
    return Math.max(0, count);
  }

  /**
   * Count leading close brackets at the start of a trimmed line.
   */
  _countLeadingClosers(trimmed) {
    let count = 0;
    for (const ch of trimmed) {
      if (ch === '}' || ch === ')' || ch === ']') count++;
      else break;
    }
    return count;
  }

  /**
   * Strip string literals and line comments from code for bracket counting.
   */
  _stripStringsAndComments(line) {
    let result = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '/' && line[i + 1] === '/') break; // Line comment
      result += ch;
    }
    return result;
  }

  /**
   * Trim trailing whitespace.
   */
  _rtrim(line) {
    return line.replace(/\s+$/, '');
  }

  /**
   * Get last non-blank line from the formatted array.
   */
  _lastNonBlankLine(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== '') return lines[i].trim();
    }
    return null;
  }
}

// ─── VS Code Integration ────────────────────────────────────────────────────────

function activate(context) {
  const formatter = new BraidFormatter();

  // Register document formatter
  const formatterProvider = vscode.languages.registerDocumentFormattingEditProvider('braid', {
    provideDocumentFormattingEdits(document, options) {
      const config = vscode.workspace.getConfiguration('braid.format');
      const text = document.getText();
      const formatted = formatter.format(text, {
        tabSize: config.get('indentSize', options.tabSize || 2),
        insertFinalNewline: config.get('insertFinalNewline', true),
      });

      if (formatted === text) return [];

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length)
      );
      return [vscode.TextEdit.replace(fullRange, formatted)];
    }
  });

  // Register range formatter (for Format Selection)
  const rangeFormatterProvider = vscode.languages.registerDocumentRangeFormattingEditProvider('braid', {
    provideDocumentRangeFormattingEdits(document, range, options) {
      const config = vscode.workspace.getConfiguration('braid.format');
      // Expand range to full lines
      const startLine = range.start.line;
      const endLine = range.end.line;
      const expandedRange = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
      );

      const text = document.getText(expandedRange);
      const formatted = formatter.format(text, {
        tabSize: config.get('indentSize', options.tabSize || 2),
        insertFinalNewline: false, // Don't add final newline for range format
      });

      if (formatted === text) return [];
      return [vscode.TextEdit.replace(expandedRange, formatted)];
    }
  });

  // Register on-type formatting (auto-indent after { and })
  const onTypeFormatterProvider = vscode.languages.registerOnTypeFormattingEditProvider('braid', {
    provideOnTypeFormattingEdits(document, position, ch) {
      const line = document.lineAt(position.line);
      const trimmed = line.text.trim();

      // When user types }, auto-dedent
      if (ch === '}' && trimmed === '}' || trimmed === '};' || trimmed === '},') {
        // Find matching indent level by counting brackets above
        let indent = 0;
        for (let i = 0; i < position.line; i++) {
          const code = formatter._stripStringsAndComments(document.lineAt(i).text);
          for (const c of code) {
            if (c === '{') indent++;
            if (c === '}') indent--;
          }
        }
        indent = Math.max(0, indent);
        const newIndent = ' '.repeat(indent * (formatter.indentSize || 2));
        const newText = newIndent + trimmed;

        if (newText !== line.text) {
          return [vscode.TextEdit.replace(line.range, newText)];
        }
      }
      return [];
    }
  }, '}');

  context.subscriptions.push(formatterProvider, rangeFormatterProvider, onTypeFormatterProvider);

  // Status bar item to show Braid is active
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(symbol-misc) Braid';
  statusBar.tooltip = 'Braid Language v0.4.0 — Format: Shift+Alt+F';
  statusBar.command = 'editor.action.formatDocument';

  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'braid') {
        statusBar.show();
      } else {
        statusBar.hide();
      }
    })
  );

  // Show immediately if active editor is braid
  if (vscode.window.activeTextEditor?.document.languageId === 'braid') {
    statusBar.show();
  }

  console.log('Braid Language Extension v0.4.0 activated');
}

function deactivate() {}

module.exports = { activate, deactivate, BraidFormatter };
