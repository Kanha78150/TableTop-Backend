// Test Excel export functionality
import fetch from "node-fetch";
import fs from "fs";

const testExport = async () => {
  console.log("🧪 Testing Excel Export...\n");

  const baseURL = "http://localhost:8000/api/v1/admin/accounting";

  try {
    // Test transaction export
    const exportData = {
      format: "excel",
      reportType: "transactions",
      hotelId: "68d13a52c10d4ebc29bfe787",
      branchId: "68d13a9dc10d4ebc29bfe78f",
      startDate: "2025-10-10",
      endDate: "2025-10-31",
    };

    console.log("📊 Export Request:", exportData);

    const response = await fetch(`${baseURL}/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(exportData),
    });

    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get("content-type")}`);

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      console.log(`File Size: ${buffer.byteLength} bytes`);

      // Save file for testing
      fs.writeFileSync("./test_export.xlsx", Buffer.from(buffer));
      console.log("✅ Export file saved as test_export.xlsx");
    } else {
      const errorText = await response.text();
      console.log("❌ Export Error:", errorText);
    }
  } catch (error) {
    console.error("❌ Test Error:", error.message);
  }

  console.log("\n✅ Export test complete!");
};

testExport();
