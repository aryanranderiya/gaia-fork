/**
 * Parser for settings_validator.py and settings.py to extract environment variable requirements.
 * Uses DevelopmentSettings from settings.py to determine which vars are truly required.
 * Uses SettingsGroup from settings_validator.py for descriptions and grouping.
 * @module env-parser
 */

import * as fs from 'fs';
import * as path from 'path';

/** Setup mode for the application - affects default infrastructure URLs */
export type SetupMode = 'selfhost' | 'developer';

/**
 * Represents a single environment variable configuration.
 */
export interface EnvVar {
  /** Environment variable name (e.g., "OPENAI_API_KEY") */
  name: string;
  /** Whether this variable is required for the application to run */
  required: boolean;
  /** Category/group name this variable belongs to */
  category: string;
  /** Description of what this variable is used for */
  description: string;
  /** Features that will be affected if this variable is not set */
  affectedFeatures: string;
  /** Default value for this variable, if any */
  defaultValue?: string;
  /** URL to documentation for obtaining this value */
  docsUrl?: string;
}

/**
 * Represents a category/group of related environment variables.
 */
export interface EnvCategory {
  /** Display name of the category */
  name: string;
  /** Description of what this category enables */
  description: string;
  /** Features affected by this category's variables */
  affectedFeatures: string;
  /** Whether this category is required in production */
  requiredInProd: boolean;
  /** Whether all variables in this category are required (true) or any one is sufficient (false) */
  allRequired: boolean;
  /** URL to documentation for this category */
  docsUrl?: string;
  /** Name of an alternative group that can be used instead (mutually exclusive) */
  alternativeGroup?: string;
  /** Environment variables in this category */
  variables: EnvVar[];
}

/**
 * Variables that are required in DevelopmentSettings (non-Optional fields in CommonSettings)
 * These are parsed from settings.py - fields without Optional[] type annotation
 */
const REQUIRED_IN_DEV: Set<string> = new Set([
  'MONGO_DB',
  'REDIS_URL',
  'POSTGRES_URL',
  'RABBITMQ_URL',
  'WORKOS_API_KEY',
  'WORKOS_CLIENT_ID',
  'WORKOS_COOKIE_PASSWORD',
]);

/**
 * Default values for infrastructure services based on setup mode
 * - selfhost: Services run in Docker with container names as hostnames
 * - developer: Services run locally or in Docker with localhost access
 */
const INFRASTRUCTURE_DEFAULTS: Record<SetupMode, Record<string, string>> = {
  selfhost: {
    // Docker container hostnames (services communicate via Docker network)
    MONGO_DB: 'mongodb://mongo:27017/gaia',
    REDIS_URL: 'redis://redis:6379',
    POSTGRES_URL: 'postgresql://postgres:postgres@postgres:5432/langgraph',
    CHROMADB_HOST: 'chromadb',
    CHROMADB_PORT: '8000',
    RABBITMQ_URL: 'amqp://guest:guest@rabbitmq:5672/',
    HOST: 'http://localhost:8000',
    FRONTEND_URL: 'http://localhost:3000',
    GAIA_BACKEND_URL: 'http://gaia-backend:80',
  },
  developer: {
    // Localhost access (services exposed on host ports)
    MONGO_DB: 'mongodb://localhost:27017/gaia',
    REDIS_URL: 'redis://localhost:6379',
    POSTGRES_URL: 'postgresql://postgres:postgres@localhost:5432/langgraph',
    CHROMADB_HOST: 'localhost',
    CHROMADB_PORT: '8080',
    RABBITMQ_URL: 'amqp://guest:guest@localhost:5672/',
    HOST: 'http://localhost:8000',
    FRONTEND_URL: 'http://localhost:3000',
    GAIA_BACKEND_URL: 'http://host.docker.internal:8000',
  }
};

/**
 * Gets the default value for a variable based on the setup mode.
 * @param varName - The environment variable name
 * @param mode - The setup mode ('selfhost' or 'developer')
 * @returns The default value for the variable, or undefined if no default exists
 */
