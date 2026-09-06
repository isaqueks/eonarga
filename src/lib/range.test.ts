import { describe, expect, it } from "vitest";

import { rangeResponse } from "./range";

/** Um "arquivo" de `size` bytes, em que o byte i vale i % 256. */
function source(size: number, calls: [number, number][] = []) {
  return {
    size,
    mime: "audio/wav",
    open: (start: number, end: number) => {
      calls.push([start, end]);
      const bytes = new Uint8Array(end - start + 1);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (start + i) % 256;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  };
}

function request(range?: string) {
  return new Request("http://x/api/audios/a.wav", range ? { headers: { range } } : undefined);
}

describe("rangeResponse", () => {
  it("sem Range manda o arquivo inteiro com 200 e os cabeçalhos de mídia", async () => {
    const calls: [number, number][] = [];
    const res = rangeResponse(request(), source(10, calls));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("10");
    expect(res.headers.get("content-range")).toBeNull();
    expect(calls).toEqual([[0, 9]]);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    );
  });

  it("bytes=a-b devolve 206 com o trecho, limitado ao fim do arquivo", async () => {
    const res = rangeResponse(request("bytes=2-4"), source(10));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(res.headers.get("content-length")).toBe("3");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([2, 3, 4]));

    const tail = rangeResponse(request("bytes=8-99"), source(10));
    expect(tail.headers.get("content-range")).toBe("bytes 8-9/10");
  });

  it("bytes=a- manda um pedaço de até 4 MB; bytes=-n manda os últimos n", () => {
    const big = rangeResponse(request("bytes=5-"), source(10 * 1024 * 1024));
    expect(big.status).toBe(206);
    expect(big.headers.get("content-range")).toBe(`bytes 5-${5 + 4 * 1024 * 1024 - 1}/10485760`);

    const suffix = rangeResponse(request("bytes=-3"), source(10));
    expect(suffix.headers.get("content-range")).toBe("bytes 7-9/10");
  });

  it("pedido fora do arquivo é 416; 'bytes=-' é 400", () => {
    const off = rangeResponse(request("bytes=10-"), source(10));
    expect(off.status).toBe(416);
    expect(off.headers.get("content-range")).toBe("bytes */10");
    expect(rangeResponse(request("bytes=7-3"), source(10)).status).toBe(416);
    expect(rangeResponse(request("bytes=-"), source(10)).status).toBe(400);
  });
});
