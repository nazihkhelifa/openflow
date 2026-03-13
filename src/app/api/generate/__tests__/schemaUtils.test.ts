import { describe, it, expect } from "vitest";
import {
  INPUT_PATTERNS,
  getParameterTypesFromSchema,
  coerceParameterTypes,
  getInputMappingFromSchema,
} from "../schemaUtils";
import type { ParameterTypeInfo } from "../schemaUtils";

describe("schemaUtils", () => {
  describe("INPUT_PATTERNS", () => {
    it("should contain all expected input categories", () => {
      expect(INPUT_PATTERNS).toHaveProperty("prompt");
      expect(INPUT_PATTERNS).toHaveProperty("negativePrompt");
      expect(INPUT_PATTERNS).toHaveProperty("image");
      expect(INPUT_PATTERNS).toHaveProperty("aspectRatio");
      expect(INPUT_PATTERNS).toHaveProperty("duration");
      expect(INPUT_PATTERNS).toHaveProperty("fps");
      expect(INPUT_PATTERNS).toHaveProperty("audio");
      expect(INPUT_PATTERNS).toHaveProperty("seed");
      expect(INPUT_PATTERNS).toHaveProperty("steps");
      expect(INPUT_PATTERNS).toHaveProperty("guidance");
      expect(INPUT_PATTERNS).toHaveProperty("scheduler");
      expect(INPUT_PATTERNS).toHaveProperty("strength");
    });

    it("should have 'prompt' as first pattern for prompt category", () => {
      expect(INPUT_PATTERNS.prompt[0]).toBe("prompt");
    });

    it("should include common image parameter names", () => {
      expect(INPUT_PATTERNS.image).toContain("image_url");
      expect(INPUT_PATTERNS.image).toContain("image_urls");
      expect(INPUT_PATTERNS.image).toContain("first_frame");
    });
  });

  describe("getParameterTypesFromSchema", () => {
    it("should return empty object for undefined schema", () => {
      expect(getParameterTypesFromSchema(undefined)).toEqual({});
    });

    it("should return empty object for schema without components", () => {
      expect(getParameterTypesFromSchema({})).toEqual({});
    });

    it("should extract types from valid schema", () => {
      const schema = {
        components: {
          schemas: {
            Input: {
              properties: {
                prompt: { type: "string" },
                steps: { type: "integer" },
                guidance_scale: { type: "number" },
                enable_audio: { type: "boolean" },
                images: { type: "array" },
              },
            },
          },
        },
      };

      const result = getParameterTypesFromSchema(schema);
      expect(result).toEqual({
        prompt: "string",
        steps: "integer",
        guidance_scale: "number",
        enable_audio: "boolean",
        images: "array",
      });
    });

    it("should ignore unknown types", () => {
      const schema = {
        components: {
          schemas: {
            Input: {
              properties: {
                prompt: { type: "string" },
                custom: { type: "custom_type" },
              },
            },
          },
        },
      };

      const result = getParameterTypesFromSchema(schema);
      expect(result).toEqual({ prompt: "string" });
    });

    it("should handle schema without properties", () => {
      const schema = {
        components: {
          schemas: {
            Input: {},
          },
        },
      };

      expect(getParameterTypesFromSchema(schema)).toEqual({});
    });
  });

  describe("coerceParameterTypes", () => {
    it("should return empty object for undefined parameters", () => {
      expect(coerceParameterTypes(undefined, {})).toEqual({});
    });

    it("should coerce string to integer", () => {
      const params = { steps: "20" };
      const types: ParameterTypeInfo = { steps: "integer" };
      expect(coerceParameterTypes(params, types)).toEqual({ steps: 20 });
    });

    it("should coerce string to number", () => {
      const params = { guidance_scale: "7.5" };
      const types: ParameterTypeInfo = { guidance_scale: "number" };
      expect(coerceParameterTypes(params, types)).toEqual({ guidance_scale: 7.5 });
    });

    it("should coerce string to boolean", () => {
      const params = { enable_audio: "true" };
      const types: ParameterTypeInfo = { enable_audio: "boolean" };
      expect(coerceParameterTypes(params, types)).toEqual({ enable_audio: true });
    });

    it("should coerce 'false' string to false boolean", () => {
      const params = { enable_audio: "false" };
      const types: ParameterTypeInfo = { enable_audio: "boolean" };
      expect(coerceParameterTypes(params, types)).toEqual({ enable_audio: false });
    });

    it("should not coerce non-string values", () => {
      const params = { steps: 20, guidance: 7.5 };
      const types: ParameterTypeInfo = { steps: "integer", guidance: "number" };
      expect(coerceParameterTypes(params, types)).toEqual({ steps: 20, guidance: 7.5 });
    });

    it("should skip null and undefined values", () => {
      const params = { steps: null, guidance: undefined, prompt: "hello" };
      const types: ParameterTypeInfo = { steps: "integer", guidance: "number", prompt: "string" };
      expect(coerceParameterTypes(params as Record<string, unknown>, types)).toEqual({
        steps: null,
        guidance: undefined,
        prompt: "hello",
      });
    });

    it("should skip params with no type info", () => {
      const params = { unknown_param: "42" };
      const types: ParameterTypeInfo = {};
      expect(coerceParameterTypes(params, types)).toEqual({ unknown_param: "42" });
    });

    it("should not coerce invalid number strings", () => {
      const params = { steps: "abc" };
      const types: ParameterTypeInfo = { steps: "integer" };
      const result = coerceParameterTypes(params, types);
      expect(result.steps).toBe("abc"); // NaN check prevents coercion
    });
  });

  describe("getInputMappingFromSchema", () => {
    it("should return empty mapping for undefined schema", () => {
      const result = getInputMappingFromSchema(undefined);
      expect(result.paramMap).toEqual({});
      expect(result.arrayParams.size).toBe(0);
      expect(result.schemaArrayParams.size).toBe(0);
    });

    it("should map exact matches", () => {
      const schema = {
        components: {
          schemas: {
            Input: {
              properties: {
                prompt: { type: "string" },
                image_url: { type: "string" },
                aspect_ratio: { type: "string" },
              },
            },
          },
        },
      };

      const result = getInputMappingFromSchema(schema);
      expect(result.paramMap.prompt).toBe("prompt");
      expect(result.paramMap.image).toBe("image_url");
      expect(result.paramMap.aspectRatio).toBe("aspect_ratio");
    });

    it("should detect array types", () => {
      const schema = {
        components: {
          schemas: {
            Input: {
              properties: {
                image_urls: { type: "array" },
                prompt: { type: "string" },
              },
            },
          },
        },
      };

      const result = getInputMappingFromSchema(schema);
      expect(result.paramMap.image).toBe("image_urls");
      expect(result.arrayParams.has("image")).toBe(true);
      expect(result.schemaArrayParams.has("image_urls")).toBe(true);
    });

    it("should match case-insensitive partial matches", () => {
      const schema = {
        components: {
          schemas: {
            Input: {
              properties: {
                my_prompt_text: { type: "string" },
              },
            },
          },
        },
      };

      const result = getInputMappingFromSchema(schema);
      // "prompt" pattern should match "my_prompt_text" via partial match
      expect(result.paramMap.prompt).toBe("my_prompt_text");
    });

    it("should prefer exact matches over partial matches", () => {
      const schema = {
        components: {
          schemas: {
            Input: {
              properties: {
                prompt: { type: "string" },
                my_prompt_text: { type: "string" },
              },
            },
          },
        },
      };

      const result = getInputMappingFromSchema(schema);
      expect(result.paramMap.prompt).toBe("prompt");
    });

    it("should handle schema with no Input schema", () => {
      const schema = {
        components: {
          schemas: {
            Output: { properties: {} },
          },
        },
      };

      const result = getInputMappingFromSchema(schema);
      expect(result.paramMap).toEqual({});
    });
  });
});
