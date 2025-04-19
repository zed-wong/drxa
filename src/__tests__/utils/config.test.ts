import { getRpcEndpoints, SUPPORTED_CHAINS } from "../../constants/config.js";
import { describe, it, expect } from "vitest";

describe("RPC Endpoints Configuration", () => {
  SUPPORTED_CHAINS.forEach((chain) => {
    it(`should have valid RPC endpoints for ${chain}`, () => {
      const endpoints = getRpcEndpoints(chain);

      expect(endpoints).toBeDefined();
      expect(endpoints.http).toBeDefined();
      expect(typeof endpoints.http).toBe("string");
      expect(endpoints.http).toMatch(/^https?:\/\//);

      if (endpoints.ws) {
        expect(typeof endpoints.ws).toBe("string");
        expect(endpoints.ws).toMatch(/^wss?:\/\//);
      }

      if (endpoints.explorer) {
        expect(typeof endpoints.explorer).toBe("string");
        expect(endpoints.explorer).toMatch(/^https?:\/\//);
      }

      if (endpoints.explorerApi) {
        expect(typeof endpoints.explorerApi).toBe("string");
        expect(endpoints.explorerApi).toMatch(/^https?:\/\//);
      }
    });
  });
});