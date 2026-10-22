import { expect, test } from "@playwright/test";

test("home page loads and shows the key marketing hero", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("منصة واتساب الذكية لنشاطك التجاري"),
  ).toBeVisible();
});
