import { afterEach, expect, it, vi } from "vitest";
import { readCompletion } from "../../../chat/completion.js";
import { chatRequestLimits } from "../../../chat/request.js";
import { POST } from "./route.js";

const canary = "test-openrouter-key-canary";
const echo =
  "[Réponse simulée] Vous avez demandé : De garde. Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15.";
const upstreamError = "Le service de chat est indisponible. Réessayez.";
const history = {
  messages: [{ role: "user", content: "De garde" }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("asks OpenRouter for low-effort reasoning and excludes it from the reply", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  delete process.env["OPENROUTER_MODEL"];
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      model: "google/gemini-3.8-flash",
      choices: [
        {
          finish_reason: "stop",
          message: { content: "Une pharmacie de garde." },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(history);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: "Une pharmacie de garde.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0]?.[1];
  const sent = JSON.parse(String(init?.body));
  expect(sent).toMatchObject({
    model: "google/gemini-3.8-flash",
    max_tokens: 1024,
    reasoning: { effort: "low", exclude: true },
  });
  expect(sent.messages?.[1]).toEqual({ role: "user", content: "De garde" });
});

it("trims a length-capped reply back to the last complete sentence", async () => {
  const cases = [
    {
      content:
        "Une pharmacie est ouverte ce soir. Vous pouvez y aller avec cette souff",
      reply: "Une pharmacie est ouverte ce soir.",
    },
    {
      content: "Appelez le 15 ! Le reste est cou",
      reply: "Appelez le 15 !",
    },
    {
      content: "C'est urgent ? La suite est cou",
      reply: "C'est urgent ?",
    },
    {
      content: "Il a répondu « oui. » mais la suite est cou",
      reply: "Il a répondu « oui. »",
    },
    {
      content:
        "Le rendez-vous est à 14. Appelez demain. Le reste est 2.5 souff",
      reply: "Le rendez-vous est à 14. Appelez demain.",
    },
    {
      content: "  Une pharmacie de garde.  ",
      reply: "Une pharmacie de garde.",
    },
    {
      content: `Début. ${"a".repeat(chatRequestLimits.maxMessageChars)} fin.`,
      reply: "Début.",
    },
  ];
  for (const item of cases) {
    const response = await liveReply({
      finish_reason: "length",
      content: item.content,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: item.reply,
      mocked: false,
      model: "google/gemini-3.8-flash",
    });
  }
});

it("does not treat a line-start list number as a sentence end", async () => {
  const kept = await liveReply({
    finish_reason: "length",
    content: "Première phrase.\n1. Appelle le médecin",
  });
  expect(kept.status).toBe(200);
  expect(await kept.json()).toEqual({
    reply: "Première phrase.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  const throughItem = await liveReply({
    finish_reason: "length",
    content: "Voici les étapes :\n1. Appelle le médecin.\n2. Attends",
  });
  expect(throughItem.status).toBe(200);
  expect(await throughItem.json()).toEqual({
    reply: "Voici les étapes :\n1. Appelle le médecin.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  const onlyMarker = await liveReply({
    finish_reason: "length",
    content: "Voici les étapes :\n1. Appelle…",
  });
  const text = await onlyMarker.text();
  expect(onlyMarker.status).toBe(502);
  expect(text).not.toContain("1.");
  expect(text).not.toContain(canary);
  expect(JSON.parse(text)).toEqual({ error: upstreamError });
});

it("drops a cut-off list item instead of leaving its marker", async () => {
  const kept = Array.from(
    { length: 14 },
    (_, index) => `${index + 1}. Étape ${index + 1}.`,
  );
  const content = ["Voici les étapes.", ...kept, "15. La suite est cou"].join("\n");
  const response = await liveReply({ finish_reason: "length", content });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: ["Voici les étapes.", ...kept].join("\n"),
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("keeps 15 when prose follows a list item", async () => {
  const response = await liveReply({
    finish_reason: "length",
    content: "1. Fait.\nPuis non.\n15. Sinon…",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: "1. Fait.\nPuis non.\n15.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("keeps 3114 when a length cut follows an unfinished list item", async () => {
  const response = await liveReply({
    finish_reason: "length",
    content: "1. Si tu penses au suicide, appelle le\n3114. Puis parle…",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: "1. Si tu penses au suicide, appelle le\n3114.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("keeps a bare 3114 after a finished list item", async () => {
  const response = await liveReply({
    finish_reason: "length",
    content: "1. Parlez-en à un proche.\n3114. Ils écoutent",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: "1. Parlez-en à un proche.\n3114.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("keeps an emergency number on a length-capped reply", async () => {
  const cases = [
    { content: "Appelle le\n15.", reply: "Appelle le\n15." },
    { content: "3114.", reply: "3114." },
    { content: "15. Sinon…", reply: "15." },
    { content: "3114. Sinon…", reply: "3114." },
    { content: "C'est urgent.\n15. Sinon…", reply: "C'est urgent.\n15." },
  ];
  for (const item of cases) {
    const response = await liveReply({
      finish_reason: "length",
      content: item.content,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: item.reply,
      mocked: false,
      model: "google/gemini-3.8-flash",
    });
  }
});

it("accepts any non-newline whitespace after a list marker", async () => {
  for (const gap of ["\u00a0", "\u2003", "\v", "\f", "\u202f"]) {
    const response = await liveReply({
      finish_reason: "length",
      content: `Appelez demain.\n1.${gap}Ensuite`,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: "Appelez demain.",
      mocked: false,
      model: "google/gemini-3.8-flash",
    });
  }

  const continued = await liveReply({
    finish_reason: "length",
    content: "1. Fait.\n2.\u00a0La suite est cou",
  });
  expect(continued.status).toBe(200);
  expect(await continued.json()).toEqual({
    reply: "1. Fait.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("treats an indented number and dot as a sentence end", async () => {
  const cases = [
    {
      content: "Appelez demain.\n  10. Ensuite",
      reply: "Appelez demain.\n  10.",
    },
    {
      content: "Appelez demain.\n 1. Ensuite",
      reply: "Appelez demain.\n 1.",
    },
    {
      content: "Appelez demain.\n\t1. Ensuite",
      reply: "Appelez demain.\n\t1.",
    },
    {
      content: "Note.\n  1. Fait.\n2. La suite est cou",
      reply: "Note.\n  1. Fait.\n2.",
    },
  ];
  for (const item of cases) {
    const response = await liveReply({
      finish_reason: "length",
      content: item.content,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: item.reply,
      mocked: false,
      model: "google/gemini-3.8-flash",
    });
  }
});

it("follows a list across a blank line", async () => {
  const cases = [
    {
      content: "1. Fait.\n\n2. La suite est cou",
      reply: "1. Fait.",
    },
    {
      content: "1. Fait.\r\n2. La suite est cou",
      reply: "1. Fait.",
    },
    {
      content: "1. Fait.\r2. La suite est cou",
      reply: "1. Fait.",
    },
  ];
  for (const item of cases) {
    const response = await liveReply({
      finish_reason: "length",
      content: item.content,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: item.reply,
      mocked: false,
      model: "google/gemini-3.8-flash",
    });
  }
});

it("keeps a bare number at the end of a line", async () => {
  const cases = [
    { content: "Appelle le\n112.", reply: "Appelle le\n112." },
    { content: "Note.\n2.", reply: "Note.\n2." },
  ];
  for (const item of cases) {
    const response = await liveReply({
      finish_reason: "length",
      content: item.content,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: item.reply,
      mocked: false,
      model: "google/gemini-3.8-flash",
    });
  }
});

it("returns the upstream error when finish_reason is content_filter", async () => {
  const content = "Voici un fragment filtré.";
  const response = await liveReply({
    finish_reason: "content_filter",
    content,
  });
  const text = await response.text();
  expect(response.status).toBe(502);
  expect(text).not.toContain(content);
  expect(text).not.toContain(canary);
  expect(JSON.parse(text)).toEqual({ error: upstreamError });
});

it("returns the upstream error when a length-capped reply has no complete sentence", async () => {
  for (const content of [
    "avec cette souff",
    "Le reste est 2.5 souff",
    `${"a".repeat(chatRequestLimits.maxMessageChars)}.`,
  ]) {
    const response = await liveReply({ finish_reason: "length", content });
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain(content);
    expect(text).not.toContain(canary);
    expect(JSON.parse(text)).toEqual({ error: upstreamError });
  }
});

it("returns the upstream error when finish_reason is error", async () => {
  const content = "Une pharmacie de garde.";
  const response = await liveReply({ finish_reason: "error", content });
  const text = await response.text();
  expect(response.status).toBe(502);
  expect(text).not.toContain(content);
  expect(text).not.toContain(canary);
  expect(JSON.parse(text)).toEqual({ error: upstreamError });
});

it("returns the upstream error when choices is an object", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  delete process.env["OPENROUTER_MODEL"];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        model: "google/gemini-3.8-flash",
        choices: {
          0: {
            finish_reason: "stop",
            message: { content: "secret-fragment" },
          },
        },
      }),
    ),
  );
  const response = await post(history);
  const text = await response.text();
  expect(response.status).toBe(502);
  expect(text).not.toContain("secret-fragment");
  expect(JSON.parse(text)).toEqual({ error: upstreamError });
});

it("returns the upstream error when the OpenRouter JSON omits choices", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  delete process.env["OPENROUTER_MODEL"];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        model: "google/gemini-3.8-flash",
        error: "secret-fragment",
      }),
    ),
  );
  const response = await post(history);
  const text = await response.text();
  expect(response.status).toBe(502);
  expect(text).not.toContain(canary);
  expect(text).not.toContain("secret-fragment");
  expect(JSON.parse(text)).toEqual({ error: upstreamError });
});

it("returns a stop reply unchanged, including a trailing fragment", async () => {
  const content =
    "Une pharmacie est ouverte ce soir. Vous pouvez y aller avec cette souff";
  const response = await liveReply({ finish_reason: "stop", content });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: content,
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("trims a length-capped reply at an intro sentence before a list", async () => {
  const incomplete = await liveReply({
    finish_reason: "length",
    content: "Appelez le médecin.\n1. La suite est cou",
  });
  expect(incomplete.status).toBe(200);
  expect(await incomplete.json()).toEqual({
    reply: "Appelez le médecin.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  const completeItem = await liveReply({
    finish_reason: "length",
    content: "Voici les étapes.\n1. Appelle le médecin.\n2. Attends",
  });
  expect(completeItem.status).toBe(200);
  expect(await completeItem.json()).toEqual({
    reply: "Voici les étapes.\n1. Appelle le médecin.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  const tabMarker = await liveReply({
    finish_reason: "length",
    content: "Appelez demain.\n1.\tEnsuite",
  });
  expect(tabMarker.status).toBe(200);
  expect(await tabMarker.json()).toEqual({
    reply: "Appelez demain.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("treats CRLF like LF when trimming a length-capped reply", async () => {
  const kept = await liveReply({
    finish_reason: "length",
    content: "Appelez demain.\r\n1. Ensuite",
  });
  expect(kept.status).toBe(200);
  expect(await kept.json()).toEqual({
    reply: "Appelez demain.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  const emergency = await liveReply({
    finish_reason: "length",
    content: "Appelle le\r\n15.",
  });
  expect(emergency.status).toBe(200);
  expect(await emergency.json()).toEqual({
    reply: "Appelle le\r\n15.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("returns the assistant text when finish_reason is missing", async () => {
  const content =
    "Une pharmacie est ouverte ce soir. Vous pouvez y aller avec cette souff";
  const response = await liveReply({ content });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: content,
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("returns the upstream error when assistant content is blank", async () => {
  for (const content of ["", "   ", "\n"]) {
    for (const finish_reason of ["stop", "length"]) {
      const response = await liveReply({ finish_reason, content });
      const text = await response.text();
      expect(response.status).toBe(502);
      expect(text).not.toContain(canary);
      expect(JSON.parse(text)).toEqual({ error: upstreamError });
    }
  }
});

it("keeps the mock and does not call fetch when live chat is off", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("STEVE_CHAT_LIVE", "");

  const response = await post(history);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: echo,
    mocked: true,
    model: "mock",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns null when the completion body is not a record", () => {
  const choices = [{ finish_reason: "stop", message: { content: "secret-fragment" } }];
  const samples: unknown[] = [
    null,
    Object.assign([], { choices }),
    Object.assign(() => undefined, { choices }),
    "text",
    1,
    true,
  ];
  for (const payload of samples) {
    expect(readCompletion(payload, "google/gemini-3.8-flash")).toBeNull();
  }
});

it("returns null when the first choice is not a record", () => {
  const message = { content: "secret-fragment" };
  const samples: unknown[] = [
    null,
    Object.assign([], { message }),
    Object.assign(() => undefined, { message }),
    "text",
    1,
    true,
  ];
  for (const first of samples) {
    expect(readCompletion({ choices: [first] }, "google/gemini-3.8-flash")).toBeNull();
  }
});

it("returns null when the choice message is not a record", () => {
  const samples: unknown[] = [
    null,
    Object.assign([], { content: "secret-fragment" }),
    Object.assign(() => undefined, { content: "secret-fragment" }),
    "text",
    1,
    true,
  ];
  for (const message of samples) {
    expect(
      readCompletion({ choices: [{ finish_reason: "stop", message }] }, "google/gemini-3.8-flash"),
    ).toBeNull();
  }
});

it("returns null when assistant content is not a string", () => {
  for (const content of [null, 1, true, ["secret-fragment"], { text: "secret-fragment" }]) {
    expect(
      readCompletion(
        { choices: [{ finish_reason: "stop", message: { content } }] },
        "google/gemini-3.8-flash",
      ),
    ).toBeNull();
  }
});

it("uses the requested model when OpenRouter sends an empty model string", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  delete process.env["OPENROUTER_MODEL"];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        model: "",
        choices: [{ finish_reason: "stop", message: { content: "D'accord." } }],
      }),
    ),
  );
  const response = await post(history);
  const text = await response.text();
  expect(text).not.toContain(canary);
  expect(JSON.parse(text)).toEqual({
    reply: "D'accord.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

function liveReply(choice: {
  readonly finish_reason?: string;
  readonly content: string;
}): Promise<Response> {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  delete process.env["OPENROUTER_MODEL"];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        model: "google/gemini-3.8-flash",
        choices: [
          {
            finish_reason: choice.finish_reason,
            message: { content: choice.content },
          },
        ],
      }),
    ),
  );
  return post(history);
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
