const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const config = require("./config.js");

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Convert CSV file to XLSX (Excel) format
 * @param {string} csvFilePath - Path to the CSV file
 * @param {string} xlsxFilePath - Optional output path (defaults to same name with .xlsx extension)
 * @returns {string} Path to the created XLSX file
 */
function convertCsvToXlsx(csvFilePath, xlsxFilePath = null) {
  try {
    // Check if CSV file exists
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found: ${csvFilePath}`);
    }

    // If no output path specified, use same name with .xlsx extension
    if (!xlsxFilePath) {
      const dir = path.dirname(csvFilePath);
      const basename = path.basename(csvFilePath, ".csv");
      xlsxFilePath = path.join(dir, `${basename}.xlsx`);
    }

    console.log(`Converting CSV to XLSX:`);
    console.log(`  Input:  ${csvFilePath}`);
    console.log(`  Output: ${xlsxFilePath}`);

    // Read the CSV file
    const workbook = XLSX.readFile(csvFilePath);

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    formatXlsxDateCells(worksheet);
    setXlsxColumnWidths(worksheet);

    // Create a new workbook
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, worksheet, sheetName);

    // Write XLSX file
    XLSX.writeFile(newWorkbook, xlsxFilePath);

    // Get file sizes
    const csvSize = fs.statSync(csvFilePath).size;
    const xlsxSize = fs.statSync(xlsxFilePath).size;

    console.log(`✓ Conversion successful!`);
    console.log(`  CSV size:  ${(csvSize / 1024).toFixed(2)} KB`);
    console.log(`  XLSX size: ${(xlsxSize / 1024).toFixed(2)} KB`);

    return xlsxFilePath;
  } catch (error) {
    console.error("❌ Error converting CSV to XLSX:", error.message);
    throw error;
  }
}

function formatXlsxDateCells(worksheet) {
  // Format all cells in column E with custom date format: m/d/yyyy h:mm
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  for (let row = range.s.r; row <= range.e.r; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: 4 }); // Column E (index 4)
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].z = "m/d/yyyy h:mm";
    }
  }
}

function setXlsxColumnWidths(worksheet) {
  if (!worksheet["!cols"]) {
    worksheet["!cols"] = [];
  }
  worksheet["!cols"][0] = { wch: 30 }; // Column A (index 0)
  worksheet["!cols"][1] = { wch: 10 }; // Column B (index 1)
  worksheet["!cols"][2] = { wch: 10 }; // Column C (index 2)
  worksheet["!cols"][3] = { wch: 30 }; // Column D (index 3)
  worksheet["!cols"][4] = { wch: 15 }; // Column E (index 4)
  worksheet["!cols"][5] = { wch: 15 }; // Column F (index 5)
  worksheet["!cols"][6] = { wch: 15 }; // Column G (index 6)
}

/**
 * Convert all CSV files in a directory to XLSX
 * @param {string} directory - Directory path
 * @param {boolean} deleteOriginal - Whether to delete the original CSV files
 * @returns {Array} Array of converted file paths
 */
function convertAllCsvToXlsx(directory, deleteOriginal = false) {
  try {
    console.log(`\nConverting all CSV files in: ${directory}\n`);

    if (!fs.existsSync(directory)) {
      throw new Error(`Directory not found: ${directory}`);
    }

    const files = fs.readdirSync(directory);
    const csvFiles = files.filter((f) => f.toLowerCase().endsWith(".csv"));

    if (csvFiles.length === 0) {
      console.log("No CSV files found in directory.");
      return [];
    }

    console.log(`Found ${csvFiles.length} CSV file(s):\n`);

    const convertedFiles = [];

    for (const csvFile of csvFiles) {
      const csvPath = path.join(directory, csvFile);

      try {
        const xlsxPath = convertCsvToXlsx(csvPath);
        convertedFiles.push(xlsxPath);

        if (deleteOriginal) {
          fs.unlinkSync(csvPath);
          console.log(`  ✓ Deleted original CSV: ${csvFile}`);
        }

        console.log("");
      } catch (error) {
        console.error(`  ✗ Failed to convert ${csvFile}:`, error.message);
      }
    }

    console.log(
      `\n✓ Converted ${convertedFiles.length} of ${csvFiles.length} files`
    );

    return convertedFiles;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

/**
 * Convert the latest CSV file in a directory to XLSX
 * @param {string} directory - Directory path
 * @param {boolean} deleteOriginal - Whether to delete the original CSV file
 * @returns {string|null} Path to converted file or null if no CSV found
 */
function convertLatestCsvToXlsx(directory, deleteOriginal = false) {
  try {
    if (!fs.existsSync(directory)) {
      throw new Error(`Directory not found: ${directory}`);
    }

    const files = fs.readdirSync(directory);
    const csvFiles = files
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .map((f) => ({
        name: f,
        path: path.join(directory, f),
        time: fs.statSync(path.join(directory, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (csvFiles.length === 0) {
      console.log("No CSV files found.");
      return null;
    }

    const latestCsv = csvFiles[0];
    console.log(`\nConverting latest CSV file: ${latestCsv.name}\n`);

    const xlsxPath = convertCsvToXlsx(latestCsv.path);

    if (deleteOriginal) {
      fs.unlinkSync(latestCsv.path);
      console.log(`\n✓ Deleted original CSV: ${latestCsv.name}`);
    }

    return xlsxPath;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

function mergeRugbyFilesInCaseFileNotFound(
  rugbyLeaguePath,
  rugbyUnionPath,
  mergedFilePath
) {
  const leagueExists = fileExists(rugbyLeaguePath);
  const unionExists = fileExists(rugbyUnionPath);

  console.log(`======================================\n`);
  console.log(`league File: ${rugbyLeaguePath}`);
  console.log(`Union File: ${rugbyUnionPath}\n`);
  console.log(`Merged File: ${mergedFilePath}\n`);
  console.log(`Rugby League exists: ${leagueExists}`);
  console.log(`Rugby Union exists: ${unionExists}`);
  console.log(`======================================\n`);
  // Case 1: Both files exist - proceed to merge
  if (leagueExists && unionExists) {
    return true;
  }

  // Case 2: Neither file exists - nothing to merge
  if (!leagueExists && !unionExists) {
    console.log(`Neither Rugby League nor Rugby Union file found.`);
    return false;
  }

  let sourceFilePath = null;

  if (unionExists && !leagueExists) {
    console.log(`Only found Rugby Union file: ${rugbyUnionPath}`);
    sourceFilePath = rugbyUnionPath;
  } else if (!unionExists && leagueExists) {
    console.log(`Only found Rugby League file: ${rugbyLeaguePath}`);
    sourceFilePath = rugbyLeaguePath;
  }
  // Copy the existing file to the merged file path
  fs.copyFileSync(sourceFilePath, mergedFilePath);
  fs.unlinkSync(sourceFilePath);
  console.log(
    `\n✓ Single rugby file created: ${path.basename(mergedFilePath)}`
  );
  return false;
}

/**
 * Merge rugbyLeague and rugbyUnion XLSX files into one XLSX file
 * @param {string} directory - Directory path (defaults to config.downloadDir)
 * @param {string} dateStr - Date string in DD-MM-YYYY format (optional, defaults to today)
 * @returns {string} Path to the merged XLSX file
 */
function mergeRugbyFiles(directory = null, dateStr = null) {
  try {
    const targetDir = directory || config.downloadDir;

    // Get date string if not provided
    if (!dateStr) {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = today.getFullYear();
      dateStr = `${day}-${month}-${year}`;
    }

    // File paths based on sports-config.js
    // rugbyLeague uses fileCode: 'rugby', rugbyUnion uses fileCode: 'ru'
    const rugbyLeaguePath = path.join(targetDir, `BG-${dateStr}rl.xlsx`);
    const rugbyUnionPath = path.join(targetDir, `BG-${dateStr}ru.xlsx`);
    const mergedFilePath = path.join(targetDir, `BG-${dateStr}rugby.xlsx`);

    if (
      mergeRugbyFilesInCaseFileNotFound(
        rugbyLeaguePath,
        rugbyUnionPath,
        mergedFilePath
      ) === false
    ) {
      console.log(
        `\nNo merge needed, single rugby file created: ${path.basename(
          mergedFilePath
        )}`
      );
      return mergedFilePath;
    }

    console.log(`\nMerging Rugby files:`);
    console.log(`  Rugby League: ${path.basename(rugbyLeaguePath)}`);
    console.log(`  Rugby Union:  ${path.basename(rugbyUnionPath)}`);

    // Check if files exist
    if (!fs.existsSync(rugbyLeaguePath)) {
      throw new Error(`Rugby League file not found: ${rugbyLeaguePath}`);
    }

    if (!fs.existsSync(rugbyUnionPath)) {
      throw new Error(`Rugby Union file not found: ${rugbyUnionPath}`);
    }

    // Read both XLSX files
    const leagueWorkbook = XLSX.readFile(rugbyLeaguePath);
    const unionWorkbook = XLSX.readFile(rugbyUnionPath);

    // Get the first sheet from each workbook
    const leagueSheetName = leagueWorkbook.SheetNames[0];
    const unionSheetName = unionWorkbook.SheetNames[0];
    const leagueSheet = leagueWorkbook.Sheets[leagueSheetName];
    const unionSheet = unionWorkbook.Sheets[unionSheetName];

    // Convert sheets to JSON arrays
    const leagueData = XLSX.utils.sheet_to_json(leagueSheet, {
      header: 1,
      defval: "",
    });
    const unionData = XLSX.utils.sheet_to_json(unionSheet, {
      header: 1,
      defval: "",
    });

    console.log(`  Rugby League rows: ${leagueData.length}`);
    console.log(`  Rugby Union rows:  ${unionData.length}`);

    // Combine data: header from league, then all league data, then union data (skip header)
    const mergedData = [];

    // Add header from league file
    if (leagueData.length > 0) {
      mergedData.push(leagueData[0]);
    }

    // Add all data rows from league (skip header)
    for (let i = 1; i < leagueData.length; i++) {
      mergedData.push(leagueData[i]);
    }

    // Add all data rows from union (skip header)
    for (let i = 1; i < unionData.length; i++) {
      mergedData.push(unionData[i]);
    }

    console.log(`  Merged rows: ${mergedData.length}`);

    // Create new workbook with merged data
    const mergedWorkbook = XLSX.utils.book_new();
    const mergedSheet = XLSX.utils.aoa_to_sheet(mergedData);
    formatXlsxDateCells(mergedSheet);
    setXlsxColumnWidths(mergedSheet);
    XLSX.utils.book_append_sheet(mergedWorkbook, mergedSheet, "Rugby");

    // Write merged XLSX file
    XLSX.writeFile(mergedWorkbook, mergedFilePath);

    // Get file size
    const mergedSize = fs.statSync(mergedFilePath).size;

    console.log(`✓ Merge successful!`);
    console.log(`  Output: ${path.basename(mergedFilePath)}`);
    console.log(`  Size: ${(mergedSize / 1024).toFixed(2)} KB`);

    // Delete original files after successful merge
    try {
      fs.unlinkSync(rugbyLeaguePath);
      console.log(`  ✓ Deleted: ${path.basename(rugbyLeaguePath)}`);
    } catch (deleteError) {
      console.log(
        `  ⚠ Could not delete Rugby League file: ${deleteError.message}`
      );
    }

    try {
      fs.unlinkSync(rugbyUnionPath);
      console.log(`  ✓ Deleted: ${path.basename(rugbyUnionPath)}`);
    } catch (deleteError) {
      console.log(
        `  ⚠ Could not delete Rugby Union file: ${deleteError.message}`
      );
    }

    return mergedFilePath;
  } catch (error) {
    console.error("❌ Error merging Rugby files:", error.message);
    throw error;
  }
}

function mergeSoccerFilesInCaseFileNotFound(
  soccerPath,
  futsalPath,
  mergedFilePath
) {
  const soccerExists = fileExists(soccerPath);
  const futsalExists = fileExists(futsalPath);

  console.log(`======================================\n`);
  console.log(`Soccer File: ${soccerPath}`);
  console.log(`Futsal File: ${futsalPath}\n`);
  console.log(`Merged File: ${mergedFilePath}\n`);
  console.log(`Soccer exists: ${soccerExists}`);
  console.log(`Futsal exists: ${futsalExists}`);
  console.log(`======================================\n`);

  if (!soccerExists) {
    console.log(`FAILED. Soccer file not found: ${soccerPath}`);
    throw new Error(`Soccer file not found: ${soccerPath}`);
  }

  // Case 1: Both files exist - proceed to merge
  if (futsalExists) {
    return true;
  }

  let sourceFilePath = null;

  if (!futsalExists) {
    console.log(`Only found Soccer file: ${soccerPath}`);
    sourceFilePath = soccerPath;
  }

  // Copy the existing file to the merged file path
  fs.copyFileSync(sourceFilePath, mergedFilePath);
  fs.unlinkSync(sourceFilePath);
  console.log(
    `\n✓ Single soccer file created: ${path.basename(mergedFilePath)}`
  );
  return false;
}

/**
 * Merge football and futsal XLSX files into one XLSX file
 * @param {string} directory - Directory path (defaults to config.downloadDir)
 * @param {string} dateStr - Date string in DD-MM-YYYY format (optional, defaults to today)
 * @returns {string} Path to the merged XLSX file
 */
function mergeFootballAndFutsalFiles(directory = null, dateStr = null) {
  try {
    const targetDir = directory || config.downloadDir;

    // Get date string if not provided
    if (!dateStr) {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = today.getFullYear();
      dateStr = `${day}-${month}-${year}`;
    }

    // File paths based on sports-config.js
    // football uses fileCode: 'football', futsal uses fileCode: 'fs'
    const footballPath = path.join(targetDir, `BG-${dateStr}sco.xlsx`);
    const futsalPath = path.join(targetDir, `BG-${dateStr}fs.xlsx`);
    const mergedFilePath = path.join(targetDir, `BG-${dateStr}sc.xlsx`);

    console.log(`\nMerging Football files:`);
    console.log(`  Football: ${path.basename(footballPath)}`);
    console.log(`  Futsal:  ${path.basename(futsalPath)}`);
    console.log(`  Merged:  ${path.basename(mergedFilePath)}`);

    if (
      !mergeSoccerFilesInCaseFileNotFound(
        footballPath,
        futsalPath,
        mergedFilePath
      )
    ) {
      return mergedFilePath;
    }

    // Read both XLSX files
    const footballWorkbook = XLSX.readFile(footballPath);
    const futsalWorkbook = XLSX.readFile(futsalPath);

    // Get the first sheet from each workbook
    const footballSheetName = footballWorkbook.SheetNames[0];
    const futsalSheetName = futsalWorkbook.SheetNames[0];
    const footballSheet = footballWorkbook.Sheets[footballSheetName];
    const futsalSheet = futsalWorkbook.Sheets[futsalSheetName];

    // Convert sheets to JSON arrays
    const footballData = XLSX.utils.sheet_to_json(footballSheet, {
      header: 1,
      defval: "",
    });
    const futsalData = XLSX.utils.sheet_to_json(futsalSheet, {
      header: 1,
      defval: "",
    });

    console.log(`  Football rows: ${footballData.length}`);
    console.log(`  Futsal rows:  ${futsalData.length}`);

    // Combine data: header from football, then all football data, then futsal data (skip header)
    const mergedData = [];

    // Add header from football file
    if (footballData.length > 0) {
      mergedData.push(footballData[0]);
    }

    // Add all data rows from football (skip header)
    for (let i = 1; i < footballData.length; i++) {
      mergedData.push(footballData[i]);
    }

    // Add all data rows from futsal (skip header)
    for (let i = 1; i < futsalData.length; i++) {
      mergedData.push(futsalData[i]);
    }

    console.log(`  Merged rows: ${mergedData.length}`);

    // Create new workbook with merged data
    const mergedWorkbook = XLSX.utils.book_new();
    const mergedSheet = XLSX.utils.aoa_to_sheet(mergedData);

    formatXlsxDateCells(mergedSheet);
    setXlsxColumnWidths(mergedSheet);

    XLSX.utils.book_append_sheet(mergedWorkbook, mergedSheet, "Sheet1");

    // Write merged XLSX file
    XLSX.writeFile(mergedWorkbook, mergedFilePath);

    // Get file size
    const mergedSize = fs.statSync(mergedFilePath).size;

    console.log(`✓ Merge successful!`);
    console.log(`  Output: ${path.basename(mergedFilePath)}`);
    console.log(`  Size: ${(mergedSize / 1024).toFixed(2)} KB`);

    // Delete original files after successful merge
    try {
      fs.unlinkSync(footballPath);
      console.log(`  ✓ Deleted: ${path.basename(footballPath)}`);
    } catch (deleteError) {
      console.log(`  ⚠ Could not delete Football file: ${deleteError.message}`);
    }

    try {
      fs.unlinkSync(futsalPath);
      console.log(`  ✓ Deleted: ${path.basename(futsalPath)}`);
    } catch (deleteError) {
      console.log(`  ⚠ Could not delete Futsal file: ${deleteError.message}`);
    }

    return mergedFilePath;
  } catch (error) {
    console.error("❌ Error merging Football files:", error.message);
    throw error;
  }
}

// Command-line usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Default: convert all CSV files in download directory
    const bgDir = config.downloadDir;
    convertAllCsvToXlsx(bgDir, false);
  } else if (args[0] === "--latest") {
    // Convert only the latest CSV file
    const bgDir = config.downloadDir;
    convertLatestCsvToXlsx(bgDir, false);
  } else if (args[0] === "--all") {
    // Convert all CSV files
    const bgDir = args[1] || config.downloadDir;
    const deleteOriginal = args.includes("--delete");
    convertAllCsvToXlsx(bgDir, deleteOriginal);
  } else if (args[0] === "--delete-csv") {
    // Convert all and delete originals
    const bgDir = args[1] || config.downloadDir;
    convertAllCsvToXlsx(bgDir, true);
  } else if (args[0] === "--merge-rugby") {
    // Merge rugbyLeague and rugbyUnion files
    const bgDir = args[1] || config.downloadDir;
    const dateStr = args[2] || null;
    mergeRugbyFiles(bgDir, dateStr);
  } else if (args[0] === "--merge-football-futsal") {
    // Merge football and futsal files
    const bgDir = args[1] || config.downloadDir;
    const dateStr = args[2] || null;
    mergeFootballAndFutsalFiles(bgDir, dateStr);
  } else if (fs.existsSync(args[0])) {
    // Convert specific file
    const deleteOriginal = args.includes("--delete");
    const xlsxPath = convertCsvToXlsx(args[0]);

    if (deleteOriginal) {
      fs.unlinkSync(args[0]);
      console.log(`\n✓ Deleted original CSV`);
    }
  }
}

module.exports = {
  convertCsvToXlsx,
  convertAllCsvToXlsx,
  convertLatestCsvToXlsx,
  mergeRugbyFiles,
  mergeFootballAndFutsalFiles,
};
