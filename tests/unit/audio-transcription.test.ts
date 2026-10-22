import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMetaAudio, transcribeAudio } from "@/lib/audio-transcription";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadMetaAudio", () => {
  it("downloads only audio from an approved Meta media host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/test",
          mime_type: "audio/ogg; codecs=opus",
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-length": "3" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadMetaAudio("123456", "meta-token");

    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(result.mime).toBe("audio/ogg; codecs=opus");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      redirect: "error",
      headers: { Authorization: "Bearer meta-token" },
    });
  });

  it("rejects media URLs outside the Meta CDN allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ url: "https://example.com/audio.ogg", mime_type: "audio/ogg" })
      )
    );

    await expect(downloadMetaAudio("123456", "meta-token")).rejects.toThrow(
      "غير موثوق"
    );
  });

  it("rejects malformed media IDs before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadMetaAudio("https://example.com", "meta-token")).rejects.toThrow(
      "غير صالح"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("transcribeAudio", () => {
  it("sends Arabic audio to Whisper using the workspace API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ text: "مرحباً، أحتاج إلى مساعدة" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const transcript = await transcribeAudio(Buffer.from([1, 2]), "audio/ogg", {
      apiKey: "openai-test-key",
      provider: "openai",
      model: "whisper-1",
    });

    expect(transcript).toBe("مرحباً، أحتاج إلى مساعدة");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(options.headers).toEqual({
      Authorization: "Bearer openai-test-key",
    });
    expect(options.body.get("model")).toBe("whisper-1");
    expect(options.body.get("language")).toBe("ar");
    expect(options.body.get("file").name).toBe("voice.ogg");
  });

  it("uses Gemini inline audio transcription when Gemini is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ text: "السلام عليكم" }] } }],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const transcript = await transcribeAudio(Buffer.from("audio"), "audio/ogg", {
      apiKey: "gemini-test-key",
      provider: "gemini",
      model: "gemini-3.8-flash",
    });

    expect(transcript).toBe("السلام عليكم");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/models/gemini-3.8-flash:generateContent");
    expect(options.headers["x-goog-api-key"]).toBe("gemini-test-key");
    expect(JSON.parse(options.body).contents[0].parts[1]).toMatchObject({
      inlineData: {
        mimeType: "audio/ogg",
        data: Buffer.from("audio").toString("base64"),
      },
    });
  });

  it("rejects unsupported audio MIME types", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudio(Buffer.from([1]), "application/octet-stream", {
        apiKey: "openai-test-key",
        provider: "openai",
        model: "whisper-1",
      })
    ).rejects.toThrow("غير مدعومة");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
