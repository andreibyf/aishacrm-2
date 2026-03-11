; ── Keywords ──────────────────────────────────────────────────────────────────

[
  "fn"
  "type"
  "enum"
  "trait"
  "impl"
  "for"
  "match"
  "if"
  "else"
  "return"
  "let"
  "mut"
  "import"
  "from"
  "as"
  "in"
  "const"
  "while"
  "break"
  "continue"
] @keyword

[
  "actor"
  "async"
  "await"
  "spawn"
  "requires"
  "ensures"
  "policy"
  "self"
] @keyword.modifier

; ── Operators ─────────────────────────────────────────────────────────────────

[
  "=>"
  "->"
  "|>"
  "??"
  "?."
  "?"
  "::"
  "..."
  "=="
  "!="
  "<="
  ">="
  "<"
  ">"
  "&&"
  "||"
  "+"
  "-"
  "*"
  "/"
  "%"
  "="
  "+="
  "-="
  "*="
  "/="
] @operator

; ── Punctuation ───────────────────────────────────────────────────────────────

[ "(" ")" "[" "]" "{" "}" ] @punctuation.bracket
[ "," ";" ":" ] @punctuation.delimiter

; ── Comments ──────────────────────────────────────────────────────────────────

(comment) @comment

; Doc comments (///) — give them a special highlight
((comment) @comment.documentation
  (#match? @comment.documentation "^///"))

; ── Strings ───────────────────────────────────────────────────────────────────

(double_quoted_string) @string
(template_string) @string
(string_content) @string
(template_content) @string
(string_escape) @string.escape
(string_interpolation "${" @punctuation.special "}" @punctuation.special)

; ── Numbers ───────────────────────────────────────────────────────────────────

(number) @number

; ── Booleans ──────────────────────────────────────────────────────────────────

(boolean) @boolean

; ── Null ──────────────────────────────────────────────────────────────────────

(null_literal) @constant.builtin

; ── Result constructors ───────────────────────────────────────────────────────

((result_constructor tag: _ @keyword.return)
  (#match? @keyword.return "^(Ok|Err|Some|None)$"))

; ── Annotations / decorators ──────────────────────────────────────────────────

(annotation "@" @attribute (identifier) @attribute)

; Policy values inside annotations
(annotation_argument (policy_value) @constant)

; ── Effect declarations ───────────────────────────────────────────────────────

(effect_list "!" @keyword.modifier (effect_name) @keyword.modifier)

; ── Types ─────────────────────────────────────────────────────────────────────

(type_identifier) @type

; Primitive types
((type_identifier) @type.builtin
  (#match? @type.builtin
    "^(String|Number|Boolean|Bool|JSONB|Array|Object|Void|Int|i32|i64|u32|u64|f32|f64)$"))

; Result/Option
((type_identifier) @type.builtin
  (#match? @type.builtin "^(Result|Option|Some)$"))

; CRM domain types
((type_identifier) @type
  (#match? @type
    "^(Account|Lead|Contact|Opportunity|Activity|Note|User|Tenant|Snapshot|Policy|Employee|BizDevSource|ConversionResult|Summary|Assignment|Document|Workflow|WorkflowStep|CashFlowTransaction)$"))

; Error types
((type_identifier) @type.error
  (#match? @type.error
    "^(CRMError|NotFound|ValidationError|PermissionDenied|NetworkError|DatabaseError|PolicyViolation|APIError)$"))

; Capability types
((type_identifier) @type.builtin
  (#match? @type.builtin
    "^(Http|Clock|Fs|Db|Email|Notify|Auth|Response|HttpError|IoError|Path|ReadOnly|File|Addr)$"))

; ── Functions ─────────────────────────────────────────────────────────────────

; Function definition name
(function_definition name: (identifier) @function)

; Function signature name (in traits)
(function_signature name: (identifier) @function)

; Function call
(call_expression function: (identifier) @function.call)
(call_expression function: (member_expression property: (identifier) @function.method))

; Built-in capability calls
((identifier) @function.builtin
  (#match? @function.builtin
    "^(len|includes|toString|parseInt|parseFloat|encodeURIComponent|reduce|map|filter|sum|avg|flat|reverse|sort)$"))

; http.get / http.post etc.
((member_expression
  object: (identifier) @_ns
  property: (identifier) @function.builtin)
  (#eq? @_ns "http"))

((member_expression
  object: (identifier) @_ns
  property: (identifier) @function.builtin)
  (#eq? @_ns "clock"))

((member_expression
  object: (identifier) @_ns
  property: (identifier) @function.builtin)
  (#eq? @_ns "fs"))

((member_expression
  object: (identifier) @_ns
  property: (identifier) @function.builtin)
  (#eq? @_ns "notify"))

; ── Variables / identifiers ───────────────────────────────────────────────────

; Parameter names
(parameter name: (identifier) @variable.parameter)

; Let binding names
(let_statement name: (identifier) @variable)

; Record/object keys
(object_property key: (identifier) @property)
(record_field name: (identifier) @property)

; Destructure pattern binding
(destructure_pattern (identifier) @variable.parameter)

; ── Type definitions ──────────────────────────────────────────────────────────

(type_definition name: (type_identifier) @type.definition)
(enum_definition name: (type_identifier) @type.definition)
(trait_definition name: (type_identifier) @type.definition)
(impl_definition trait: (type_identifier) @type (type: (type_identifier)) @type)

; Union variant names
(union_variant name: (type_identifier) @constructor)
(enum_variant name: (type_identifier) @constructor)

; ── Import ────────────────────────────────────────────────────────────────────

(import_statement (identifier) @type)
