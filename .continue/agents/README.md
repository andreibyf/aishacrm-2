# Continue.dev Agents for AiSHA CRM

> AI-powered development agents optimized for local Ollama models

## 🤖 Available Agents

All agents are properly formatted markdown files with YAML frontmatter, compatible with Continue.dev's agent system.

### 1. **Architect** ([architect.md](architect.md))
**Model:** Qwen2.5-Coder:7b  
**Use for:** Planning, architecture decisions, multi-file analysis

```
@architect Create a plan for adding user permissions to the settings module
```

**Best at:**
- Creating step-by-step implementation plans
- Analyzing data flows (UI → API → DB → Cache)
- Identifying risks and edge cases
- Multi-file reasoning and refactoring strategies

---

### 2. **CodeGen** ([codegen.md](codegen.md))
**Model:** DeepSeek-Coder:6.7b  
**Use for:** Fast code generation, component scaffolding

```
@codegen Create a new React component for displaying account analytics
```

**Best at:**
- Generating clean, minimal code
- Scaffolding new components and routes
- Writing Express API endpoints
- Creating database migrations
- Following existing patterns precisely

---

### 3. **Debugger** ([debugger.md](debugger.md))
**Model:** Qwen2.5-Coder:7b  
**Use for:** Debugging issues, root cause analysis

```
@debugger Why is the account update returning a 500 error?
```

**Best at:**
- Trace-first debugging workflows
- Identifying root causes systematically
- Proposing minimal diff fixes
- Understanding complex data flows
- Finding subtle bugs in multi-tenant logic

---

### 4. **TestEngineer** ([test-engineer.md](test-engineer.md))
**Model:** DeepSeek-Coder:6.7b  
**Use for:** Generating comprehensive tests

```
@test-engineer Generate Vitest tests for the account creation flow
```

**Best at:**
- Writing Vitest unit tests
- Creating Playwright component tests
- Generating E2E test scenarios
- Identifying edge cases and failure modes
- Using MSW for network mocking

---

### 5. **SecurityAuditor** ([security-auditor.md](security-auditor.md))
**Model:** Qwen2.5-Coder:7b  
**Use for:** Security audits, RLS policy review

```
@security-auditor Audit the RLS policies for the accounts table
```

**Best at:**
- Reviewing Supabase RLS policies
- Verifying multi-tenant isolation
- Identifying security vulnerabilities
- Checking authorization logic
- Suggesting security improvements

---

### 6. **PerformanceAuditor** ([performance-auditor.md](performance-auditor.md))
**Model:** Qwen2.5-Coder:7b  
**Use for:** Performance analysis, caching optimization

```
@performance-auditor Review Redis caching for the dashboard module
```

**Best at:**
- Auditing Redis caching strategies
- Identifying performance bottlenecks
- Finding expensive queries
- Suggesting caching opportunities
- Reviewing cache invalidation logic

---

### 7. **GitAgent** ([git-agent.md](git-agent.md))
**Model:** Llama3.1:8b  
**Use for:** Safe git operations, commit management

```
@git-agent Stage and commit the account updates with a conventional commit message
```

**Best at:**
- Generating conventional commit messages
- Verifying changes before committing
- Safe git workflows
- Preventing accidental commits
- Creating clean commit history

---

### 8. **RepoAnalyzer** ([repo-analyzer.md](repo-analyzer.md))
**Model:** Qwen2.5-Coder:7b  
**Use for:** Full repository audits, architecture review

```
@repo-analyzer Perform a full audit of the authentication module
```

**Best at:**
- Comprehensive repository analysis
- Architecture pattern identification
- Finding bugs and anti-patterns
- Identifying missing tests
- Suggesting prioritized improvements

---

## 🎯 Usage Patterns

### Planning Phase
1. **Start with Architect** for complex features
2. **Use RepoAnalyzer** for understanding existing code
3. **Get SecurityAuditor** feedback on sensitive changes

### Implementation Phase
1. **Architect** creates the plan
2. **CodeGen** implements the changes
3. **TestEngineer** generates tests
4. **GitAgent** commits the changes

### Debugging Phase
1. **Debugger** traces the issue
2. **CodeGen** implements the fix
3. **TestEngineer** adds regression tests

### Audit Phase
1. **RepoAnalyzer** for overall health
2. **SecurityAuditor** for RLS and auth
3. **PerformanceAuditor** for caching and queries

---

## 🔧 Model Assignments

| Agent | Model | Role | Speed | Quality |
|-------|-------|------|-------|---------|
| Architect | Qwen 7B | Planning | Medium | High |
| CodeGen | DeepSeek 6.7B | Generation | Fast | High |
| Debugger | Qwen 7B | Analysis | Medium | High |
| TestEngineer | DeepSeek 6.7B | Generation | Fast | High |
| SecurityAuditor | Qwen 7B | Analysis | Medium | High |
| PerformanceAuditor | Qwen 7B | Analysis | Medium | High |
| GitAgent | Llama 8B | Automation | Fast | Medium |
| RepoAnalyzer | Qwen 7B | Analysis | Slow | High |

---

## 💡 Best Practices

### Multi-Agent Workflows

**Feature Development:**
```
1. @architect Plan the user roles feature
2. @codegen Implement the roles API endpoints
3. @security-auditor Review the RLS policies
4. @test-engineer Generate E2E tests for roles
5. @git-agent Commit with conventional message
```

**Debugging:**
```
1. @debugger Trace why dashboard is slow
2. @performance-auditor Review caching for dashboard
3. @codegen Implement the caching fix
4. @test-engineer Add load tests
```

**Code Review:**
```
1. @repo-analyzer Audit the accounts module
2. @security-auditor Check RLS for accounts
3. @performance-auditor Check Redis usage
4. @test-engineer Verify test coverage
```

### Tips
- Use **Qwen** for thinking/analysis (slower but smarter)
- Use **DeepSeek** for generation (faster, precise)
- Us� Agent File Format

All agents use Continue.dev's standard markdown format:

```markdown
---
name: Agent Name
description: Brief description
model: model-name
tools: tool1, tool2, tool3
rules: optional-rules
---

Agent instructions and system prompt go here as markdown content.
Can include headers, lists, code examples, etc.
```

**Valid frontmatter fields:**
- `name` (required) - Display name
- `description` (optional) - Brief description
- `model` (optional) - Model identifier from config.yaml
- `tools` (optional) - Comma-separated tools (read, edit, grep, bash)
- `rules` (optional) - Comma-separated rules or rule references

## �e **Llama** for general tasks and automation
- Chain agents for complex workflows
- Always run tests after CodeGen changes

---

## 🔗 Related Files

- [config.yaml](../config.yaml) - Model configuration
- [prompts/](../prompts/) - Reusable prompts
- [workflows/](../workflows/) - Multi-agent workflows
- [COPILOT_PLAYBOOK.md](../../COPILOT_PLAYBOOK.md) - Development guidelines
- [CLAUDE.md](../../CLAUDE.md) - Extended documentation

---

## 📚 References

- [Continue.dev Agents Documentation](https://docs.continue.dev/features/agents)
- [AiSHA CRM Architecture](../../docs/AI_ARCHITECTURE_AISHA_AI.md)
- [Testing Strategy](../../docs/TESTING.md)
