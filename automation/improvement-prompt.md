Perform an incremental improvement pass on the repository.

Follow rules defined in .cursorrules.

Focus on:

- improving readability
- reducing duplication
- improving error handling
- improving type safety
- adding missing tests

Constraints:

- preserve existing functionality
- do not introduce new frameworks
- do not modify database schema
- do not modify authentication
- do not modify Braid execution engine

Procedure:

1. scan repository for improvement opportunities
2. apply one improvement at a time
3. run validation
4. fix failures
5. continue until no safe improvements remain

Return summary of changes.
