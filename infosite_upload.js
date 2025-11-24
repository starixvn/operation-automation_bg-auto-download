const config = require("./config.js");
const axios = require("axios");
const https = require("https");
const fs = require("fs");
const fsPromises = require("fs").promises;
const FormData = require("form-data");
const path = require("path");
const agent = new https.Agent({
  rejectUnauthorized: false,
});

async function uploadAllFiles() {
  const allFiles = [];
  let fileName = await findFirstXLSX();
  while (fileName) {
    console.log(`Found file: ${fileName}`);
    allFiles.push(fileName);
    const filePath = path.join(config.downloadDir, fileName);
    await safeUploadFile(filePath);
    await sleep(5000);
    await waitUntilAllTasksAreFinished();
    fileName = await findFirstXLSX();
  }

  return allFiles;
}

async function waitUntilAllTasksAreFinished() {
  while (await hasAnyUnfinishedTasks()) {
    console.log("There is an unfinished task. Wait 3000ms...");
    await sleep(3000);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFirstXLSX() {
  try {
    const files = await fsPromises.readdir(config.downloadDir);
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (extension === ".xlsx") {
        return file;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error: ${error.message} at path: ${config.downloadDir}`);
    return null;
  }
}

async function safeUploadFile(filePath) {
  try {
    await uploadFile(filePath);
    await fsPromises.unlink(filePath);
  } catch (error) {
    console.error("Error during upload:", error.message);
  }
}

async function uploadFile(filePath) {
  const url = new URL(`${config.infoSite.uploadUrl}`);
  const service_name = filePath.includes("sc.xlsx") ? "agn" : "agnos";
  const fileName = path.basename(filePath);
  console.log(`Starting upload file: ${fileName}`);
  const form = new FormData();
  form.append("service_name", service_name);
  form.append("is_upload_excel", "true");
  form.append("file", fs.createReadStream(filePath), {
    filename: fileName, // Name of the file being sent (important)
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // Giả định là file Excel (.xlsx)
  });
  try {
    // 5. Setup request header
    const response = await axios.post(url, form, {
      httpsAgent: agent,
      headers: {
        ...form.getHeaders(),
        Cookie: "InfoSite_UserId=699; InfoSite_UserName=Nexcel1",
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log(`Progress of uploading file: ${percentCompleted}%`);
      },
    });

    console.log(`\nUpload successful! Status: ${response.status}`);
    return response.data;
  } catch (error) {
    console.error("Error during upload:", error.message);
    // Print detailed error response from server (if any)
    if (error.response) {
      console.error("Status Code:", error.response.status);
      console.error("Response Data:", error.response.data);
    }
    throw error;
  }
}

async function hasAnyUnfinishedTasks() {
  return hasUnfinishedTasks("agn") || hasUnfinishedTasks("agnos");
}

async function hasUnfinishedTasks(service_name) {
  const url = new URL(
    `${config.infoSite.statusUrl}&service_name=${service_name}`
  );
  try {
    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        Cookie: "InfoSite_UserId=699; InfoSite_UserName=Nexcel1",
      },
    });
    console.log(
      `\nGet last task status successful! Status: ${response.status}`
    );
    const tasks = response.data.content;
    const taskStatuses = tasks.map((task) => task.status);
    return taskStatuses.includes(0) || taskStatuses.includes(1);
  } catch (error) {
    console.error("Error during get last task status:", error.message);
    if (error.response) {
      console.error("Status Code:", error.response.status);
      console.error("Response Data:", error.response.data);
    }
    return true;
  }
}

if (require.main === module) {
  const hour = new Date().getHours();

  console.log(`Hour: ${hour}`);
  return;
  uploadAllFiles()
    .then((result) => {
      console.log("Upload Done:");
    })
    .catch((error) => {
      console.error("Upload Error:");
    });
}

module.exports = { uploadAllFiles, hasAnyUnfinishedTasks };
