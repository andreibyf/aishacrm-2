; Increase indent inside blocks, objects, arrays, match
[
  (block)
  (object_literal)
  (array_literal)
  (match_expression)
  (record_type)
  (enum_definition)
  (trait_definition)
  (impl_definition)
] @indent

; Decrease at closing braces/brackets
[
  "}"
  "]"
  ")"
] @dedent
