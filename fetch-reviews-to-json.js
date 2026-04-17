/**
 * Birdeye Reviews Fetcher
 * Runs via GitHub Actions — fetches all reviews and saves to reviews.json
 * Uses documented API: POST /v1/review/businessId/{businessId}
 */

const https  = require("https");
const fs     = require("fs");

const API_KEY     = process.env.BIRDEYE_API_KEY;
const BUSINESS_ID = process.env.BIRDEYE_BID;
const COUNT       = 100;  // fetch up to 100 reviews per run

if (!API_KEY || !BUSINESS_ID) {
  console.error("Missing BIRDEYE_API_KEY or BIRDEYE_BID environment variables");
  process.exit(1);
}

function fetchPage(sindex) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ statuses: ["all"] });
    const options = {
      hostname: "api.birdeye.com",
      path: `/resources/v1/review/businessId/${BUSINESS_ID}?sindex=${sindex}&count=${COUNT}`,
      method: "POST",
      headers: {
        "Accept":          "application/json",
        "Content-Type":    "application/json",
        "x-api-key":       API_KEY,
        "Content-Length":  Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchAllReviews() {
  console.log("Fetching reviews from Birdeye API...");
  let all = [];
  let sindex = 0;

  while (true) {
    console.log(`  Fetching sindex=${sindex}...`);
    const page = await fetchPage(sindex);
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < COUNT) break;
    sindex += COUNT;
  }

  console.log(`Total reviews fetched: ${all.length}`);

  // Build summary
  const rated = all.filter(r => r.rating > 0);
  const avgRating = rated.length
    ? rated.reduce((s, r) => s + r.rating, 0) / rated.length
    : 0;

  const output = {
    lastUpdated: new Date().toISOString(),
    revCount: all.length,
    avgRating: Math.round(avgRating * 10) / 10,
    reviews: all.map(r => ({
      rating:     r.rating,
      comment:    r.comments || "",
      reviewer:   { name: r.reviewer?.nickName || r.reviewer?.firstName || "Anonymous" },
      reviewDate: r.reviewDate || "",
      sourceName: r.sourceType || "Google"
    }))
  };

  fs.writeFileSync("reviews.json", JSON.stringify(output, null, 2));
  console.log("✅ Saved reviews.json");
}

fetchAllReviews().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