export function getDefaultValue(varName: string, mode: SetupMode): string | undefined {
  return INFRASTRUCTURE_DEFAULTS[mode][varName];
}

/**
 * Parses settings_validator.py and extracts all SettingsGroup definitions.
 * This is the main entry point for reading environment variable configuration
 * from the Python backend.
 * @param repoPath - Path to the repository root
 * @returns Array of environment categories with their variables
 * @throws Error if settings_validator.py is not found
 */
export function parseSettingsValidator(repoPath: string): EnvCategory[] {
  const validatorPath = path.join(repoPath, 'apps/api/app/config/settings_validator.py');
  
  if (!fs.existsSync(validatorPath)) {
    throw new Error('settings_validator.py not found');
  }

  const content = fs.readFileSync(validatorPath, 'utf-8');
  const categories: EnvCategory[] = [];
  
  // Match SettingsGroup constructor calls
  // Pattern: SettingsGroup(name="...", keys=[...], description="...", affected_features="...", ...)
  const groupRegex = /self\.register_group\(\s*SettingsGroup\(\s*([\s\S]*?)\s*\)\s*\)/g;
  
  let match = groupRegex.exec(content);
  while (match !== null) {
    const groupContent = match[1];
    if (!groupContent) {
      match = groupRegex.exec(content);
      continue;
    }
    
    // Extract fields from the group
    const name = extractStringField(groupContent, 'name');
    const keys = extractListField(groupContent, 'keys');
    const description = extractStringField(groupContent, 'description');
    const affectedFeatures = extractStringField(groupContent, 'affected_features');
    const requiredInProd = extractBoolField(groupContent, 'required_in_prod', true);
    const allRequired = extractBoolField(groupContent, 'all_required', true);
    const docsUrl = extractStringField(groupContent, 'docs_url') || undefined;
    const alternativeGroup = extractStringField(groupContent, 'alternative_group') || undefined;
    
    if (name && keys.length > 0) {
      const variables: EnvVar[] = keys.map(key => ({
        name: key,
        // Use development settings - only truly required if in REQUIRED_IN_DEV set
        required: REQUIRED_IN_DEV.has(key),
        category: name,
        description: description || `Configuration for ${name}`,
        affectedFeatures: affectedFeatures || '',
        docsUrl,
      }));
      
      categories.push({
        name,
        description: description || '',
        affectedFeatures: affectedFeatures || '',
        requiredInProd,
        allRequired,
        docsUrl,
        alternativeGroup,
        variables,
      });
    }
    
    match = groupRegex.exec(content);
  }
  
  return categories;
}

/**
 * Extracts a string field value from a Python SettingsGroup constructor call.
 * @param content - The raw content of the SettingsGroup constructor
 * @param fieldName - The name of the field to extract (e.g., "name", "description")
 * @returns The extracted string value, or empty string if not found
 * @example
 * // For content like: name="OpenAI Integration"
 * extractStringField(content, 'name') // returns "OpenAI Integration"
 */
function extractStringField(content: string, fieldName: string): string {
  // Match both single and double quotes, and handle multi-line strings
  const regex = new RegExp(`${fieldName}\\s*=\\s*["']([^"']*?)["']`, 's');
  const match = content.match(regex);
  return match?.[1] || '';
}

/**
 * Extracts a list field value from a Python SettingsGroup constructor call.
 * @param content - The raw content of the SettingsGroup constructor
 * @param fieldName - The name of the list field to extract (e.g., "keys")
 * @returns Array of string values from the list, or empty array if not found
 * @example
 * // For content like: keys=["OPENAI_API_KEY", "OPENAI_ORG_ID"]
 * extractListField(content, 'keys') // returns ["OPENAI_API_KEY", "OPENAI_ORG_ID"]
 */
