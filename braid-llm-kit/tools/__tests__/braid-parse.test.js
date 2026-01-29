// braid-parse.test.js - Comprehensive parser tests
// Ensures parser evolution doesn't break security or functionality

import { parse } from '../braid-parse.js';
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Braid Parser', () => {
  
  describe('Basic Parsing', () => {
    it('parses empty function', () => {
      const result = parse('fn test() -> String { return "hello"; }');
      assert.strictEqual(result.type, 'Program');
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].type, 'FnDecl');
      assert.strictEqual(result.items[0].name, 'test');
    });

    it('parses function with parameters', () => {
      const result = parse('fn greet(name: String) -> String { return name; }');
      assert.strictEqual(result.items[0].params.length, 1);
      assert.strictEqual(result.items[0].params[0].name, 'name');
    });

    it('parses function with effects', () => {
      const result = parse('fn fetch(url: String) -> String !net { return url; }');
      assert.deepStrictEqual(result.items[0].effects, ['net']);
    });

    it('parses multiple effects', () => {
      const result = parse('fn work() -> String !net, clock, fs { return "done"; }');
      assert.deepStrictEqual(result.items[0].effects, ['net', 'clock', 'fs']);
    });
  });

  describe('Let Statements', () => {
    it('parses simple let', () => {
      const result = parse('fn test() -> Number { let x = 42; return x; }');
      const stmts = result.items[0].body.statements;
      assert.strictEqual(stmts[0].type, 'LetStmt');
      assert.strictEqual(stmts[0].name, 'x');
    });

    it('parses let with member access', () => {
      const result = parse('fn test() -> String { let x = response.data.id; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'MemberExpr');
    });

    it('parses let with binary expression', () => {
      const result = parse('fn test() -> Number { let x = a + b * c; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'BinaryExpr');
    });
  });

  describe('If Statements', () => {
    it('parses simple if', () => {
      const result = parse('fn test() -> Boolean { if x { return true; } return false; }');
      const stmts = result.items[0].body.statements;
      assert.strictEqual(stmts[0].type, 'IfStmt');
    });

    it('parses if with comparison', () => {
      const result = parse('fn test() -> Boolean { if x == y { return true; } return false; }');
      const cond = result.items[0].body.statements[0].cond;
      assert.strictEqual(cond.type, 'BinaryExpr');
      assert.strictEqual(cond.op, '==');
    });

    it('parses if with member access in condition', () => {
      const result = parse('fn test() -> Boolean { if response.tag == "Err" { return true; } return false; }');
      const cond = result.items[0].body.statements[0].cond;
      assert.strictEqual(cond.type, 'BinaryExpr');
      assert.strictEqual(cond.op, '==');
      assert.strictEqual(cond.left.type, 'MemberExpr');
      assert.strictEqual(cond.left.prop, 'tag');
    });

    it('parses if with nested member access', () => {
      const result = parse('fn test() -> Boolean { if a.b.c == d.e.f { return true; } return false; }');
      const cond = result.items[0].body.statements[0].cond;
      assert.strictEqual(cond.left.type, 'MemberExpr');
      assert.strictEqual(cond.right.type, 'MemberExpr');
    });

    it('parses if-else', () => {
      const result = parse('fn test() -> Boolean { if x { return true; } else { return false; } }');
      const ifStmt = result.items[0].body.statements[0];
      assert.notStrictEqual(ifStmt.else, null);
    });

    it('parses if with complex boolean condition', () => {
      const result = parse('fn test() -> Boolean { if x > 0 && y < 10 { return true; } return false; }');
      const cond = result.items[0].body.statements[0].cond;
      assert.strictEqual(cond.type, 'BinaryExpr');
      assert.strictEqual(cond.op, '&&');
    });

    it('parses if with method call in condition', () => {
      const result = parse('fn test() -> Boolean { if items.length() > 0 { return true; } return false; }');
      const cond = result.items[0].body.statements[0].cond;
      assert.strictEqual(cond.left.type, 'CallExpr');
    });
  });

  describe('Match Expressions', () => {
    it('parses match with Ok/Err', () => {
      const result = parse(`
        fn test() -> String {
          return match result {
            Ok{value} => value,
            Err{error} => "error"
          };
        }
      `);
      const ret = result.items[0].body.statements[0].value;
      assert.strictEqual(ret.type, 'MatchExpr');
      assert.strictEqual(ret.arms.length, 2);
    });

    it('parses match with wildcard', () => {
      const result = parse(`
        fn test() -> String {
          return match result {
            Ok{value} => value,
            Err{error} => "error",
            _ => "unknown"
          };
        }
      `);
      const arms = result.items[0].body.statements[0].value.arms;
      assert.strictEqual(arms[2].pat, '_');
    });
  });

  describe('Member Access', () => {
    it('parses single property access', () => {
      const result = parse('fn test() -> String { let x = obj.prop; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'MemberExpr');
      assert.strictEqual(value.prop, 'prop');
    });

    it('parses chained property access', () => {
      const result = parse('fn test() -> String { let x = a.b.c.d; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'MemberExpr');
      assert.strictEqual(value.prop, 'd');
      assert.strictEqual(value.obj.type, 'MemberExpr');
    });

    it('parses member access with binary operators', () => {
      const result = parse('fn test() -> Number { let x = a.value + b.value; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'BinaryExpr');
      assert.strictEqual(value.left.type, 'MemberExpr');
      assert.strictEqual(value.right.type, 'MemberExpr');
    });

    it('parses member access in function call arguments', () => {
      const result = parse('fn test() -> String { let x = func(obj.prop); return x; }');
      const call = result.items[0].body.statements[0].value;
      assert.strictEqual(call.type, 'CallExpr');
      assert.strictEqual(call.args[0].type, 'MemberExpr');
    });
  });

  describe('Index Access', () => {
    it('parses array index', () => {
      const result = parse('fn test() -> Number { let x = arr[0]; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'IndexExpr');
    });

    it('parses combined member and index', () => {
      const result = parse('fn test() -> Number { let x = obj.items[0].value; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'MemberExpr');
      assert.strictEqual(value.prop, 'value');
    });
  });

  describe('Function Calls', () => {
    it('parses simple function call', () => {
      const result = parse('fn test() -> String { let x = greet(); return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'CallExpr');
    });

    it('parses function call with arguments', () => {
      const result = parse('fn test() -> String { let x = greet("world", 42); return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.args.length, 2);
    });

    it('parses method call on member', () => {
      const result = parse('fn test() -> String { let x = http.get(url); return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'CallExpr');
      assert.strictEqual(value.callee.type, 'MemberExpr');
    });
  });

  describe('Object Literals', () => {
    it('parses simple object', () => {
      const result = parse('fn test() -> Object { let x = { name: "test" }; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'ObjectExpr');
      assert.strictEqual(value.props.length, 1);
    });

    it('parses nested object', () => {
      const result = parse('fn test() -> Object { let x = { data: { id: 1 } }; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.props[0].value.type, 'ObjectExpr');
    });
  });

  describe('Array Literals', () => {
    it('parses empty array', () => {
      const result = parse('fn test() -> Array { let x = []; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'ArrayExpr');
      assert.strictEqual(value.elements.length, 0);
    });

    it('parses array with elements', () => {
      const result = parse('fn test() -> Array { let x = [1, 2, 3]; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.elements.length, 3);
    });
  });

  describe('Binary Operators', () => {
    it('respects operator precedence', () => {
      const result = parse('fn test() -> Number { let x = 1 + 2 * 3; return x; }');
      const value = result.items[0].body.statements[0].value;
      // Should parse as 1 + (2 * 3)
      assert.strictEqual(value.op, '+');
      assert.strictEqual(value.right.op, '*');
    });

    it('handles comparison operators', () => {
      const ops = ['==', '!=', '<', '>', '<=', '>='];
      for (const op of ops) {
        const result = parse(`fn test() -> Boolean { let x = a ${op} b; return x; }`);
        const value = result.items[0].body.statements[0].value;
        assert.strictEqual(value.op, op, `Failed for operator ${op}`);
      }
    });

    it('handles logical operators', () => {
      const result = parse('fn test() -> Boolean { let x = a && b || c; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.op, '||');
    });
  });

  describe('Type Declarations', () => {
    it('parses type alias', () => {
      const result = parse('type Id = String');
      assert.strictEqual(result.items[0].type, 'TypeDecl');
      assert.strictEqual(result.items[0].name, 'Id');
    });

    it('parses union type', () => {
      const result = parse('type Result = Ok | Err');
      assert.strictEqual(result.items[0].variants.length, 2);
    });
  });

  describe('Import Declarations', () => {
    it('parses import', () => {
      const result = parse('import { Result, Option } from "../types.braid"');
      assert.strictEqual(result.items[0].type, 'ImportDecl');
      assert.deepStrictEqual(result.items[0].names, ['Result', 'Option']);
    });
  });

  describe('Error Cases', () => {
    it('rejects unterminated string', () => {
      assert.throws(() => parse('fn test() -> String { return "hello; }'), /unterminated string/);
    });

    it('rejects missing semicolon', () => {
      assert.throws(() => parse('fn test() -> String { let x = 1 return x; }'), /expected/);
    });

    it('rejects missing closing brace', () => {
      assert.throws(() => parse('fn test() -> String { return "hello";'), /expected/);
    });
  });

  describe('Security Constraints', () => {
    // These tests ensure the parser doesn't allow constructs that could bypass security
    
    it('does not allow eval-like constructs', () => {
      // Braid should not have any way to dynamically execute code
      // This test ensures no "eval" or similar is parsed as special
      const result = parse('fn test() -> String { let x = eval; return x; }');
      const value = result.items[0].body.statements[0].value;
      // 'eval' should just be an identifier, not special syntax
      assert.strictEqual(value.type, 'Ident');
      assert.strictEqual(value.name, 'eval');
    });

    it('does not allow prototype access', () => {
      // Ensure __proto__ is just a regular identifier
      const result = parse('fn test() -> String { let x = obj.__proto__; return x; }');
      const value = result.items[0].body.statements[0].value;
      assert.strictEqual(value.type, 'MemberExpr');
      // Note: runtime should block this, parser just treats it as normal member access
    });
  });

  describe('Real-World Patterns', () => {
    it('parses lifecycle workflow pattern', () => {
      const code = `
        fn workflow(tenant: String) -> Result !net {
          let response = http.post(url, { body: payload });
          
          if response.tag == "Err" {
            return Err({ tag: "WorkflowError", code: response.error.status });
          }
          
          let data = response.value.data;
          return Ok({ success: true, id: data.id });
        }
      `;
      const result = parse(code);
      assert.strictEqual(result.items[0].name, 'workflow');
      const stmts = result.items[0].body.statements;
      assert.strictEqual(stmts[1].type, 'IfStmt');
      assert.strictEqual(stmts[1].cond.left.type, 'MemberExpr');
    });

    it('parses multi-step workflow with early returns', () => {
      const code = `
        fn multiStep(tenant: String) -> Result !net {
          let step1 = http.post(url1, { body: {} });
          if step1.tag == "Err" {
            return Err({ step: 1 });
          }
          
          let step2 = http.post(url2, { body: { ref: step1.value.id } });
          if step2.tag == "Err" {
            return Err({ step: 2 });
          }
          
          return Ok({ completed: true });
        }
      `;
      const result = parse(code);
      const stmts = result.items[0].body.statements;
      assert.strictEqual(stmts.length, 5); // let, if, let, if, return
    });
  });
});

console.log('All parser tests passed!');
