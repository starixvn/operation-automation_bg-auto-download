const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { processCsvFile } = require("../process_csv.js");
const sportsConfig = require("../sports-config.js");
const { correctOtherSportsFiles } = require("../soccer_feed.js");
const config = require("../config.js");
const {
  deleteAllXlsxAndCsv,
  deleteXlsxAndCsvBySport,
} = require("../cleanup-files.js");
const {
  mergeRugbyFiles,
  mergeFootballAndFutsalFiles,
} = require("../convert_to_xlsx.js");
const { processSoccerFeed, splitFileByDate } = require("../soccer_feed.js");
/**
 * Generic function to test any sport
 */
async function testLogin(page) {
  const loginStatusLocator = page.locator("#Body_HeadLoginStatus");
  if (await loginStatusLocator.isVisible()) {
    console.log("Already logged in, skipping login step.");
    return;
  }

  console.log("Filling login credentials...");
  // Fill username
  await page.fill(
    'input[name="ctl00$MainContent$txtUsername"], input[type="text"]',
    "livesupport@enpine.com"
  );

  // Fill password (decoded from base64)
  const passwordBase64 = "IVFBWjJ3c3g=";
  const password = Buffer.from(passwordBase64, "base64").toString("utf-8");
  await page.fill(
    'input[name="ctl00$MainContent$txtPassword"], input[type="password"]',
    password
  );

  // Click login button
  console.log("Clicking login button...");
  await page.click(
    'input[type="submit"], input[value*="Login"], button[type="submit"]'
  );

  // Wait for navigation after login
  await page.waitForLoadState("networkidle");

  console.log(`Login successful...`);
}
async function testSport(page, sportKey) {
  const sport = sportsConfig[sportKey];
  console.log(`\n========================================`);
  console.log(`Testing ${sport.name}`);
  console.log(`========================================\n`);

  test.setTimeout(120000); // Set timeout to 2 minutes

  await deleteXlsxAndCsvBySport(sport.fileCode);

  try {
    console.log("Navigating to Betgenius login page...");
    await page.goto(
      "https://dataservices.betgenius.com/DataServices.WebClient/Login.aspx"
    );

    // Wait for the page to load
    await page.waitForLoadState("networkidle");
    await testLogin(page);
    // Wait a bit for dynamic content to load
    await page.waitForTimeout(2000);

    // Look for the sport section
    let sportElement = null;

    // Try using page.locator with timeout for better stability
    try {
      // Try primary section name with exact text match
      sportElement = page.locator(`a:text-is("${sport.sectionName}")`);
      await sportElement.waitFor({ state: "visible", timeout: 10000 });
      console.log(`Found ${sport.sectionName} section`);
    } catch (error) {
      console.log(
        `${sport.sectionName} not found with exact match, trying alternative...`
      );
      const html_content = await page.content();
      const htmlPath = path.join(
        config.downloadDir,
        `${sportKey}_page_content.html`
      );
      fs.writeFileSync(htmlPath, html_content);

      // Try alternative name if exists
      if (sport.alternativeName) {
        try {
          sportElement = page.locator(`a:text-is("${sport.alternativeName}")`);
          await sportElement.waitFor({ state: "visible", timeout: 10000 });
          console.log(`Found ${sport.alternativeName} section`);
        } catch (altError) {
          console.log(`${sport.alternativeName} also not found`);
          sportElement = null;
        }
      } else {
        sportElement = null;
      }
    }

    if (sportElement) {
      console.log(`Found ${sport.name} section, clicking...`);
      try {
        await sportElement.click();
        await page.waitForLoadState("networkidle");
        console.log(`Successfully navigated to ${sport.name} section`);
      } catch (clickError) {
        console.log(
          `Failed to click ${sport.name} section, trying alternative approach...`
        );
        await sportElement.click({ force: true });
        await page.waitForLoadState("networkidle");
      }
    } else {
      console.log(`❌ ${sport.name} section not found`);

      // Take screenshot before the page closes
      try {
        await page.screenshot({ path: `${sportKey}_not_found.png` });
      } catch (screenshotError) {
        console.log("Could not take screenshot:", screenshotError.message);
      }

      throw new Error(
        `Cannot find ${sport.name} section, please check if the website structure has changed`
      );
    }

    // Get current day and determine download range
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

    console.log(`Today is day ${dayOfWeek} of the week`);

    // Determine download range based on sport and day
    let downloadDays = [];
    let description = "";

    downloadDays = [-1, 0, 1, 2, 3, 4, 5, 6];
    description = "Yesterday to +7 days (1 week)";

    console.log(`Download range: ${description}`);

    // Click filter toggle to open date filter
    console.log("Opening date filter...");
    await page.waitForTimeout(2000);
    try {
      const filterToggle = await page
        .locator(".filter-toggle-arrow-container")
        .first();
      await filterToggle.waitFor({ state: "visible", timeout: 5000 });
      await filterToggle.click();
      console.log("Date filter opened successfully");
      await page.waitForTimeout(1500);
    } catch (filterError) {
      console.log(
        "Filter toggle not found or not clickable:",
        filterError.message
      );
    }

    // Adjust date filter timeline
    console.log("Adjusting date filter timeline...");
    try {
      const timelineFilter = await page
        .locator(".filter-section.timeline-status-filter")
        .first();
      await timelineFilter.waitFor({ state: "visible", timeout: 5000 });
      console.log("Timeline filter found");

      const dayAbbreviations = [
        "Sun",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
      ];

      let endDay;
      const endDayIndex = (dayOfWeek + 7) % 7;
      endDay = dayAbbreviations[endDayIndex];

      console.log(`Setting timeline range: ${description}`);

      // Adjust slider handles
      const sliderHandles = await timelineFilter
        .locator(".ui-slider-handle")
        .all();
      if (sliderHandles.length >= 2) {
        console.log(`Found ${sliderHandles.length} slider handles`);

        // Adjust left handle to Today
        try {
          const todayLabel = await timelineFilter.locator("text=Today").first();
          const todayBox = await todayLabel.boundingBox();

          if (todayBox) {
            const leftHandle = sliderHandles[0];
            const handleBox = await leftHandle.boundingBox();

            if (handleBox) {
              const todayStartX = todayBox.x;
              const handleY = handleBox.y + handleBox.height / 2;

              await leftHandle.hover();
              await page.mouse.down();
              await page.mouse.move(todayStartX, handleY, { steps: 10 });
              await page.mouse.up();
              console.log("Left handle set to Today start");
            }
          }
        } catch (dragError) {
          console.log("Could not adjust left handle:", dragError.message);
        }

        await page.waitForTimeout(500);

        // Adjust right handle
        try {
          const todayBox = await timelineFilter
            .locator("text=Today")
            .first()
            .boundingBox();
          const targetDayElements = await timelineFilter
            .locator(`text=${endDay}`)
            .all();
          let targetLabel = null;

          for (const element of targetDayElements) {
            const elementBox = await element.boundingBox();
            if (elementBox && todayBox && elementBox.x > todayBox.x) {
              targetLabel = element;
              break;
            }
          }

          if (targetLabel) {
            const targetBox = await targetLabel.boundingBox();
            const rightHandle = sliderHandles[1];
            const handleBox = await rightHandle.boundingBox();

            if (targetBox && handleBox) {
              const targetEndX = targetBox.x + targetBox.width;
              const handleY = handleBox.y + handleBox.height / 2;

              await rightHandle.hover();
              await page.mouse.down();
              await page.mouse.move(targetEndX, handleY, { steps: 10 });
              await page.mouse.up();
            }
          }
        } catch (dragError) {
          console.log("Could not adjust right handle:", dragError.message);
        }

        await page.waitForTimeout(500);
        console.log(`Timeline adjusted to: ${description}`);
      }
    } catch (timelineError) {
      console.log("Could not adjust timeline filter:", timelineError.message);
    }

    // Prepare download path and filename
    const targetDir = config.downloadDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`Created directory: ${targetDir}`);
    }

    // Format date as DD-MM-YYYY
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    const targetFileName = `BG-${dateStr}${sport.fileCode}.csv`;
    const targetPath = path.join(targetDir, targetFileName);

    console.log(`Target file: ${targetPath}`);

    // Check if there are no events (multiple possible messages)
    try {
      const noEventsMessages = [
        "No events were found with your current filter settings",
        "No events found",
        "No data available",
      ];

      for (const msg of noEventsMessages) {
        const noEventsMessage = page.locator(`text=/${msg}/i`);
        const hasNoEvents = await noEventsMessage.isVisible({ timeout: 1000 });

        if (hasNoEvents) {
          console.log(
            `ℹ No events found for ${sport.name} in the selected date range`
          );
          console.log(
            `✓ ${sport.name} automation completed (no data to download)`
          );
          return; // Exit successfully without downloading
        }
      }

      // No "no events" message found, continue with download
      console.log("Events found, proceeding with download...");
    } catch (checkError) {
      // Error during check, continue with download attempt
      console.log("Proceeding with download...");
    }

    // Delete existing file if it exists
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      console.log(`Deleted existing file: ${targetPath}`);
    }

    // Click CSV export button and handle download
    console.log("Looking for CSV export button...");
    let csvExportButton = null;
    try {
      csvExportButton = await page.locator(".csv-export-button").first();
      await csvExportButton.waitFor({ state: "visible", timeout: 10000 });
    } catch (err) {
      console.log("CSV export button not found:", err.message);
      return;
    }

    try {
      console.log("CSV export button found, clicking...");

      // Start waiting for download before clicking
      const downloadPromise = page.waitForEvent("download");
      await csvExportButton.click();
      console.log("Download initiated...");

      // Wait for the download to complete
      const download = await downloadPromise;
      console.log("Download started, saving file...");

      // Save the downloaded file to the target path
      await download.saveAs(targetPath);
      console.log(`File saved successfully to: ${targetPath}`);

      // Process CSV with Node.js
      try {
        console.log("Processing CSV file...");
        await processCsvFile(
          targetPath,
          sport.csvValue,
          sport.requiresFutsalSuffix || false
        );
        console.log("✓ CSV processing completed successfully!");
      } catch (csvError) {
        console.error("⚠ CSV processing failed:", csvError.message);
        console.log(
          "Note: You can manually process the CSV by running: node process_csv.js"
        );
      }
    } catch (exportError) {
      console.log("CSV export or download failed:", exportError.message);

      // Check again if it's because there are no events
      try {
        const noEventsMessages = [
          "No events were found with your current filter settings",
          "No events found",
          "No data available",
          "No results",
        ];

        for (const msg of noEventsMessages) {
          const noEventsMessage = page.locator(`text=/${msg}/i`);
          const hasNoEvents = await noEventsMessage.isVisible({
            timeout: 1000,
          });

          if (hasNoEvents) {
            console.log(
              `ℹ No events found for ${sport.name} (detected after export failure)`
            );
            console.log(
              `✓ ${sport.name} automation completed (no data to download)`
            );
            return; // Exit successfully
          }
        }
      } catch (checkError) {
        // Not a "no events" case, it's a real error
      }

      // Real error, take screenshot and throw
      try {
        if (!page.isClosed()) {
          await page.screenshot({ path: `${sportKey}_export_error.png` });
        }
      } catch (screenshotError) {
        console.log("Could not take screenshot:", screenshotError.message);
      }

      throw new Error(`Cannot download CSV file for ${sport.name}`);
    }

    console.log(`${sport.name} automation completed successfully!`);

    // Verify we are on the correct page
    await expect(page).toHaveURL(/betgenius/);
  } catch (error) {
    console.error(`Error during ${sport.name} automation:`, error);

    // Try to take screenshot, but don't fail if page is already closed
    try {
      if (!page.isClosed()) {
        await page.screenshot({ path: `${sportKey}_error_screenshot.png` });
      }
    } catch (screenshotError) {
      console.log("Could not take error screenshot:", screenshotError.message);
    }

    throw error;
  }
}

