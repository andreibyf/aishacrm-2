/*
 * Braid PEG Grammar (simplified subset for MVP parsing)
 * Covers: functions, actors, attributes, types, effects, routes
 * Full expression/statement parsing deferred for transpiler phase
 */

{
  function buildList(head, tail, idx) {
    return [head].concat(tail.map(t => t[idx]));
  }
}

Program
  = __ items:(Item __)* { return { type: 'Program', items: items.map(i => i[0]) }; }

Item
  = attrs:(Attribute __)* item:(FnDecl / ActorDecl / TypeDecl) { 
      item.attributes = attrs.map(a => a[0]); 
      return item; 
    }

Attribute
  = "@" name:Ident args:AttributeArgs? { 
      return { type: 'Attribute', name, args: args || {} }; 
    }

AttributeArgs
  = "(" __ head:AttrArg tail:(__ "," __ AttrArg)* __ ")" {
      const obj = {};
      [head, ...tail.map(t => t[3])].forEach(kv => obj[kv.key] = kv.value);
      return obj;
    }

AttrArg
  = key:Ident __ ":" __ value:(StringLiteral / Ident) { return { key, value }; }

FnDecl
  = asyncBefore:"async"i? __ "fn" __ name:Ident __ "(" params:Params? ")" __ "->" __ ret:TypeExpr effects:EffectList? asyncAfter:"async"i? __ body:Block {
      return { 
        type: 'FnDecl', 
        name, 
        params: params || [], 
        ret, 
        effects: effects || [], 
        async: !!(asyncBefore || asyncAfter),
        body 
      };
    }

Params
  = head:Param tail:(__ "," __ Param)* { return buildList(head, tail, 3); }

Param
  = name:Ident __ ":" __ type:TypeExpr { return { name, type }; }

EffectList
  = __ "!" __ head:Ident tail:(__ "," __ Ident)* { return buildList(head, tail, 3); }

TypeExpr
  = RecordType
  / name:Ident generics:GenericArgs? { 
      return generics ? { base: name, generics } : name; 
    }

RecordType
  = "{" __ fields:FieldList? __ "}" { return { type: 'RecordType', fields: fields || [] }; }

GenericArgs
  = "[" __ head:TypeExpr tail:(__ "," __ TypeExpr)* __ "]" { return buildList(head, tail, 3); }

ActorDecl
  = "actor" __ name:Ident __ "{" __ "state" __ "{" __ fields:FieldList? __ "}" __ fns:FnDecl* __ "}" {
      return { type: 'ActorDecl', name, state: fields || [], fns };
    }

FieldList
  = head:Field tail:(__ "," __ Field)* { return buildList(head, tail, 3); }

Field
  = name:Ident __ ":" __ type:TypeExpr { return { name, type }; }

TypeDecl
  = "type" __ name:Ident __ "=" __ def:TypeExpr { 
      return { type: 'TypeDecl', name, def }; 
    }

Block
  = "{" __ body:$([^{}] / "{" [^{}]* "}")* __ "}" { 
      return { type: 'Block', raw: body.trim() }; 
    }

Statement
  = LetStmt / ExprStmt

LetStmt
  = "let" __ mut:"mut"? __ name:Ident __ ":" __ type:TypeExpr __ "=" __ expr:Expr __ ";" {
      return { type: 'Let', name, varType: type, expr, mut: !!mut };
    }

ExprStmt
  = expr:Expr __ ";" { return { type: 'ExprStmt', expr }; }

Expr
  = Ident / Literal / CallExpr

CallExpr
  = callee:Ident __ "(" args:ArgList? ")" { 
      return { type: 'Call', callee, args: args || [] }; 
    }

ArgList
  = head:Expr tail:(__ "," __ Expr)* { return buildList(head, tail, 3); }

Literal
  = Int / StringLiteral / Bool

Int
  = digits:[0-9]+ { return parseInt(digits.join(''), 10); }

Bool
  = "true" { return true; }
  / "false" { return false; }

StringLiteral
  = '"' chars:[^"]* '"' { return chars.join(''); }

Ident
  = !ReservedWord head:[a-zA-Z_] tail:[a-zA-Z0-9_]* { return head + tail.join(''); }

ReservedWord
  = ("fn" / "actor" / "type" / "let" / "mut" / "async" / "await" / "spawn" / "state" / "match" / "if" / "else" / "return" / "true" / "false") ![a-zA-Z0-9_]

__
  = ([ \t\r\n] / Comment)*

Comment
  = "//" [^\n]* / "/*" (!"*/" .)* "*/"
