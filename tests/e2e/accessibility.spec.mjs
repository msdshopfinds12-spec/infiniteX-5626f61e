import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("workspace meets WCAG 2.1 A/AA automated checks in both themes", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["dark", "light"]) {
    if (theme === "light") {
      await page.getByRole("button", { name: "Switch to light mode" }).click();
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      targets: item.nodes.map((node) => node.target),
    })), `Accessibility violations in ${theme} theme`).toEqual([]);
  }
});
