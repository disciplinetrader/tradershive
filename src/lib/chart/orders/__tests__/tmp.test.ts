import { describe, expect, it } from "vitest";
import { DrawingStore } from "@/lib/chart/drawings/store";
describe("x", () => { it("add", () => {
  const d = new DrawingStore(); d.hydrate("S");
  const r = d.add({ kind: "long_position", points: [{time:1,price:100},{time:2,price:130},{time:3,price:90}], style:{color:"#fff",width:1,lineStyle:0,fillOpacity:.2,fontSize:11} } as never);
  console.log("ret", r, "list", JSON.stringify(d.list()));
  expect(1).toBe(1);
}); });
