// braid-ir.test.js — Integration tests for the multi-target IR pipeline
// Proves: source → parse → IR → emit_js AND emit_py
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parse } from './braid-parse.js';
import { lower, printIR, extractSignatures, extractTypes, countInstructions } from './braid-ir.js';
import { emitJS } from './braid-emit-js.js';
import { emitPython } from './braid-emit-py.js';

// Helper: full pipeline
function pipeline(src) {
  const ast = parse(src, 'test.braid');
  const ir = lower(ast);
  const js = emitJS(ir);
  const py = emitPython(ir);
  return { ast, ir, js, py };
}

// ============================================================================
// IR LOWERING
// ============================================================================

describe('IR: lowering basics', () => {
  it('lowers a simple function', () => {
    const { ir } = pipeline(`fn greet(name: String) -> String { return name; }`);
    assert.equal(ir.decls.length, 1);
    assert.equal(ir.decls[0].kind, 'FnDecl');
    assert.equal(ir.decls[0].name, 'greet');
  });

  it('lowers params with types', () => {
    const { ir } = pipeline(`fn add(a: Number, b: Number) -> Number { return a; }`);
    assert.equal(ir.decls[0].params[0].type.base, 'Number');
    assert.equal(ir.decls[0].params[1].type.base, 'Number');
  });

  it('lowers effects', () => {
    const { ir } = pipeline(`fn fetch(url: String) -> String !net { return url; }`);
    assert.deepEqual(ir.decls[0].effects, ['net']);
  });

  it('lowers annotations', () => {
    const { ir } = pipeline(`@policy(READ_ONLY)\nfn test() -> Void { return true; }`);
    assert.equal(ir.decls[0].annotations[0].name, 'policy');
    assert.deepEqual(ir.decls[0].annotations[0].args, ['READ_ONLY']);
  });

  it('lowers type declarations', () => {
    const { ir } = pipeline(`type Status = Active | Inactive`);
    assert.equal(ir.decls[0].kind, 'TypeDecl');
    assert.equal(ir.decls[0].name, 'Status');
  });
});

describe('IR: expression flattening', () => {
  it('flattens binary expressions to temporaries', () => {
    const { ir } = pipeline(`fn test(a: Number, b: Number) -> Number { return a + b; }`);
    const body = ir.decls[0].body;
    // Should have: binary instruction, then return referencing the temp
    assert.ok(body.some(i => i.op === 'binary'));
    assert.ok(body.some(i => i.op === 'return'));
  });

  it('flattens nested calls', () => {
    const { ir } = pipeline(`fn test(x: Number) -> Number { return len(items); }`);
    const body = ir.decls[0].body;
    assert.ok(body.some(i => i.op === 'call'));
  });

  it('flattens pipe to call', () => {
    const { ir } = pipeline(`fn test(x: Number) -> Number { return x |> double; }`);
    const body = ir.decls[0].body;
    // Pipe should lower to a call instruction
    assert.ok(body.some(i => i.op === 'call'));
  });

  it('flattens optional member access', () => {
    const { ir } = pipeline(`fn test(x: Object) -> Void { let y = x?.name; }`);
    const body = ir.decls[0].body;
    assert.ok(body.some(i => i.op === 'member' && i.optional === true));
  });
});

describe('IR: control flow', () => {
  it('lowers for..in', () => {
    const { ir } = pipeline(`fn test(items: Array) -> Void { for item in items { let x = item; } }`);
    assert.ok(ir.decls[0].body.some(i => i.op === 'for_in'));
  });

  it('lowers while', () => {
    const { ir } = pipeline(`fn test() -> Void { while true { break; } }`);
    assert.ok(ir.decls[0].body.some(i => i.op === 'while'));
  });

  it('lowers if/else', () => {
    const { ir } = pipeline(`fn test(x: Number) -> String { if x > 0 { return "pos"; } else { return "neg"; } }`);
    assert.ok(ir.decls[0].body.some(i => i.op === 'if'));
  });

  it('lowers break/continue', () => {
    const { ir } = pipeline(`fn test() -> Void { while true { break; continue; } }`);
    const whileInstr = ir.decls[0].body.find(i => i.op === 'while');
    assert.ok(whileInstr.body.some(i => i.op === 'break'));
    assert.ok(whileInstr.body.some(i => i.op === 'continue'));
  });
});

describe('IR: template strings', () => {
  it('lowers template to template instruction', () => {
    const src = 'fn test(name: String) -> String { return `hello ${name}`; }';
    const { ir } = pipeline(src);
    assert.ok(ir.decls[0].body.some(i => i.op === 'template'));
  });
});

