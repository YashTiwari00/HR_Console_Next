import assert from "node:assert/strict";
import {
  buildRatingDropComparisonDataset,
  evaluateRatingDropRisk,
  RATING_DROP_RISK_LEVELS,
} from "../lib/ratingDropComparison.js";

function runCase(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    return { name, pass: true };
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(String(error?.message || error));
    return { name, pass: false };
  }
}

async function main() {
  const results = [];

  results.push(
    runCase("No previous cycle -> no crash", () => {
      const rows = [
        { employeeId: "emp-1", currentRating: 3 },
      ];

      const output = buildRatingDropComparisonDataset(rows);
      assert.deepEqual(output, []);
    })
  );

  results.push(
    runCase("Same rating -> no alert", () => {
      const output = evaluateRatingDropRisk({
        employeeId: "emp-2",
        previousRating: 3,
        currentRating: 3,
      });
      assert.equal(output, null);
    })
  );

  results.push(
    runCase("Drop = 1 -> moderate", () => {
      const output = evaluateRatingDropRisk({
        employeeId: "emp-3",
        previousRating: 4,
        currentRating: 3,
      });

      assert.ok(output);
      assert.equal(output.riskLevel, RATING_DROP_RISK_LEVELS.MODERATE);
      assert.equal(output.drop, 1);
    })
  );

  results.push(
    runCase("Drop > 1 -> high", () => {
      const output = evaluateRatingDropRisk({
        employeeId: "emp-4",
        previousRating: 4,
        currentRating: 2,
      });

      assert.ok(output);
      assert.equal(output.riskLevel, RATING_DROP_RISK_LEVELS.HIGH_RISK);
      assert.equal(output.drop, 2);
    })
  );

  const failed = results.filter((item) => !item.pass).length;
  console.log(`\nRating drop analysis tests: ${results.length - failed}/${results.length} passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Test run failed:", String(error?.message || error));
  process.exit(1);
});
