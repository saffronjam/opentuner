import { test, expect } from "@playwright/test";
test("custom tuning persists, string selection and auto work", async ({ page }) => {
  await page.goto("/");
  const showSettings = async () =>
    page.getByRole("button", { name: "Settings", exact: true }).click();
  await showSettings();
  await page.getByRole("button", { name: "Tuning · Standard" }).click();
  await page.getByRole("button", { name: "+ Custom tuning" }).click();
  await page.getByLabel("Name", { exact: true }).fill("My tuning");
  await page.getByRole("button", { name: "Save tuning" }).click();
  await page.reload();
  await showSettings();
  await expect(page.getByRole("button", { name: "Tuning · My tuning" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "String 5, A2" }).click();
  await expect(page.getByRole("switch")).not.toBeChecked();
  await page.getByRole("switch").check();
  await showSettings();
  await page.getByRole("button", { name: "Edit My tuning" }).click();
  await page.getByRole("button", { name: "Delete tuning" }).click();
  await expect(page.getByRole("button", { name: "Tuning · Standard" })).toBeVisible();
});
test("offline reload preserves app and shows all strings", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("switch")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: /String [1-6],/ })).toHaveCount(6);
  await expect(page.getByRole("switch")).toBeVisible();
});
test("light and dark layouts fit phone and desktop", async ({ page }) => {
  await page.goto("/");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [width, height] of [
      [360, 844],
      [390, 640],
      [390, 844],
      [1280, 844],
    ]) {
      await page.setViewportSize({ width, height });
      if (width >= 800)
        expect((await page.locator("#app").boundingBox())!.width).toBeGreaterThan(width * 0.9);
      await expect(page.getByRole("button", { name: "String 6, E2" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `test-results/${colorScheme}-${width}.png` });
    }
  }
});
test("microphone failure offers retry without breaking selection", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("/");

  await expect(page.getByText(/Microphone blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable microphone" })).toBeEnabled();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.locator("#sheet").getByRole("button", { name: "Enable microphone" }),
  ).toBeEnabled();
});
test("real audio pipeline detects A2 and stops capture", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = new AudioContext();
      await c.resume();
      const o = c.createOscillator();
      o.frequency.value = 110;
      const gain = c.createGain();
      gain.gain.value = 0.3;
      window.__muteTestTone = () => {
        gain.gain.value = 0;
      };
      const dest = c.createMediaStreamDestination();
      o.connect(gain).connect(dest);
      o.start();
      dest.stream.getTracks()[0].addEventListener("ended", () => {
        o.stop();
        void c.close();
      });
      return dest.stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText("In-tune sound").uncheck();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await expect(page.locator("#status")).toHaveText("In tune", { timeout: 10000 });
  await expect(page.locator("#note")).toHaveText("A");
  await expect(page.locator(".marker-check")).toHaveCSS("opacity", "1");
  await expect(page.locator(".zero")).toHaveCSS("opacity", "0.95");
  const firstY = async () => {
    const d = await page
      .locator("#trace path")
      .evaluateAll(
        (paths) => paths.map((path) => path.getAttribute("d") || "").find(Boolean) || "",
      );
    return Number(d?.match(/M[-.0-9]+,([-.0-9]+)/)?.[1]);
  };
  await expect.poll(firstY).toBeGreaterThan(0);
  const previousY = await firstY();
  await expect.poll(firstY).toBeGreaterThan(previousY);
  await expect(page.getByRole("button", { name: /Start tuning|Stop tuning/ })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#status")).toHaveText("Ready to tune");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#status")).toHaveText("In tune", { timeout: 10000 });
  await expect(page.locator("#marker-value")).toBeEmpty();
  await page.evaluate(() => window.__muteTestTone());
  await expect(page.locator("#marker-value")).toBeEmpty();
});

test("error notifications never move the tuner", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  const before = await page.locator(".guitar").boundingBox();

  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.locator(".guitar").boundingBox()).toEqual(before);
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByRole("alert")).not.toBeVisible();
});

test("guitar reference samples play offline", async ({ page, context }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.__referenceDuration = this.buffer?.duration;
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.getByRole("button", { name: "String 5, A2" }).click();
  await expect.poll(() => page.evaluate(() => window.__referenceDuration)).toBeGreaterThan(2);
  await expect(page.getByRole("alert")).not.toBeVisible();
});

test("theme choice persists and System follows the device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(33, 26, 22)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(246, 239, 230)");
});

test("completion sample plays once, then re-arms after a second out of tune", async ({ page }) => {
  await page.addInitScript(() => {
    window.__completionPlays = 0;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer && this.buffer.duration > 0.05 && this.buffer.duration < 1.5)
        window.__completionPlays++;
      return original.apply(this, args);
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 110;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      window.__setTone = (frequency) => {
        oscillator.frequency.value = frequency;
      };
      destination.stream.getTracks()[0].addEventListener("ended", () => {
        oscillator.stop();
        void context.close();
      });
      return destination.stream;
    };
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__completionPlays)).toBe(1);
  await page.waitForTimeout(2600);
  expect(await page.evaluate(() => window.__completionPlays)).toBe(1);
  await page.evaluate(() => window.__setTone(118));
  await expect(page.locator("#app")).not.toHaveClass(/in-tune/);
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__setTone(110));
  await expect.poll(() => page.evaluate(() => window.__completionPlays)).toBe(2);
});