describe('IR: spread', () => {
  it('lowers array spread', () => {
    const { ir } = pipeline(`fn test() -> Void { let x = [1, ...items]; }`);
    const arrInstr = ir.decls[0].body.find(i => i.op === 'array');
    assert.ok(arrInstr.elements.some(e => e.spread === true));
  });

  it('lowers object spread', () => {
    const { ir } = pipeline(`fn test() -> Void { let x = { ...base, y: 1 }; }`);
    const objInstr = ir.decls[0].body.find(i => i.op === 'object');
    assert.ok(objInstr.props.some(p => p.spread === true));
  });
});

// ============================================================================
// IR UTILITIES
// ============================================================================

describe('IR: utilities', () => {
  it('printIR produces readable output', () => {
    const { ir } = pipeline(`fn greet(name: String) -> String { return name; }`);
    const printed = printIR(ir);
    assert.ok(printed.includes('fn greet'));
    assert.ok(printed.includes('String'));
  });

  it('extractSignatures captures function metadata', () => {
    const { ir } = pipeline(`@policy(READ_ONLY)\nfn test(x: Number) -> String !net { return x; }`);
    const sigs = extractSignatures(ir);
    assert.equal(sigs.test.returnType.base, 'String');
    assert.deepEqual(sigs.test.effects, ['net']);
    assert.equal(sigs.test.annotations[0].name, 'policy');
  });

  it('extractTypes captures type declarations', () => {
    const { ir } = pipeline(`type Status = Active | Inactive`);
    const types = extractTypes(ir);
    assert.ok(types.Status);
    assert.equal(types.Status.variants.length, 2);
  });

  it('countInstructions counts correctly', () => {
    const { ir } = pipeline(`fn test(x: Number) -> Number { let y = x + 1; return y; }`);
    const count = countInstructions(ir);
    assert.ok(count > 0);
  });
});

// ============================================================================
// JS EMISSION
// ============================================================================

describe('JS emit: basics', () => {
  it('emits valid JS function', () => {
    const { js } = pipeline(`fn greet(name: String) -> String { return name; }`);
    assert.ok(js.code.includes('function greet(name)'));
    assert.ok(js.code.includes('return'));
  });

  it('emits type checks', () => {
    const { js } = pipeline(`fn test(name: String) -> Void { return name; }`);
    assert.ok(js.code.includes('checkType("test", "name"'));
  });

  it('emits async for effectful', () => {
    const { js } = pipeline(`fn test(url: String) -> String !net { return url; }`);
    assert.ok(js.code.includes('async function'));
    assert.ok(js.code.includes('cap(policy'));
  });

  it('emits for..of from for..in', () => {
    const { js } = pipeline(`fn test(items: Array) -> Void { for item in items { let x = item; } }`);
    assert.ok(js.code.includes('for (const item of'));
  });

  it('emits while loop', () => {
    const { js } = pipeline(`fn test() -> Void { while true { break; } }`);
    assert.ok(js.code.includes('while (true)'));
  });

  it('emits optional chaining', () => {
    const { js } = pipeline(`fn test(x: Object) -> Void { let y = x?.name; }`);
    assert.ok(js.code.includes('?.'));
  });

  it('emits spread in arrays', () => {
    const { js } = pipeline(`fn test() -> Void { let x = [1, ...items]; }`);
    assert.ok(js.code.includes('...items'));
  });

  it('emits template literals', () => {
    const src = 'fn test(name: String) -> String { return `hello ${name}`; }';
    const { js } = pipeline(src);
    assert.ok(js.code.includes('`'));
  });

  it('sandbox mode guards eval', () => {
    const ast = parse(`fn test() -> Void { let x = eval; }`);
    const ir = lower(ast);
    const { code } = emitJS(ir, { sandbox: true });
    assert.ok(code.includes('guardGlobal'));
  });
});

// ============================================================================
// PYTHON EMISSION
// ============================================================================

