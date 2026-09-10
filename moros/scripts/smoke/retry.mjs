import assert from "node:assert/strict";

export async function runRetryScenario({ app, page, shot }) {
  const emit = (events) => app.evaluate(({ BrowserWindow }, events) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    for (const event of events) contents.send("agent:event", event);
  }, events);
  const fail = (id, text = "") => emit([
    { kind: "assistant-start", id, ts: Date.now() },
    {
      kind: "assistant-end", id,
      blocks: text ? [{ type: "text", text }] : [],
      stopReason: "error", errorMessage: "terminated",
    },
  ]);

  await emit([
    { kind: "user-message", id: "smoke-retry-user", text: "Retry display fixture", ts: Date.now() },
    { kind: "agent-start" },
  ]);
  await fail("smoke-retry-partial", "Partial answer remains readable.");
  const partial = page.locator('[data-assistant-message-id="smoke-retry-partial"]');
  await partial.locator(".msg-error").waitFor();
  await emit([{
    kind: "notice", tone: "warn", text: "请求失败，正在自动重试（第 1/3 次）…",
    retryAssistantId: "smoke-retry-partial", ts: Date.now(),
  }]);
  await partial.locator(".msg-error").waitFor({ state: "detached" });
  assert.match(await partial.textContent(), /Partial answer remains readable/);
  await page.getByText("请求失败，正在自动重试（第 1/3 次）…", { exact: true }).waitFor();

  await fail("smoke-retry-empty");
  await emit([{
    kind: "notice", tone: "warn", text: "请求失败，正在自动重试（第 2/3 次）…",
    retryAssistantId: "smoke-retry-empty", ts: Date.now(),
  }]);
  await page.locator('[data-assistant-message-id="smoke-retry-empty"]').waitFor({ state: "detached" });
  await page.getByText("请求失败，正在自动重试（第 2/3 次）…", { exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await page.locator(".msg-error").filter({ hasText: "terminated" }).count(), 0);
  await page.waitForFunction(() => {
    const answer = document.querySelector('[data-assistant-message-id="smoke-retry-partial"]');
    return answer && getComputedStyle(answer).filter === "blur(0px)";
  });
  await shot("20-automatic-retry", page.locator(".main-col"));

  await fail("smoke-retry-final");
  await emit([{ kind: "agent-end" }]);
  const finalError = page.locator('[data-assistant-message-id="smoke-retry-final"] .msg-error');
  await finalError.waitFor();
  assert.match(await finalError.textContent(), /terminated/);
  await finalError.getByRole("button", { name: "Retry", exact: true }).waitFor();
}
