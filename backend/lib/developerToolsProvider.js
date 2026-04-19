/**
 * Developer Tools Provider Adapter
 *
 * Maps Braid VPS-side developer capability ids to the existing Developer AI
 * execution layer so we do not duplicate path validation, approval logic, or
 * command safety classification.
 */

import { executeDeveloperTool } from './developerAI.js';

export const DEVELOPER_CAPABILITY_TO_TOOL = {
  'dev:read_file': 'read_file',
  'dev:list_files': 'list_directory',
  'dev:search_code': 'search_code',
  'dev:run_safe_command': 'run_command',
  'dev:apply_patch': 'apply_patch',
  'dev:read_logs': 'read_logs',
};

export function mapDeveloperCapability(capability, input = {}) {
  switch (capability) {
    case 'dev:read_file':
      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          file_path: input.path,
          start_line: input.startLine,
          end_line: input.endLine,
        },
      };

    case 'dev:list_files':
      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          dir_path: input.path,
          recursive: input.recursive,
        },
      };

    case 'dev:search_code':
      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          pattern: input.query,
          directory: input.path,
          file_pattern: input.filePattern,
          case_insensitive: input.caseInsensitive,
        },
      };

    case 'dev:run_safe_command':
      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          command: input.command,
          working_directory: input.workingDirectory,
          reason: input.reason || 'Requested through Braid developer-tools provider',
        },
      };

    case 'dev:apply_patch':
      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          patch: input.patch,
          target_dir: input.targetDir,
          description: input.description || 'Patch proposed through Braid developer-tools provider',
        },
      };

    case 'dev:read_logs':
      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          log_type: input.target,
          lines: input.tail,
          filter: input.filter,
          analyze_patterns: input.analyzePatterns,
          since_minutes: input.sinceMinutes,
        },
      };

    default:
      return null;
  }
}

export function createDeveloperCapabilityExecutor(executor = executeDeveloperTool) {
  return async function executeDeveloperCapability(capability, input = {}, userId = null) {
    const mapped = mapDeveloperCapability(capability, input);

    if (!mapped) {
      return {
        error: `Unsupported developer-tools capability: ${capability}`,
        code: 'UNSUPPORTED_CAPABILITY',
      };
    }

    return executor(mapped.toolName, mapped.toolArgs, userId);
  };
}

export const executeDeveloperCapability = createDeveloperCapabilityExecutor();