async function mergeSoccerSports() {
  await deleteXlsxAndCsvBySport("sc");
  const mergedSoccerPath = mergeFootballAndFutsalFiles();
  processSoccerFeed(mergedSoccerPath);
  console.log(
    `\n✅ Football and Futsal files merged successfully: ${path.basename(
      mergedSoccerPath
    )}`
  );
  splitFileByDate(mergedSoccerPath);
  console.log(`\n✅ Football and Futsal Split by date successfully`);
}
async function mergeRugbySports() {
  await deleteXlsxAndCsvBySport("rugby");
  const mergedPath = mergeRugbyFiles();
  console.log(
    `\n✅ Rugby files merged successfully: ${path.basename(mergedPath)}`
  );
}

function getFormattedDate(date) {
  const pad = (num) => num.toString().padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());

  return `${year}-${month}-${day}`;
}

async function overrideEventRequest(page) {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const startDate = `${getFormattedDate(yesterday)}T23:55:07`;
  const futureDate = new Date();
  futureDate.setUTCDate(futureDate.getUTCDate() + 16);
  const endDate = `${getFormattedDate(futureDate)}T23:59:59`; // YYYY-MM-DDT23:59:59

  const apiUrlPattern =
    /^(https:\/\/dataservices\.betgenius\.com\/DataServices\.EventViewer\.WebService\/events\/)(.*\/.*)(\?.*)$/i;
  await page.route(apiUrlPattern, (route) => {
    const originalUrl = route.request().url();

    // Check if the URL matches the expected pattern
    const match = originalUrl.match(apiUrlPattern);
    if (!match) {
      // If it doesn't match, continue with the original request (safe fallback)
      route.continue();
      return;
    }

    const baseUrl = match[1];
    const queryParams = match[3];

    const newUrl = `${baseUrl}${startDate}/${endDate}${queryParams}`;

    console.log(`[ROUTE] Override URL: ${originalUrl}`);
    console.log(`[ROUTE] New URL: ${newUrl}`);

    // Override URL and continue request
    route.continue({ url: newUrl });
  });
}

