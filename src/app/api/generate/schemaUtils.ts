/**
 * Schema Utilities for Generate API Route
 *
 * Provides input parameter pattern matching, type extraction, and coercion
 * from OpenAPI schemas used by multi-provider generation.
 */

/**
 * Input parameter patterns - maps generic input types to possible schema parameter names
 */
export const INPUT_PATTERNS: Record<string, string[]> = {
  // Text/prompt inputs
  prompt: ["prompt", "text", "caption", "input_text", "description", "query"],
  negativePrompt: ["negative_prompt", "negative", "neg_prompt", "negative_text"],

  // Image inputs
  image: ["image_url", "image_urls", "image", "first_frame", "start_image", "init_image",
          "reference_image", "input_image", "image_input", "source_image", "img", "photo"],

  // Video/media settings
  aspectRatio: ["aspect_ratio", "ratio", "size", "dimensions", "output_size"],
  duration: ["duration", "length", "num_frames", "seconds", "video_length"],
  fps: ["fps", "frame_rate", "framerate", "frames_per_second"],

  // Audio settings
  audio: ["audio_enabled", "with_audio", "enable_audio", "audio", "sound"],

  // Generation settings
  seed: ["seed", "random_seed", "noise_seed"],
  steps: ["steps", "num_steps", "num_inference_steps", "inference_steps"],
  guidance: ["guidance_scale", "guidance", "cfg_scale", "cfg"],

  // Model-specific
  scheduler: ["scheduler", "sampler", "sampler_name"],
  strength: ["strength", "denoise", "denoising_strength"],
};

/**
 * Input mapping result from schema parsing
 */
export interface InputMapping {
  // Maps our generic names to model-specific parameter names
  paramMap: Record<string, string>;
  // Track which generic params expect array types (e.g., "image")
  arrayParams: Set<string>;
  // Track actual schema param names that expect array types (e.g., "image_urls")
  schemaArrayParams: Set<string>;
}

/**
 * Parameter type information extracted from OpenAPI schema
 */
export interface ParameterTypeInfo {
  [paramName: string]: "string" | "integer" | "number" | "boolean" | "array" | "object";
}

/**
 * Extract parameter types from OpenAPI schema
 */
export function getParameterTypesFromSchema(schema: Record<string, unknown> | undefined): ParameterTypeInfo {
  const typeInfo: ParameterTypeInfo = {};

  if (!schema) return typeInfo;

  try {
    const components = schema.components as Record<string, unknown> | undefined;
    const schemas = components?.schemas as Record<string, unknown> | undefined;
    const input = schemas?.Input as Record<string, unknown> | undefined;
    const properties = input?.properties as Record<string, unknown> | undefined;

    if (!properties) return typeInfo;

    for (const [propName, prop] of Object.entries(properties)) {
      const property = prop as Record<string, unknown>;
      const type = property?.type as string | undefined;
      if (type && ["string", "integer", "number", "boolean", "array", "object"].includes(type)) {
        typeInfo[propName] = type as ParameterTypeInfo[string];
      }
    }
  } catch {
    // Schema parsing failed
  }

  return typeInfo;
}

/**
 * Coerce parameter values to their expected types based on schema
 * This handles cases where values were incorrectly stored as strings (e.g., from UI enum selects)
 */
export function coerceParameterTypes(
  parameters: Record<string, unknown> | undefined,
  typeInfo: ParameterTypeInfo
): Record<string, unknown> {
  if (!parameters) return {};

  const result = { ...parameters };

  for (const [key, value] of Object.entries(result)) {
    if (value === undefined || value === null) continue;

    const expectedType = typeInfo[key];
    if (!expectedType) continue;

    // Coerce string values to their expected types
    if (typeof value === "string") {
      if (expectedType === "integer") {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) result[key] = parsed;
      } else if (expectedType === "number") {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) result[key] = parsed;
      } else if (expectedType === "boolean") {
        result[key] = value === "true";
      }
    }
  }

  return result;
}

/**
 * Extract input parameter mappings from OpenAPI schema
 * Returns a mapping of generic parameter names to model-specific names
 */
export function getInputMappingFromSchema(schema: Record<string, unknown> | undefined): InputMapping {
  const paramMap: Record<string, string> = {};
  const arrayParams = new Set<string>();
  const schemaArrayParams = new Set<string>();

  if (!schema) return { paramMap, arrayParams, schemaArrayParams };

  try {
    // Navigate to input schema properties
    const components = schema.components as Record<string, unknown> | undefined;
    const schemas = components?.schemas as Record<string, unknown> | undefined;
    const input = schemas?.Input as Record<string, unknown> | undefined;
    const properties = input?.properties as Record<string, unknown> | undefined;

    if (!properties) return { paramMap, arrayParams, schemaArrayParams };

    // First pass: detect all array-typed properties by their actual schema name
    for (const [propName, prop] of Object.entries(properties)) {
      const property = prop as Record<string, unknown>;
      if (property?.type === "array") {
        schemaArrayParams.add(propName);
      }
    }

    const propertyNames = Object.keys(properties);

    // For each input type pattern, find the matching schema property
    for (const [genericName, patterns] of Object.entries(INPUT_PATTERNS)) {
      for (const pattern of patterns) {
        let matchedParam: string | null = null;

        // Check for exact match first
        if (properties[pattern]) {
          matchedParam = pattern;
        } else {
          // Check for case-insensitive partial match
          const patternLower = pattern.toLowerCase();
          const match = propertyNames.find(name => {
            const nameLower = name.toLowerCase();
            // Property name contains the pattern (intended direction)
            if (nameLower.includes(patternLower)) return true;
            // Pattern contains the property name — only allow for longer patterns
            // to prevent short property names (e.g. "id") matching everything
            if (patternLower.length >= 3 && patternLower.includes(nameLower)) return true;
            return false;
          });
          if (match) {
            matchedParam = match;
          }
        }

        if (matchedParam) {
          paramMap[genericName] = matchedParam;
          // Check if this property expects an array type
          const property = properties[matchedParam] as Record<string, unknown>;
          if (property?.type === "array") {
            arrayParams.add(genericName);
          }
          break;
        }
      }
    }
  } catch {
    // Schema parsing failed
  }

  return { paramMap, arrayParams, schemaArrayParams };
}
