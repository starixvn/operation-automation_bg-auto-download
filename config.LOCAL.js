module.exports = {
  downloadDir: "/app/downloads",
  port: 5000,
  playwright: {
    headless: true,
    browser: "chromium",
  },
  infoSite: {
    url: "https://infosite.klt2p.oneback.net",
    uploadUrl:
      "http://generalexcelupload.klt2p.oneback.net/GeneralExcelUpload/UploadServiceExcel",
    statusUrl:
      "http://generalexcelupload.klt2p.oneback.net/GeneralExcelUpload/GetServiceTask?task_status=99&task_range=10",
    username: "nexcel1",
    password: "1234aa",
  },
};
