import { expect, it } from "vitest";
import { devOrigins } from "./dev-origins.js";

it("allows the Tailscale IP used by the mobile playground for dev HMR", () => {
  expect(devOrigins).toContain("100.64.107.17");
});
