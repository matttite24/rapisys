import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageCount, pageRange, readPage } from "./pagination";

describe("paginación", () => {
  it("lee la página y descarta valores raros", () => {
    expect(readPage({ page: "3" })).toBe(3);
    expect(readPage({})).toBe(1);
    expect(readPage({ page: "0" })).toBe(1);
    expect(readPage({ page: "-2" })).toBe(1);
    expect(readPage({ page: "abc" })).toBe(1);
    expect(readPage({ page: ["2", "9"] })).toBe(2);
  });

  it("calcula rangos y cantidad de páginas", () => {
    expect(pageRange(1)).toEqual([0, PAGE_SIZE - 1]);
    expect(pageRange(2)).toEqual([PAGE_SIZE, 2 * PAGE_SIZE - 1]);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });
});
