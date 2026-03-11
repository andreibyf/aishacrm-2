// tree-sitter grammar for Braid
// The AI-native DSL for LLM tool definitions (AiSHA CRM)
//
// Covers:
//  - Functions (fn), type aliases, record types, enum/union types
//  - @policy and other decorator annotations
//  - Effect declarations (!net, !clock, !fs, !db, etc.)
//  - Match expressions with destructuring patterns
//  - Let bindings (typed and untyped)
//  - Import statements
//  - HTTP, clock, fs, notify capability calls
//  - String interpolation (${ })
//  - All operators: =>, ->, |>, ??, ?., ?, ::, ...
//  - Comments: //, ///

module.exports = grammar({
  name: 'braid',

  extras: ($) => [$.comment, /\s/],

  word: ($) => $.identifier,

  conflicts: ($) => [[$.type_generic, $.comparison_expression]],

  rules: {
    // ── Top-level ──────────────────────────────────────────────────────────────
    source_file: ($) =>
      repeat(
        choice(
          $.import_statement,
          $.function_definition,
          $.type_definition,
          $.enum_definition,
          $.trait_definition,
          $.impl_definition,
          $.const_declaration,
          $.comment,
        ),
      ),

    // ── Imports ────────────────────────────────────────────────────────────────
    import_statement: ($) => seq('import', '{', commaSep1($.identifier), '}', 'from', $.string),

    // ── Function definitions ───────────────────────────────────────────────────
    function_definition: ($) =>
      seq(
        optional($.annotation),
        'fn',
        field('name', $.identifier),
        '(',
        optional($.parameter_list),
        ')',
        optional(seq('->', field('return_type', $.type_expression))),
        optional($.effect_list),
        field('body', $.block),
      ),

    parameter_list: ($) => commaSep1($.parameter),

    parameter: ($) => seq(field('name', $.identifier), ':', field('type', $.type_expression)),

    effect_list: ($) => seq('!', commaSep1($.effect_name)),

    effect_name: ($) =>
      choice(
        'net',
        'clock',
        'fs',
        'db',
        'email',
        'io',
        'notify',
        seq('db', '.', choice('write', 'drop', 'truncate')),
        seq('fs', '.', 'delete_system'),
        seq('auth', '.', 'bypass'),
        seq('billing', '.', 'refund'),
        seq('user', '.', 'delete'),
      ),

    // ── Type definitions ───────────────────────────────────────────────────────
    type_definition: ($) =>
      seq(
        'type',
        field('name', $.type_identifier),
        '=',
        field('value', choice($.type_expression, $.record_type, $.union_type)),
      ),

    record_type: ($) => seq('{', repeat(seq($.record_field, optional(','))), '}'),

    record_field: ($) => seq(field('name', $.identifier), ':', field('type', $.type_expression)),

    union_type: ($) => seq(optional('|'), $.union_variant, repeat(seq('|', $.union_variant))),

    union_variant: ($) =>
      seq(field('name', $.type_identifier), optional(seq('{', commaSep1($.record_field), '}'))),

    enum_definition: ($) =>
      seq(
        'enum',
        field('name', $.type_identifier),
        '{',
        repeat(seq($.enum_variant, optional(','))),
        '}',
      ),

    enum_variant: ($) =>
      seq(field('name', $.type_identifier), optional(seq('{', commaSep1($.record_field), '}'))),

    trait_definition: ($) =>
      seq('trait', field('name', $.type_identifier), '{', repeat($.function_signature), '}'),

    function_signature: ($) =>
      seq(
        'fn',
        field('name', $.identifier),
        '(',
        optional($.parameter_list),
        ')',
        '->',
        field('return_type', $.type_expression),
      ),

    impl_definition: ($) =>
      seq(
        'impl',
        field('trait', $.type_identifier),
        'for',
        field('type', $.type_identifier),
        '{',
        repeat($.function_definition),
        '}',
      ),

    // ── Const ─────────────────────────────────────────────────────────────────
    const_declaration: ($) =>
      seq(
        'const',
        field('name', $.identifier),
        optional(seq(':', field('type', $.type_expression))),
        '=',
        field('value', $.expression),
        optional(';'),
      ),

    // ── Annotations ───────────────────────────────────────────────────────────
    annotation: ($) =>
      seq('@', $.identifier, optional(seq('(', commaSep1($.annotation_argument), ')'))),

    annotation_argument: ($) => choice($.policy_value, $.string, $.number, $.boolean, $.identifier),

    policy_value: (_) =>
      choice(
        'READ_ONLY',
        'WRITE_OPERATIONS',
        'DELETE_OPERATIONS',
        'ADMIN_ONLY',
        'SYSTEM_INTERNAL',
        'AI_SUGGESTIONS',
        'EXTERNAL_API',
      ),

    // ── Type expressions ───────────────────────────────────────────────────────
    type_expression: ($) =>
      choice(
        $.type_generic,
        $.function_type,
        $.type_union_inline,
        $.primitive_type,
        $.type_identifier,
      ),

    type_generic: ($) => seq($.type_identifier, '<', commaSep1($.type_expression), '>'),

    function_type: ($) =>
      seq('fn', '(', optional(commaSep1($.type_expression)), ')', '->', $.type_expression),

    type_union_inline: ($) => seq($.type_expression, repeat1(seq('|', $.type_expression))),

    primitive_type: (_) =>
      choice(
        'String',
        'Number',
        'Boolean',
        'Bool',
        'JSONB',
        'Array',
        'Object',
        'Void',
        'Int',
        'i32',
        'i64',
        'u32',
        'u64',
        'f32',
        'f64',
      ),

    // ── Blocks and statements ──────────────────────────────────────────────────
    block: ($) => seq('{', repeat($.statement), optional($.expression), '}'),

    statement: ($) =>
      choice($.let_statement, $.return_statement, $.expression_statement, $.comment),

    let_statement: ($) =>
      seq(
        'let',
        optional('mut'),
        field('name', $.identifier),
        optional(seq(':', field('type', $.type_expression))),
        '=',
        field('value', $.expression),
        optional(';'),
      ),

    return_statement: ($) => seq('return', $.expression, optional(';')),

    expression_statement: ($) => seq($.expression, optional(';')),

    // ── Expressions ───────────────────────────────────────────────────────────
    expression: ($) =>
      choice(
        $.match_expression,
        $.if_expression,
        $.binary_expression,
        $.unary_expression,
        $.pipe_expression,
        $.call_expression,
        $.member_expression,
        $.index_expression,
        $.object_literal,
        $.array_literal,
        $.template_string,
        $.string,
        $.number,
        $.boolean,
        $.null_literal,
        $.result_constructor,
        $.spread_expression,
        $.identifier,
        seq('(', $.expression, ')'),
      ),

    // ── Match ─────────────────────────────────────────────────────────────────
    match_expression: ($) =>
      seq('match', field('subject', $.expression), '{', repeat($.match_arm), '}'),

    match_arm: ($) =>
      seq(
        field('pattern', $.pattern),
        '=>',
        field('body', choice($.block, $.expression)),
        optional(','),
      ),

    pattern: ($) =>
      choice(
        $.destructure_pattern,
        $.wildcard_pattern,
        $.identifier,
        $.number,
        $.string,
        $.boolean,
      ),

    destructure_pattern: ($) =>
      seq(field('constructor', $.type_identifier), '{', commaSep1($.identifier), '}'),

    wildcard_pattern: (_) => '_',

    // ── If ────────────────────────────────────────────────────────────────────
    if_expression: ($) =>
      seq(
        'if',
        field('condition', $.expression),
        field('consequence', $.block),
        optional(seq('else', field('alternative', choice($.block, $.if_expression)))),
      ),

    // ── Binary / unary ────────────────────────────────────────────────────────
    binary_expression: ($) =>
      choice(
        prec.left(10, seq($.expression, '&&', $.expression)),
        prec.left(10, seq($.expression, '||', $.expression)),
        prec.left(9, seq($.expression, '==', $.expression)),
        prec.left(9, seq($.expression, '!=', $.expression)),
        prec.left(8, seq($.expression, '<=', $.expression)),
        prec.left(8, seq($.expression, '>=', $.expression)),
        prec.left(8, seq($.expression, '<', $.expression)),
        prec.left(8, seq($.expression, '>', $.expression)),
        prec.left(7, seq($.expression, '+', $.expression)),
        prec.left(7, seq($.expression, '-', $.expression)),
        prec.left(6, seq($.expression, '*', $.expression)),
        prec.left(6, seq($.expression, '/', $.expression)),
        prec.left(6, seq($.expression, '%', $.expression)),
        prec.left(5, seq($.expression, '??', $.expression)),
        prec.right(1, seq($.expression, '=', $.expression)),
        prec.right(1, seq($.expression, '+=', $.expression)),
        prec.right(1, seq($.expression, '-=', $.expression)),
        prec.right(1, seq($.expression, '*=', $.expression)),
        prec.right(1, seq($.expression, '/=', $.expression)),
      ),

    unary_expression: ($) => prec(11, choice(seq('!', $.expression), seq('-', $.expression))),

    pipe_expression: ($) => prec.left(3, seq($.expression, '|>', $.expression)),

    // ── Calls ─────────────────────────────────────────────────────────────────
    call_expression: ($) =>
      prec(
        20,
        seq(
          field('function', choice($.member_expression, $.identifier)),
          '(',
          optional($.argument_list),
          ')',
        ),
      ),

    argument_list: ($) => commaSep1($.expression),

    member_expression: ($) =>
      prec(
        19,
        seq(
          field('object', choice($.call_expression, $.identifier, $.member_expression)),
          choice('.', '?.'),
          field('property', $.identifier),
        ),
      ),

    index_expression: ($) =>
      prec(19, seq(field('object', $.expression), '[', field('index', $.expression), ']')),

    // ── Literals ──────────────────────────────────────────────────────────────
    object_literal: ($) => seq('{', repeat(seq($.object_property, optional(','))), '}'),

    object_property: ($) =>
      seq(field('key', choice($.identifier, $.string)), ':', field('value', $.expression)),

    array_literal: ($) => seq('[', optional(commaSep1($.expression)), ']'),

    spread_expression: ($) => seq('...', $.expression),

    result_constructor: ($) =>
      seq(field('tag', choice('Ok', 'Err', 'Some', 'None')), optional(seq('(', $.expression, ')'))),

    // ── Strings ───────────────────────────────────────────────────────────────
    string: ($) => choice($.double_quoted_string, $.template_string),

    double_quoted_string: ($) =>
      seq('"', repeat(choice($.string_escape, $.string_interpolation, $.string_content)), '"'),

    template_string: ($) =>
      seq('`', repeat(choice($.string_escape, $.string_interpolation, $.template_content)), '`'),

    string_interpolation: ($) => seq('${', $.expression, '}'),

    string_escape: (_) => token(seq('\\', /[\\`"nrt0$]/)),

    string_content: (_) => token(prec(-1, /[^"\\$]+/)),

    template_content: (_) => token(prec(-1, /[^`\\$]+/)),

    // ── Numbers ───────────────────────────────────────────────────────────────
    number: (_) =>
      token(choice(/0x[0-9a-fA-F]+(_[0-9a-fA-F]+)*/, /\d+\.\d+([eE][+-]?\d+)?/, /\d+(_\d+)*/)),

    // ── Booleans / null ───────────────────────────────────────────────────────
    boolean: (_) => choice('true', 'false'),

    null_literal: (_) => choice('null', 'None', 'undefined'),

    // ── Identifiers ───────────────────────────────────────────────────────────
    identifier: (_) => token(/[a-z_][a-zA-Z0-9_]*/),

    type_identifier: (_) => token(/[A-Z][a-zA-Z0-9_]*/),

    // ── Comments ──────────────────────────────────────────────────────────────
    comment: (_) =>
      token(choice(seq('///', /.*/), seq('//', /.*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))),
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)), optional(','));
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}
