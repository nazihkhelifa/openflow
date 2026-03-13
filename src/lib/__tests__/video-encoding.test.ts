import { describe, it, expect } from "vitest";
import {
  createAvcEncodingConfig,
  AVC_LEVEL_4_0,
  AVC_LEVEL_5_1,
} from "../video-encoding";

describe("video-encoding", () => {
  describe("constants", () => {
    it("AVC_LEVEL_4_0 is correct codec string", () => {
      expect(AVC_LEVEL_4_0).toBe("avc1.640028");
    });

    it("AVC_LEVEL_5_1 is correct codec string", () => {
      expect(AVC_LEVEL_5_1).toBe("avc1.640033");
    });
  });

  describe("createAvcEncodingConfig", () => {
    it("returns config with correct codec", () => {
      const config = createAvcEncodingConfig(8_000_000);
      expect(config.codec).toBe("avc");
    });

    it("sets the provided bitrate", () => {
      const config = createAvcEncodingConfig(5_000_000);
      expect(config.bitrate).toBe(5_000_000);
    });

    it("sets bitrateMode to variable", () => {
      const config = createAvcEncodingConfig(8_000_000);
      expect(config.bitrateMode).toBe("variable");
    });

    it("sets latencyMode to quality", () => {
      const config = createAvcEncodingConfig(8_000_000);
      expect(config.latencyMode).toBe("quality");
    });

    it("sets keyFrameInterval to 1.0", () => {
      const config = createAvcEncodingConfig(8_000_000);
      expect(config.keyFrameInterval).toBe(1.0);
    });

    it("defaults to AVC_LEVEL_4_0 codec string", () => {
      const config = createAvcEncodingConfig(8_000_000);
      expect(config.fullCodecString).toBe(AVC_LEVEL_4_0);
    });

    it("accepts custom codec string", () => {
      const config = createAvcEncodingConfig(8_000_000, undefined, undefined, AVC_LEVEL_5_1);
      expect(config.fullCodecString).toBe(AVC_LEVEL_5_1);
    });

    it("defaults to prefer-hardware acceleration", () => {
      const config = createAvcEncodingConfig(8_000_000);
      expect(config.hardwareAcceleration).toBe("prefer-hardware");
    });

    it("sets prefer-software when hardware acceleration is disabled", () => {
      const config = createAvcEncodingConfig(8_000_000, undefined, undefined, undefined, undefined, false);
      expect(config.hardwareAcceleration).toBe("prefer-software");
    });

    describe("onEncoderConfig callback", () => {
      it("sets avc.format to avc", () => {
        const config = createAvcEncodingConfig(8_000_000);
        const encoderConfig: Record<string, unknown> = {};
        config.onEncoderConfig!(encoderConfig as any);
        expect((encoderConfig.avc as any).format).toBe("avc");
      });

      it("preserves existing avc properties", () => {
        const config = createAvcEncodingConfig(8_000_000);
        const encoderConfig: Record<string, unknown> = {
          avc: { existingProp: "value" },
        };
        config.onEncoderConfig!(encoderConfig as any);
        expect((encoderConfig.avc as any).existingProp).toBe("value");
        expect((encoderConfig.avc as any).format).toBe("avc");
      });

      it("sets framerate from parameter when provided", () => {
        const config = createAvcEncodingConfig(8_000_000, undefined, undefined, undefined, 30);
        const encoderConfig: Record<string, unknown> = {};
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.framerate).toBe(30);
      });

      it("falls back to 60 when no framerate provided and config has none", () => {
        const config = createAvcEncodingConfig(8_000_000);
        const encoderConfig: Record<string, unknown> = {};
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.framerate).toBe(60);
      });

      it("preserves existing config.framerate when no framerate param", () => {
        const config = createAvcEncodingConfig(8_000_000);
        const encoderConfig: Record<string, unknown> = { framerate: 24 };
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.framerate).toBe(24);
      });

      it("sets bitrate on the encoder config", () => {
        const config = createAvcEncodingConfig(5_000_000);
        const encoderConfig: Record<string, unknown> = {};
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.bitrate).toBe(5_000_000);
      });

      it("sets dimensions when provided", () => {
        const config = createAvcEncodingConfig(8_000_000, 1920, 1080);
        const encoderConfig: Record<string, unknown> = {};
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.width).toBe(1920);
        expect(encoderConfig.height).toBe(1080);
      });

      it("does not set dimensions when not provided", () => {
        const config = createAvcEncodingConfig(8_000_000);
        const encoderConfig: Record<string, unknown> = {};
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.width).toBeUndefined();
        expect(encoderConfig.height).toBeUndefined();
      });

      it("sets latencyMode to quality when config has no latencyMode", () => {
        const config = createAvcEncodingConfig(8_000_000);
        const encoderConfig: Record<string, unknown> = {};
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.latencyMode).toBe("quality");
      });

      it("preserves existing latencyMode on encoder config", () => {
        const config = createAvcEncodingConfig(8_000_000);
        const encoderConfig: Record<string, unknown> = { latencyMode: "realtime" };
        config.onEncoderConfig!(encoderConfig as any);
        expect(encoderConfig.latencyMode).toBe("realtime");
      });
    });
  });
});
