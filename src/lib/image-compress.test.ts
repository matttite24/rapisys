import { expect, it } from "vitest";
import { fitWithin } from "./image-compress";

it("achica por el lado mayor sin agrandar", () => {
  expect(fitWithin(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
  expect(fitWithin(3000, 4000, 1920)).toEqual({ width: 1440, height: 1920 });
  expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 });
});
