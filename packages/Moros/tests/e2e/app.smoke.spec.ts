import { test, expect, _electron as electron } from "@playwright/test"

test("main window opens without crash", async () => {
  const app = await electron.launch({
    args: ["."],
  })

  const window = await app.firstWindow()
  await window.waitForLoadState("domcontentloaded")

  const title = await window.title()
  expect(title).toMatch(/MoRos|Markov/i)

  await app.close()
})