function subscribeToResponse(page) {
  page.on("response", responseHandler);
}

function responseHandler(response) {
  const url = response.url();
  if (url.includes("/events/")) {
    const statusCode = response.status();
    console.log(">> Response URL:", url);
    console.log(">> Response Status Code:", statusCode);
    if (statusCode != 200) {
      console.log("FAILED:", statusCode);
    }
  }
}

// Create individual test for each sport
test.describe("Betgenius Automation - All Sports", () => {
  // Configure to run sequentially to ensure email sends only once
  test.describe.configure({ mode: "serial" });
  let hasFailures = false;

  // Clean up all xlsx and csv files before running tests
  test.beforeAll(async () => {
    console.log("\n🧹 Cleaning up all existing xlsx and csv files...");
    await deleteAllXlsxAndCsv();
    console.log("✅ Cleanup completed\n");
  });

  test.beforeEach(async ({ page }) => {
    // Set viewport size
    test.setTimeout(1200_000);
    await overrideEventRequest(page);
    subscribeToResponse(page);

    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("DataServices.EventViewer.WebService/events")) {
        console.log(">> Request URL:", request.url());
      }
    });
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== "passed") {
      hasFailures = true;
      console.log(`❌ Test failed: ${testInfo.title}`);
    }
  });

  test.afterAll(async () => {
    console.log("--- Starting afterAll ---");
    if (hasFailures) {
      console.log(
        "⚠️ Found at least one test fail. **Skip** important code afterAll (clean-up, etc.)."
      );
      return;
    }
    console.log("\nAll sports tests completed.");
    console.log("Merge soccer files...");
    await mergeSoccerSports();
    console.log("Merge rugby files...");
    await mergeRugbySports();
    console.log("Correct other sports files...");
    correctOtherSportsFiles([
      "football",
      "os",
      "baseball",
      "bk",
      "cricket",
      "fieldHockey",
      "rugby",
      "waterPolo",
    ]);
  });

  test("Download soccer data", async ({ page }) => {
    await testSport(page, "soccer");
  });

  test("Download futsal data", async ({ page }) => {
    await testSport(page, "futsal");
  });

  test("Download rugbyLeague data", async ({ page }) => {
    await testSport(page, "rugbyLeague");
  });
  test("Download rugbyUnion data", async ({ page }) => {
    await testSport(page, "rugbyUnion");
  });
  test("Download americanFootball data", async ({ page }) => {
    await testSport(page, "americanFootball");
  });

  test("Download aussieRules data", async ({ page }) => {
    await testSport(page, "aussieRules");
  });
  test("Download baseball data", async ({ page }) => {
    await testSport(page, "baseball");
  });

  test("Download basketball data", async ({ page }) => {
    await testSport(page, "basketball");
  });
  test("Download cricket data", async ({ page }) => {
    await testSport(page, "cricket");
  });
  test("Download hockey data", async ({ page }) => {
    await testSport(page, "hockey");
  });
  test("Download waterPolo data", async ({ page }) => {
    await testSport(page, "waterPolo");
  });
});
