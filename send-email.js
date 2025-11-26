const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const emailConfig = require("./email-config.js");
const config = require("./config.js");

/**
 * Create email transporter based on configuration
 */
function createTransporter() {
  const config = {
    auth: emailConfig.auth,
  };

  // Use service if specified, otherwise use custom SMTP
  if (emailConfig.service) {
    config.service = emailConfig.service;
  } else {
    config.host = emailConfig.smtp.host;
    config.port = emailConfig.smtp.port;
    config.secure = emailConfig.smtp.secure;
  }

  return nodemailer.createTransport(config);
}

/**
 * Replace template variables with actual values
 */
function fillTemplate(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

/**
 * Send email with XLSX file attachment
 * @param {string} xlsxFilePath - Path to the XLSX file
 * @param {string} csvFilePath - Optional path to CSV file
 * @param {string} sportName - Name of the sport
 * @returns {Promise<Object>} Email send result
 */
async function sendEmailWithFile(
  xlsxFilePath,
  csvFilePath = null,
  sportName = "Soccer"
) {
  try {
    // Check if email sending is enabled
    if (!emailConfig.enabled) {
      console.log("ℹ Email sending is disabled in configuration");
      return { success: false, message: "Email disabled in config" };
    }

    // Validate email configuration
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      throw new Error(
        "Email credentials not configured. Please update email-config.js"
      );
    }

    if (!emailConfig.sender) {
      throw new Error(
        "Sender email not configured. Please update email-config.js"
      );
    }

    if (!emailConfig.recipients || emailConfig.recipients.length === 0) {
      throw new Error(
        "No recipients configured. Please update email-config.js"
      );
    }

    // Check if XLSX file exists
    if (!fs.existsSync(xlsxFilePath)) {
      throw new Error(`XLSX file not found: ${xlsxFilePath}`);
    }

    // Prepare template data
    const today = new Date();
    const dateStr = today.toLocaleDateString("en-GB"); // DD/MM/YYYY format
    const filename = path.basename(xlsxFilePath);

    const templateData = {
      date: dateStr,
      sport: sportName,
      filename: filename,
    };

    // Fill templates
    const subject = fillTemplate(emailConfig.subjectTemplate, templateData);
    const body = fillTemplate(emailConfig.bodyTemplate, templateData);

    // Prepare attachments
    const attachments = [];

    if (emailConfig.attachXlsx) {
      attachments.push({
        filename: path.basename(xlsxFilePath),
        path: xlsxFilePath,
      });
    }

    // Create email options
    const mailOptions = {
      from: emailConfig.sender,
      to: emailConfig.recipients.join(", "),
      subject: subject,
      text: body,
      attachments: attachments,
    };

    console.log("\n📧 Sending email...");
    console.log(`  From: ${emailConfig.sender}`);
    console.log(`  To: ${emailConfig.recipients.join(", ")}`);
    console.log(`  Subject: ${subject}`);
    console.log(
      `  Attachments: ${attachments.map((a) => a.filename).join(", ")}`
    );

    // Create transporter and send email
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);

    console.log("✓ Email sent successfully!");
    console.log(`  Message ID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
      recipients: emailConfig.recipients,
    };
  } catch (error) {
    console.error("❌ Cannot send email:", error.message);

    // Provide helpful error messages
    if (
      error.message.includes("Invalid login") ||
      error.message.includes("Authentication failed")
    ) {
      console.error("   Please check your SMTP credentials in email-config.js");
      console.error("   Verify your SMTP Username and Password are correct");
    } else if (
      error.message.includes("ECONNECTION") ||
      error.message.includes("ETIMEDOUT")
    ) {
      console.error("   Connection failed. Please verify:");
      console.error("   1. SMTP server address and port are correct");
      console.error("   2. Your network allows SMTP connections");
      console.error("   3. AWS SES SMTP server is accessible");
    } else if (
      error.message.includes("MessageRejected") ||
      error.message.includes("Rejected")
    ) {
      console.error("   Email was rejected. Please verify:");
      console.error("   1. Sender email is verified in AWS SES");
      console.error("   2. You're not exceeding SES sending limits");
      console.error("   3. All recipient emails are valid");
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send email with multiple XLSX file attachments
 * @param {Array<string>|null} xlsxFilePaths - Optional array of paths to XLSX files. If null/empty, auto-discovers all today's XLSX files
 * @param {Array<string>} csvFilePaths - Optional array of CSV file paths
 * @param {string} subject - Email subject (optional, will generate if not provided)
 * @param {string} directory - Directory to search for files (default: C:\BG)
 * @returns {Promise<Object>} Email send result
 */
async function sendBatchEmail(subject = null, directory = null) {
  if (!directory) directory = config.downloadDir;
  try {
    // Check if email sending is enabled
    if (!emailConfig.enabled) {
      console.log("ℹ Email sending is disabled in configuration");
      return { success: false, message: "Email disabled in config" };
    }

    // Validate email configuration
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      throw new Error(
        "Email credentials not configured. Please update email-config.js"
      );
    }

    if (!emailConfig.sender) {
      throw new Error(
        "Sender email not configured. Please update email-config.js"
      );
    }

    if (!emailConfig.recipients || emailConfig.recipients.length === 0) {
      throw new Error(
        "No recipients configured. Please update email-config.js"
      );
    }

    // Auto-discover XLSX files if not provided
    let validXlsxFiles = [];
    console.log(`\n📁 Auto-discovering XLSX files in: ${directory}`);
    validXlsxFiles = getTodayXlsxFiles(directory);

    if (validXlsxFiles.length === 0) {
      throw new Error("No valid files found to attach");
    }

    // Prepare template data
    const today = new Date();
    const dateStr = today.toLocaleDateString("en-GB"); // DD/MM/YYYY format
    const fileCount = validXlsxFiles.length;

    // Generate subject if not provided
    if (!subject) {
      subject = `BetGenius Data - ${dateStr} (${fileCount} file${
        fileCount > 1 ? "s" : ""
      })`;
    }

    // Build email body with file list
    let body = `Hello,\n\n`;
    body += `Please find attached ${fileCount} BetGenius data file${
      fileCount > 1 ? "s" : ""
    } for ${dateStr}.\n\n`;
    body += `All files have been automatically processed and converted to Excel format.\n\n`;
    body += `This is an automated email from BetGenius Automation System.\n\n`;
    body += `Best regards,\nBetGenius Automation`;

    // Prepare attachments
    const attachments = [];

    if (emailConfig.attachXlsx) {
      validXlsxFiles.forEach((file) => {
        attachments.push({
          filename: path.basename(file),
          path: file,
        });
        console.log(`  Attached file: ${path.basename(file)}`);
      });
    }

    // Create email options
    const mailOptions = {
      from: emailConfig.sender,
      to: emailConfig.recipients.join(", "),
      subject: subject,
      text: body,
      attachments: attachments,
    };

    console.log("\n📧 Sending batch email with all files...");
    console.log(`  From: ${emailConfig.sender}`);
    console.log(`  To: ${emailConfig.recipients.join(", ")}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Attachments: ${attachments.length} file(s)`);
    attachments.forEach((att, idx) => {
      console.log(`    ${idx + 1}. ${att.filename}`);
    });

    // Create transporter and send email
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);

    console.log("✓ Batch email sent successfully!");
    console.log(`  Message ID: ${info.messageId}`);
    console.log(`  Files attached: ${attachments.length}`);

    return {
      success: true,
      messageId: info.messageId,
      recipients: emailConfig.recipients,
      filesAttached: attachments.length,
    };
  } catch (error) {
    console.error("❌ Failed to send batch email:", error.message);

    // Provide helpful error messages
    if (
      error.message.includes("Invalid login") ||
      error.message.includes("Authentication failed")
    ) {
      console.error("   Please check your SMTP credentials in email-config.js");
      console.error("   Verify your SMTP Username and Password are correct");
    } else if (
      error.message.includes("ECONNECTION") ||
      error.message.includes("ETIMEDOUT")
    ) {
      console.error("   Connection failed. Please verify:");
      console.error("   1. SMTP server address and port are correct");
      console.error("   2. Your network allows SMTP connections");
      console.error("   3. AWS SES SMTP server is accessible");
    } else if (
      error.message.includes("MessageRejected") ||
      error.message.includes("Rejected")
    ) {
      console.error("   Email was rejected. Please verify:");
      console.error("   1. Sender email is verified in AWS SES");
      console.error("   2. You're not exceeding SES sending limits");
      console.error("   3. All recipient emails are valid");
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get all new XLSX files from today in the BG directory
 * @param {string} directory - Directory to search (default: C:\BG)
 * @returns {Array<string>} Array of XLSX file paths
 */
function getTodayXlsxFiles(directory = null) {
  if (!directory) directory = config.downloadDir;
  if (!fs.existsSync(directory)) {
    return [];
  }

  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = today.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    const files = fs.readdirSync(directory);
    const xlsxFiles = files
      .filter((f) => f.toLowerCase().endsWith(".xlsx"))
      .map((f) => path.join(directory, f))
      .filter((f) => fs.existsSync(f))
      .sort(); // Sort alphabetically

    return xlsxFiles;
  } catch (error) {
    console.error("Error reading directory:", error.message);
    return [];
  }
}

/**
 * Send all today's XLSX files in one email
 * @param {string} directory - Directory to search (default: C:\BG)
 * @returns {Promise<Object>} Email send result
 */
async function sendTodayFilesEmail(directory = null) {
  if (!directory) directory = config.downloadDir;
  // sendBatchEmail will auto-discover files if no paths provided
  return await sendBatchEmail(null, directory);
}

async function sendEmailAfterUploadingFiles(files) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB"); // DD/MM/YYYY format
  const subject = `BetGenius Data - ${dateStr} (${files.length} files are uploaded to infosite)`;

  // Build email body with file list
  let body = `Hello,\n\n`;
  body += `Following files are uploaded to infosite:\n\n`;
  body += `${files.join("\n")}\n`;
  body += `This is an automated email from BetGenius Automation System.\n\n`;
  body += `Best regards,\nBetGenius Automation`;

  // Create email options
  const mailOptions = {
    from: emailConfig.sender,
    to: emailConfig.recipients.join(", "),
    subject: subject,
    text: body,
  };

  // Create transporter and send email
  const transporter = createTransporter();
  const info = await transporter.sendMail(mailOptions);
}

async function sendFailedEmail(text) {
  const subject = `BetGenius Data - Failed to download BG files. Please download manually.`;

  // Build email body with file list
  let body = `Hello,\n\n`;
  body += `There are some errors when downloading BG files:\n\n`;
  body += `${text}\n`;
  body += `This is an automated email from BetGenius Automation System.\n\n`;
  body += `Best regards,\nBetGenius Automation`;

  // Create email options
  const mailOptions = {
    from: emailConfig.sender,
    to: emailConfig.recipients.join(", "),
    subject: subject,
    text: body,
  };

  // Create transporter and send email
  const transporter = createTransporter();
  const info = await transporter.sendMail(mailOptions);
}

// Command-line usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--all" || args[0] === "--today") {
    // Send all today's files
    sendTodayFilesEmail()
      .then((result) => {
        if (result.success) {
          console.log("\n✅ All files sent successfully!\n");
          process.exit(0);
        } else {
          console.log("\n❌ Failed to send email\n");
          process.exit(1);
        }
      })
      .catch((error) => {
        console.error("\n❌ Error:", error.message, "\n");
        process.exit(1);
      });
  } else if (args[0] === "--help") {
    console.log(`
Usage:
  node send-email.js                    - Send all today's XLSX files in one email
  node send-email.js --all              - Send all today's XLSX files in one email
  node send-email.js --today             - Send all today's XLSX files in one email
  node send-email.js <xlsx-file>         - Send single XLSX file via email

Examples:
  node send-email.js                    # Send all today's files
  node send-email.js "C:\\BG\\BG-04-11-2024sc.xlsx"  # Send single file

Note: Edit email-config.js to configure your AWS SES SMTP settings before using.
        `);
  } else {
    // Send specific file
    const xlsxFile = args[0];
    const sportName = args[1] || "Soccer";
    const csvFile = xlsxFile.replace(".xlsx", ".csv");

    sendEmailWithFile(
      xlsxFile,
      fs.existsSync(csvFile) ? csvFile : null,
      sportName
    )
      .then((result) => {
        if (result.success) {
          console.log("\n✅ Email sent successfully!\n");
          process.exit(0);
        } else {
          console.log("\n❌ Failed to send email\n");
          process.exit(1);
        }
      })
      .catch((error) => {
        console.error("\n❌ Error:", error.message, "\n");
        process.exit(1);
      });
  }
}

module.exports = {
  sendEmailWithFile,
  sendBatchEmail,
  sendTodayFilesEmail,
  getTodayXlsxFiles,
  sendEmailAfterUploadingFiles,
  sendFailedEmail,
};
