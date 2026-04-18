/**
 * Birdeye Microsite Data Fetcher
 * Calls 3 endpoints from the official API blueprint:
 *   1. GET  /v1/business/{businessId}          — business info
 *   2. GET  /v1/review/businessid/{id}/summary — ratings breakdown
 *   3. POST /v1/review/businessId/{id}         — all reviews
 */

const https  = require("https");
const fs     = require("fs");

const API_KEY     = process.env.BIRDEYE_API_KEY;
const BUSINESS_ID = process.env.BIRDEYE_BID;

if (!API_KEY || !BUSINESS_ID) {
  console.error("Missing BIRDEYE_API_KEY or BIRDEYE_BID environment variables");
  process.exit(1);
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.birdeye.com",
      path: `/resources${path}`,
      method: "GET",
      headers: {
        "Accept":    "application/json",
        "x-api-key": API_KEY
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) { reject(new Error(`GET ${path} → HTTP ${res.statusCode}: ${data}`)); return; }
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: "api.birdeye.com",
      path: `/resources${path}`,
      method: "POST",
      headers: {
        "Accept":          "application/json",
        "Content-Type":    "application/json",
        "x-api-key":       API_KEY,
        "Content-Length":  Buffer.byteLength(bodyStr)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) { reject(new Error(`POST ${path} → HTTP ${res.statusCode}: ${data}`)); return; }
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function fetchAllReviews() {
  const COUNT = 100;
  let all = [], sindex = 0;
  while (true) {
    console.log(`  Fetching reviews sindex=${sindex}...`);
    const page = await apiPost(
      `/v1/review/businessId/${BUSINESS_ID}?sindex=${sindex}&count=${COUNT}`,
      { statuses: ["all"] }
    );
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < COUNT) break;
    sindex += COUNT;
  }
  return all;
}

async function main() {
  console.log("Fetching business info...");
  const business = await apiGet(`/v1/business/${BUSINESS_ID}`);

  console.log("Fetching review summary...");
  const summary = await apiGet(`/v1/review/businessid/${BUSINESS_ID}/summary`);

  console.log("Fetching all reviews...");
  const rawReviews = await fetchAllReviews();
  console.log(`Total reviews: ${rawReviews.length}`);

  const output = {
    lastUpdated: new Date().toISOString(),
    business: {
      name:        business.name,
      phone:       business.phone,
      website:     business.websiteURL || business.websiteUrl,
      description: business.description,
      logoUrl:     business.logoURL    || business.logoUrl,
      coverUrl:    business.coverImageURL || business.coverImageUrl,
      address:     business.location ? {
        address1: business.location.address1,
        city:     business.location.city,
        state:    business.location.state,
        zip:      business.location.zip
      } : null,
      hours:       business.hoursOfOperations || [],
      avgRating:   business.avgRating,
      reviewCount: business.reviewCount,
      social:      business.socialProfileURLs || {}
    },
    summary: {
      sources: summary.sources || [],
      ratings: summary.ratings || []
    },
    reviews: rawReviews.map(r => ({
      reviewId:   r.reviewId,
      rating:     r.rating,
      comment:    r.comments || "",
      reviewer: {
        name:      r.reviewer?.nickName || r.reviewer?.firstName || "Anonymous",
        thumbnail: r.reviewer?.thumbnailUrl || ""
      },
      reviewDate: r.reviewDate || "",
      sourceName: r.sourceType || "",
      reviewUrl:  r.reviewURL  || r.reviewUrl || "",
      response:   r.response   || "",
      responseDate: r.responseDate || ""
    }))
  };

  fs.writeFileSync("reviews.json", JSON.stringify(output, null, 2));
  console.log("✅ Saved reviews.json");
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
