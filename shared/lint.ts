// Light code checks for the editor: unmatched brackets, unclosed strings,
// and a few language rules. They warn only. They never block a save.

export interface Issue {
  line: number;
  message: string;
}

interface StringRule {
  open: string;
  close: string;
  // "double": a doubled quote ("") is a literal quote. "char": this character escapes the next one.
  escape: "double" | { char: string };
  // A string that may not run past the end of a line.
  singleLine?: boolean;
}

interface Syntax {
  line: string[];
  block?: [string, string];
  strings: StringRule[];
}

const dq = (escape: StringRule["escape"], singleLine = false): StringRule => ({ open: '"', close: '"', escape, singleLine });
const sq = (escape: StringRule["escape"], singleLine = false): StringRule => ({ open: "'", close: "'", escape, singleLine });
const BS = { char: "\\" };
const C_BLOCK: [string, string] = ["/*", "*/"];

const SYNTAX: Record<string, Syntax> = {
  dax: { line: ["//", "--"], block: C_BLOCK, strings: [dq("double"), sq("double")] },
  powerquery: { line: ["//"], block: C_BLOCK, strings: [dq("double")] },
  powerfx: { line: ["//"], block: C_BLOCK, strings: [dq("double"), sq("double")] },
  powerautomate: { line: [], strings: [dq(BS), sq("double")] },
  sql: { line: ["--"], block: C_BLOCK, strings: [sq("double"), dq("double")] },
  python: {
    line: ["#"],
    strings: [
      { open: '"""', close: '"""', escape: BS },
      { open: "'''", close: "'''", escape: BS },
      dq(BS, true),
      sq(BS, true),
    ],
  },
  javascript: { line: ["//"], block: C_BLOCK, strings: [{ open: "`", close: "`", escape: BS }, dq(BS, true), sq(BS, true)] },
  powershell: { line: ["#"], block: ["<#", "#>"], strings: [dq({ char: "`" }), sq("double")] },
  csharp: { line: ["//"], block: C_BLOCK, strings: [dq(BS, true), sq(BS, true)] },
  css: { line: [], block: C_BLOCK, strings: [dq(BS, true), sq(BS, true)] },
};
SYNTAX.pyspark = SYNTAX.python!;
SYNTAX.typescript = SYNTAX.javascript!;

const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const MAX_ISSUES = 5;

interface Scan {
  issues: Issue[];
  words: string[];
}

function scan(code: string, syntax: Syntax): Scan {
  const issues: Issue[] = [];
  const words: string[] = [];
  const stack: { ch: string; line: number }[] = [];
  let line = 1;
  let i = 0;
  const at = (s: string) => code.startsWith(s, i);

  while (i < code.length && issues.length < MAX_ISSUES) {
    const ch = code[i]!;
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    // Comments.
    const lc = syntax.line.find(at);
    if (lc) {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    if (syntax.block && at(syntax.block[0])) {
      const start = line;
      const end = code.indexOf(syntax.block[1], i + syntax.block[0].length);
      const stop = end === -1 ? code.length : end + syntax.block[1].length;
      for (let k = i; k < stop; k++) if (code[k] === "\n") line++;
      if (end === -1) issues.push({ line: start, message: `The comment that starts on line ${start} is never closed.` });
      i = stop;
      continue;
    }
    // Strings.
    const rule = syntax.strings.find((r) => at(r.open));
    if (rule) {
      const start = line;
      i += rule.open.length;
      let closed = false;
      while (i < code.length) {
        if (rule.escape !== "double" && code[i] === rule.escape.char) {
          if (code[i + 1] === "\n") line++;
          i += 2;
          continue;
        }
        if (at(rule.close)) {
          if (rule.escape === "double" && code.startsWith(rule.close, i + rule.close.length)) {
            i += rule.close.length * 2;
            continue;
          }
          i += rule.close.length;
          closed = true;
          break;
        }
        if (code[i] === "\n") {
          if (rule.singleLine) break;
          line++;
        }
        i++;
      }
      if (!closed) issues.push({ line: start, message: `The string that starts on line ${start} is never closed.` });
      continue;
    }
    // Words, for the language rules.
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /\w/.test(code[j]!)) j++;
      words.push(code.slice(i, j));
      i = j;
      continue;
    }
    // Brackets.
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push({ ch, line });
    } else if (ch in PAIRS) {
      const top = stack[stack.length - 1];
      if (!top) {
        issues.push({ line, message: `Line ${line}: "${ch}" has no matching "${PAIRS[ch]}".` });
      } else if (top.ch !== PAIRS[ch]) {
        issues.push({ line, message: `Line ${line}: "${ch}" does not match "${top.ch}" from line ${top.line}.` });
        stack.pop();
      } else {
        stack.pop();
      }
    }
    i++;
  }
  for (const open of stack.slice(0, MAX_ISSUES - issues.length)) {
    issues.push({ line: open.line, message: `Line ${open.line}: "${open.ch}" is never closed.` });
  }
  return { issues, words };
}

