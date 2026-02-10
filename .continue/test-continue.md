# Continue.dev Test Suite

Test your Continue.dev setup with these prompts in the Continue chat.

## 1. Basic Chat Test
```
Write a simple hello world function in JavaScript
```
**Expected:** Should generate a basic function using Qwen 3B

## 2. Code Explanation Test
Open any file in your workspace (e.g., `src/App.jsx`) and ask:
```
Explain what this file does
```
**Expected:** Should read the file and provide a summary

## 3. Autocomplete Test
- Open a new `.js` file
- Type: `function calculate`
- Wait for autocomplete suggestions
**Expected:** DeepSeek 1.3B should suggest completions

## 4. Repo Context Test
```

{
  "name": "file_glob_search",
  "arguments": {
    "pattern": "**/auth/**"
  }
}
```
**Expected:** Should search workspace and list auth-related files

## 5. Model Selection Test
In Continue chat, click the model dropdown and verify you see:
- Qwen 3B (Intel GPU) - default
- DeepSeek 1.3B (Autocomplete)
- Qwen 7B (Deep Analysis)
- DeepSeek 6.7B (Code Gen)
- Llama 3.1 8B (Reasoning)

## 6. Reranker Test (Optional)
If reranker service is running on port 5001:
```
Search for React components in the codebase, then rerank results by relevance to authentication
```
**Expected:** Should use rerank_context tool to improve results

## Quick Verification Checklist

- [ ] Ollama running on ports 11434 and 11435
- [ ] Continue.dev chat responds to questions
- [ ] Autocomplete works in code files
- [ ] Can select different models
- [ ] `@Codebase` searches work
- [ ] (Optional) Reranker service active

## Troubleshooting

**Chat not responding:**
1. Check Ollama is running: `http://localhost:11434` in browser
2. Verify Continue config: `.continue/config.yaml`
3. Check VS Code Output panel → Continue

**No autocomplete:**
1. Ensure DeepSeek 1.3B has `autocomplete` role in config
2. Wait 2-3 seconds after typing
3. Check Settings → Continue → Enable Autocomplete

**Slow responses:**
- Switch to Qwen 3B or DeepSeek 1.3B for faster responses
- Qwen 7B/DeepSeek 6.7B are on CPU (port 11435) - slower but higher quality

## Next Steps

Once basic tests pass, try:
- Edit suggestions: Select code → Ask "Refactor this to be more readable"
- Multi-file context: `@src/components @src/hooks explain the component flow`
- Custom prompts: Use prompts from config like `/architect` or `/debugger`