describe('Python emit: basics', () => {
  it('emits valid Python def', () => {
    const { py } = pipeline(`fn greet(name: String) -> String { return name; }`);
    assert.ok(py.code.includes('def greet(name: str) -> str:'));
  });

  it('emits Python type annotations', () => {
    const { py } = pipeline(`fn add(a: Number, b: Number) -> Number { return a; }`);
    assert.ok(py.code.includes('a: float'));
    assert.ok(py.code.includes('b: float'));
    assert.ok(py.code.includes('-> float'));
  });

  it('emits Python check_type', () => {
    const { py } = pipeline(`fn test(name: String) -> Void { return name; }`);
    assert.ok(py.code.includes('check_type("test", "name"'));
  });

  it('emits async def for effectful', () => {
    const { py } = pipeline(`fn test(url: String) -> String !net { return url; }`);
    assert.ok(py.code.includes('async def'));
  });

  it('emits Python for loop', () => {
    const { py } = pipeline(`fn test(items: Array) -> Void { for item in items { let x = item; } }`);
    assert.ok(py.code.includes('for item in'));
  });

  it('emits Python while loop', () => {
    const { py } = pipeline(`fn test() -> Void { while true { break; } }`);
    assert.ok(py.code.includes('while'));
    assert.ok(py.code.includes('break'));
  });

  it('emits f-strings for templates', () => {
    const src = 'fn test(name: String) -> String { return `hello ${name}`; }';
    const { py } = pipeline(src);
    assert.ok(py.code.includes('f"'));
  });

  it('emits Python spread as *', () => {
    const { py } = pipeline(`fn test() -> Void { let x = [1, ...items]; }`);
    assert.ok(py.code.includes('*items'));
  });

  it('emits Python dict spread as **', () => {
    const { py } = pipeline(`fn test() -> Void { let x = { ...base, y: 1 }; }`);
    assert.ok(py.code.includes('**base'));
  });

  it('emits True/False not true/false', () => {
    const { py } = pipeline(`fn test() -> Boolean { return true; }`);
    assert.ok(py.code.includes('True'));
    assert.ok(!py.code.includes(' true'));
  });

  it('emits None not undefined', () => {
    const { py } = pipeline(`fn test() -> Void { let x = null; }`);
    assert.ok(py.code.includes('None'));
  });

  it('emits and/or not &&/||', () => {
    const { py } = pipeline(`fn test(a: Boolean, b: Boolean) -> Boolean { return a && b || false; }`);
    assert.ok(py.code.includes(' and ') || py.code.includes(' or '));
  });

  it('uses not instead of !', () => {
    const { py } = pipeline(`fn test(a: Boolean) -> Boolean { return !a; }`);
    assert.ok(py.code.includes('not '));
  });

  it('emits Python dataclass for types', () => {
    const { py } = pipeline(`type Lead = Active { name: String } | Closed { reason: String }`);
    assert.ok(py.code.includes('@dataclass'));
    assert.ok(py.code.includes('class Active'));
    assert.ok(py.code.includes('class Closed'));
  });

  it('emits stdlib map as list(map(...))', () => {
    const { py } = pipeline(`fn test(items: Array) -> Array { return map(items, double); }`);
    assert.ok(py.code.includes('list(map('));
  });

  it('emits annotations as comments', () => {
    const { py } = pipeline(`@policy(READ_ONLY)\nfn test() -> Void { return true; }`);
    assert.ok(py.code.includes('# @policy(READ_ONLY)'));
  });
});

// ============================================================================
// CROSS-TARGET CONSISTENCY
// ============================================================================

describe('Cross-target: same IR, both outputs', () => {
  it('both targets compile from same source', () => {
    const src = `
      @policy(READ_ONLY)
      fn searchLeads(tenant_id: String, query: String) -> Array !net {
        let url = "/api/v2/leads";
        return url;
      }
    `;
    const { js, py, ir } = pipeline(src);
    // Both should succeed
    assert.ok(js.code.length > 0);
    assert.ok(py.code.length > 0);
    // Both should have the function
    assert.ok(js.code.includes('function searchLeads'));
    assert.ok(py.code.includes('def searchLeads'));
    // Both should have type checks
    assert.ok(js.code.includes('checkType'));
    assert.ok(py.code.includes('check_type'));
    // IR should be reusable
    assert.equal(ir.decls[0].name, 'searchLeads');
  });

  it('both targets handle all new features', () => {
    const src = `
      fn process(items: Array) -> Void {
        for item in items {
          let name = item?.label;
          let result = name |> validate;
          if result {
            let combined = [1, ...extra];
            let msg = { ...base, status: "done" };
          }
        }
      }
    `;
    const { js, py } = pipeline(src);
    // JS
    assert.ok(js.code.includes('for (const item of'));
    assert.ok(js.code.includes('?.'));
    // Python
    assert.ok(py.code.includes('for item in'));
  });
});

console.log('All braid-ir multi-target tests loaded');