/** Finds the first JSON syntax error. Returns its position and a short reason, or null. */
function jsonError(code: string): { pos: number; reason: string } | null {
  let i = 0;
  class Fail extends Error {
    constructor(public reason: string) {
      super(reason);
    }
  }
  const ws = () => {
    while (i < code.length && " \t\r\n".includes(code[i]!)) i++;
  };
  const expect = (s: string, what: string) => {
    if (!code.startsWith(s, i)) throw new Fail(`expected ${what}`);
    i += s.length;
  };
  const str = () => {
    expect('"', "a string");
    while (i < code.length && code[i] !== '"') {
      if (code[i] === "\n") throw new Fail("line break inside a string");
      i += code[i] === "\\" ? 2 : 1;
    }
    expect('"', "the end of the string");
  };
  const value = (): void => {
    ws();
    const ch = code[i];
    if (ch === "{") {
      i++;
      ws();
      if (code[i] === "}") return void i++;
      for (;;) {
        ws();
        str();
        ws();
        expect(":", '":"');
        value();
        ws();
        if (code[i] === ",") {
          i++;
          ws();
          if (code[i] === "}") throw new Fail("comma before }");
          continue;
        }
        expect("}", '"," or "}"');
        return;
      }
    }
    if (ch === "[") {
      i++;
      ws();
      if (code[i] === "]") return void i++;
      for (;;) {
        value();
        ws();
        if (code[i] === ",") {
          i++;
          ws();
          if (code[i] === "]") throw new Fail("comma before ]");
          continue;
        }
        expect("]", '"," or "]"');
        return;
      }
    }
    if (ch === '"') return str();
    const lit = /^(true|false|null|-?\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(code.slice(i, i + 64));
    if (!lit) throw new Fail("expected a value");
    i += lit[0].length;
  };
  try {
    value();
    ws();
    if (i < code.length) throw new Fail("unexpected text after the end");
    return null;
  } catch (e) {
    if (e instanceof Fail) return { pos: Math.min(i, code.length), reason: e.reason };
    throw e;
  }
}

function jsonIssue(code: string): Issue | null {
  const err = jsonError(code);
  if (!err) return null;
  const line = code.slice(0, err.pos).split("\n").length;
  return { line, message: `Line ${line}: not valid JSON (${err.reason}).` };
}

export function lintCode(code: string, language: string): Issue[] {
  if (!code.trim()) return [];
  if (language === "json") {
    const issue = jsonIssue(code);
    return issue ? [issue] : [];
  }
  const syntax = SYNTAX[language];
  if (!syntax) return [];
  const { issues, words } = scan(code, syntax);

  if (language === "powerquery") {
    const lets = words.filter((w) => w === "let").length;
    const ins = words.filter((w) => w === "in").length;
    if (lets > ins) issues.push({ line: 1, message: `"let" has no matching "in" (${lets} let, ${ins} in).` });
  }
  if (language === "dax") {
    const upper = words.map((w) => w.toUpperCase());
    if (upper.includes("VAR") && !upper.includes("RETURN")) issues.push({ line: 1, message: `"VAR" needs a "RETURN".` });
  }
  return issues.slice(0, MAX_ISSUES);
}
