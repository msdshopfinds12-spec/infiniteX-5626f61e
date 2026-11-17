import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("workspace has no WCAG 2.1 A/AA automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  const themes = ["dark", "light"];

  for (const theme of themes) {
    if (theme === "light") {
      await page.getByRole("button", { name: "Switch to light mode" }).click();
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        description: violation.description,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
      `Accessibility violations in ${theme} theme`,
    ).toEqual([]);
  }
});