function extractListField(content: string, fieldName: string): string[] {
  const regex = new RegExp(`${fieldName}\\s*=\\s*\\[([^\\]]*?)\\]`, 's');
  const match = content.match(regex);
  if (!match?.[1]) return [];
  
  // Parse the list items (quoted strings)
  const items: string[] = [];
  const itemRegex = /["']([^"']+)["']/g;
  let itemMatch = itemRegex.exec(match[1]);
  while (itemMatch !== null) {
    if (itemMatch[1]) {
      items.push(itemMatch[1]);
    }
    itemMatch = itemRegex.exec(match[1]);
  }
  return items;
}

/**
 * Extracts a boolean field value from a Python SettingsGroup constructor call.
 * @param content - The raw content of the SettingsGroup constructor
 * @param fieldName - The name of the boolean field to extract
 * @param defaultValue - Default value to return if field is not found
 * @returns The extracted boolean value, or defaultValue if not found
 * @example
 * // For content like: required_in_prod=False
 * extractBoolField(content, 'required_in_prod', true) // returns false
 */
function extractBoolField(content: string, fieldName: string, defaultValue: boolean): boolean {
  const regex = new RegExp(`${fieldName}\\s*=\\s*(True|False)`, 'i');
  const match = content.match(regex);
  if (!match?.[1]) return defaultValue;
  return match[1].toLowerCase() === 'true';
}

/**
 * Gets the core required variables that must be set for basic application functionality.
 * These are the minimum variables needed to start the application.
 * @param categories - Array of all environment categories
 * @returns Array of core environment variables (databases, message queues, auth)
 */
export function getCoreVariables(categories: EnvCategory[]): EnvVar[] {
  const coreGroupNames = [
    'MongoDB Connection',
    'Redis Connection',
    'PostgreSQL Connection',
    'RabbitMQ Connection',
    'WorkOS Authentication',
  ];
  
  return categories
    .filter(c => coreGroupNames.includes(c.name))
    .flatMap(c => c.variables);
}

/**
 * Applies setup mode-specific default values to environment variables.
 * Different modes have different infrastructure URLs (e.g., Docker vs localhost).
 * @param categories - Array of environment categories to apply defaults to
 * @param mode - The setup mode ('selfhost' or 'developer')
 * @returns Categories with default values applied based on mode
 */
export function applyModeDefaults(categories: EnvCategory[], mode: SetupMode): EnvCategory[] {
  return categories.map(category => ({
    ...category,
    variables: category.variables.map(variable => {
      const modeDefault = getDefaultValue(variable.name, mode);
      return {
        ...variable,
        defaultValue: modeDefault || variable.defaultValue
      };
    })
  }));
}

/**
 * Gets the list of infrastructure variable names that have mode-specific defaults.
 * @returns Array of variable names (e.g., MONGO_DB, REDIS_URL, etc.)
 */
export function getInfrastructureVariables(): string[] {
  return Object.keys(INFRASTRUCTURE_DEFAULTS.selfhost);
}

/**
 * Gets categories that are alternatives to each other (mutually exclusive).
 * Groups with `alternativeGroup` set form pairs where only one needs to be configured.
 * @param categories - Array of all environment categories
 * @returns Map of category name to its alternative category name
 */
export function getAlternativeGroups(categories: EnvCategory[]): Map<string, string> {
  const alternatives = new Map<string, string>();
  for (const category of categories) {
    if (category.alternativeGroup) {
      alternatives.set(category.name, category.alternativeGroup);
    }
  }
  return alternatives;
}

/**
 * Checks if a category has been satisfied (either directly or via alternative).
 * @param categoryName - Name of the category to check
 * @param configuredCategories - Set of category names that have been configured
 * @param alternatives - Map of alternative relationships between categories
 * @returns True if the category or its alternative has been configured
 */
export function isCategorySatisfied(
  categoryName: string,
  configuredCategories: Set<string>,
  alternatives: Map<string, string>
): boolean {
  if (configuredCategories.has(categoryName)) {
    return true;
  }
  const alternative = alternatives.get(categoryName);
  return alternative ? configuredCategories.has(alternative) : false;
}

/** @deprecated Use parseSettingsValidator instead */
export const parseSettings = parseSettingsValidator;
