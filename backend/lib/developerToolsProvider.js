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

function invalidInput(error, details = {}) {
  return {
    error,
    code: 'INVALID_INPUT',
    details,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalidInput(`${fieldName} must be a non-empty string`, { field: fieldName });
  }

  return null;
}

function validateOptionalString(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    return invalidInput(`${fieldName} must be a string`, { field: fieldName });
  }

  return null;
}

function validateOptionalBoolean(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'boolean') {
    return invalidInput(`${fieldName} must be a boolean`, { field: fieldName });
  }

  return null;
}

function validateOptionalInteger(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 1) {
    return invalidInput(`${fieldName} must be a positive integer`, { field: fieldName });
  }

  return null;
}

export function mapDeveloperCapability(capability, input = {}) {
  if (!isPlainObject(input)) {
    return invalidInput('input must be an object', { capability });
  }

  const stringErrorFor = (value, fieldName) => requireNonEmptyString(value, fieldName);
  const optionalStringErrorFor = (value, fieldName) => validateOptionalString(value, fieldName);
  const optionalBooleanErrorFor = (value, fieldName) => validateOptionalBoolean(value, fieldName);
  const optionalIntegerErrorFor = (value, fieldName) => validateOptionalInteger(value, fieldName);

  switch (capability) {
    case 'dev:read_file': {
      const error =
        stringErrorFor(input.path, 'path') ||
        optionalIntegerErrorFor(input.startLine, 'startLine') ||
        optionalIntegerErrorFor(input.endLine, 'endLine');
      if (error) return error;

      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          file_path: input.path,
          start_line: input.startLine,
          end_line: input.endLine,
        },
      };
    }

    case 'dev:list_files': {
      const error =
        stringErrorFor(input.path, 'path') || optionalBooleanErrorFor(input.recursive, 'recursive');
      if (error) return error;

      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          dir_path: input.path,
          recursive: input.recursive,
        },
      };
    }

    case 'dev:search_code': {
      const error =
        stringErrorFor(input.query, 'query') ||
        optionalStringErrorFor(input.path, 'path') ||
        optionalStringErrorFor(input.filePattern, 'filePattern') ||
        optionalBooleanErrorFor(input.caseInsensitive, 'caseInsensitive');
      if (error) return error;

      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          pattern: input.query,
          directory: input.path,
          file_pattern: input.filePattern,
          case_insensitive: input.caseInsensitive,
        },
      };
    }

    case 'dev:run_safe_command': {
      const error =
        stringErrorFor(input.command, 'command') ||
        optionalStringErrorFor(input.workingDirectory, 'workingDirectory') ||
        optionalStringErrorFor(input.reason, 'reason');
      if (error) return error;

      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          command: input.command,
          working_directory: input.workingDirectory,
          reason: input.reason || 'Requested through Braid developer-tools provider',
        },
      };
    }

    case 'dev:apply_patch': {
      const error =
        stringErrorFor(input.patch, 'patch') ||
        optionalStringErrorFor(input.targetDir, 'targetDir') ||
        optionalStringErrorFor(input.description, 'description');
      if (error) return error;

      return {
        toolName: DEVELOPER_CAPABILITY_TO_TOOL[capability],
        toolArgs: {
          patch: input.patch,
          target_dir: input.targetDir,
          description: input.description || 'Patch proposed through Braid developer-tools provider',
        },
      };
    }

    case 'dev:read_logs': {
      const error =
        stringErrorFor(input.target, 'target') ||
        optionalIntegerErrorFor(input.tail, 'tail') ||
        optionalStringErrorFor(input.filter, 'filter') ||
        optionalBooleanErrorFor(input.analyzePatterns, 'analyzePatterns') ||
        optionalIntegerErrorFor(input.sinceMinutes, 'sinceMinutes');
      if (error) return error;

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
    }

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

    if (mapped.error) {
      return mapped;
    }

    return executor(mapped.toolName, mapped.toolArgs, userId);
  };
}

export const executeDeveloperCapability = createDeveloperCapabilityExecutor();
