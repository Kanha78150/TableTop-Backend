// Test script to verify coin validation fix
import http from "http";

function testCheckout() {
  const postData = JSON.stringify({
    cartId: "68eeb6ab62156e400be3e603",
    coinsToUse: 1100,
    paymentMethod: "razorpay",
  });

  const options = {
    hostname: "localhost",
    port: 8000,
    path: "/api/v1/user/cart/checkout",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1M2Y2N2M1MDVlOTc5MzFhYTdhMmIiLCJlbWFpbCI6ImJob2xhc2Fua2FybmFuZGE1OTJAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3Mjg5MzY0MzQsImV4cCI6MTczMTUyODQzNH0.PzCNLX5JHnhCUoE7CZOg8Qg4h1r_oqVqnBbF7YlZjRA",
      "Content-Length": Buffer.byteLength(postData),
    },
  };

  const req = http.request(options, (res) => {
    console.log(`Response Status: ${res.statusCode}`);
    console.log(`Response Headers:`, res.headers);

    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      try {
        const jsonData = JSON.parse(data);
        console.log("Response Data:", JSON.stringify(jsonData, null, 2));
      } catch (e) {
        console.log("Raw Response:", data);
      }
    });
  });

  req.on("error", (error) => {
    console.error("Error:", error.message);
  });

  req.write(postData);
  req.end();
}

testCheckout();
