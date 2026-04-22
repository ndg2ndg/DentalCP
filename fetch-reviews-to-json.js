/**
 * Birdeye Microsite Data Fetcher
 * Calls these endpoints from the official API blueprint:
 *   1. GET  /v1/business/{businessId}                      — business info
 *   2. GET  /v1/review/businessid/{id}/summary             — published summary (for display)
 *   3. GET  /v1/review/businessid/{id}/summary?statuses=.. — full summary (for data control)
 *   4. POST /v1/review/report/count-by-rating/{id}         — published count (712 to display)
 *   5. POST /v1/review/businessId/{id} statuses=published  — published reviews (for display)
 *   6. POST /v1/review/businessId/{id} statuses=all        — ALL reviews (for data control)
 *   7. GET  /v1/employee/{businessId}                      — staff/doctors
 */

const https = require("https");
const fs    = require("fs");

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
      headers: { "Accept": "application/json", "x-api-key": API_KEY }
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

function apiPost(path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: "api.birdeye.com",
      path: `/resources${path}`,
      method: "POST",
      headers: {
        "Accept": "application/json", "Content-Type": "application/json",
        "x-api-key": API_KEY, "Content-Length": Buffer.byteLength(bodyStr),
        ...extraHeaders
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

async function fetchReviewsByStatus(statuses) {
  const COUNT = 100;
  let all = [], sindex = 0;
  while (true) {
    console.log(`  Fetching [${statuses}] reviews sindex=${sindex}...`);
    const page = await apiPost(
      `/v1/review/businessId/${BUSINESS_ID}?sindex=${sindex}&count=${COUNT}&includeNonAggregatedReviews=true`,
      { statuses }
    );
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < COUNT) break;
    sindex += COUNT;
  }
  return all;
}

function mapReview(r) {
  return {
    reviewId:     r.reviewId,
    rating:       r.rating,
    status:       r.status || "published",
    comment:      r.comments || "",
    reviewer: {
      name:      r.reviewer?.nickName || r.reviewer?.firstName || "Anonymous",
      thumbnail: r.reviewer?.thumbnailUrl || ""
    },
    reviewDate:   r.reviewDate || "",
    sourceName:   r.sourceType || "",
    reviewUrl:    r.reviewURL  || r.reviewUrl || "",
    response:     r.response   || "",
    responseDate: r.responseDate || ""
  };
}

async function main() {
  // 1. Business info
  console.log("Fetching business info...");
  let business = {};
  try {
    business = await apiGet(`/v1/business/${BUSINESS_ID}`);
    console.log("  Business info fetched OK");
  } catch(e) { console.log("  Business info failed:", e.message); }

  // 2. Published summary — for display
  console.log("Fetching published summary...");
  let publishedSummary = {};
  try {
    publishedSummary = await apiGet(`/v1/review/businessid/${BUSINESS_ID}/summary?statuses=published,parked`);
    console.log("  Published summary fetched OK");
  } catch(e) { console.log("  Published summary failed:", e.message); }

  // 3. Full summary — all statuses
  console.log("Fetching full summary...");
  let fullSummary = {};
  try {
    fullSummary = await apiGet(`/v1/review/businessid/${BUSINESS_ID}/summary?statuses=published,parked`);
    console.log("  Full summary fetched OK");
  } catch(e) { console.log("  Full summary failed:", e.message); }

  // 4. Published count — what to display publicly
  console.log("Fetching published review count...");
  let publishedCount = 0;
  try {
    const countData = await apiPost(
      `/v1/review/report/count-by-rating/${BUSINESS_ID}`,
      { businessNumbers: [parseInt(BUSINESS_ID)], statuses: ["published"] }
    );
    publishedCount = countData.reviewCount || 0;
    console.log(`Published count (to display): ${publishedCount}`);
  } catch(e) { console.log("  Could not fetch published count:", e.message); }

  // 5. Total count — all reviews for data control
  console.log("Fetching total review count (all statuses)...");
  let totalCount = 0;
  try {
    const countData = await apiPost(
      `/v1/review/report/count-by-rating/${BUSINESS_ID}`,
      { businessNumbers: [parseInt(BUSINESS_ID)] }
    );
    totalCount = countData.reviewCount || 0;
    console.log(`Total count (all statuses): ${totalCount}`);
  } catch(e) { console.log("  Could not fetch total count:", e.message); }

  // 6. Fetch published reviews — what to show on page
  console.log("Fetching published reviews (for display)...");
  const publishedReviews = await fetchReviewsByStatus(["published"]);
  console.log(`Published reviews fetched: ${publishedReviews.length}`);

  // 7. Fetch ALL reviews — for data control and analysis
  console.log("Fetching ALL reviews (for data control)...");
  const allReviews = await fetchReviewsByStatus(["all"]);
  console.log(`All reviews fetched: ${allReviews.length}`);

  // 8. Employees
  console.log("Fetching employees...");
  let employees = [];
  try {
    employees = await apiGet(`/v1/employee/${BUSINESS_ID}`);
  } catch(e) { console.log("  No employees found:", e.message); }

  const output = {
    lastUpdated: new Date().toISOString(),
    displayCount: publishedReviews.length,
    totalCount: allReviews.length,
    business: {
      name:        business.name,
      phone:       business.phone,
      website:     business.websiteURL || business.websiteUrl,
      description: business.description,
      logoUrl:     business.logoURL    || business.logoUrl,
      coverUrl:    business.coverImageURL || business.coverImageUrl,
      address: business.location ? {
        address1: business.location.address1,
        address2: business.location.address2 || "Ste 306",
        city:     business.location.city,
        state:    business.location.state,
        zip:      business.location.zip,
        country:  business.location.countryName || "United States"
      } : null,
      hours:       business.hoursOfOperations || [],
      avgRating:   business.avgRating,
      reviewCount: publishedReviews.length,
      social:      business.socialProfileURLs || {},
      services:    business.services || "",
      category:    business.category || ""
    },
    // Published summary — calculated from actual published reviews array
    // (API summary endpoint ignores status filter, so we calculate ourselves)
    summary: {
      sources: publishedSummary.sources.filter(s => s.sourceAlias !== "direct_feedback") || [],
      ratings: [5,4,3,2,1,0].map(r => ({
        rating: r,
        reviewCount: publishedReviews.filter(rev => rev.rating === r).length
      })),
      noRatingCount: publishedReviews.filter(r => r.rating === 0).length
    },
    // Full summary — all statuses for data control
    fullSummary: {
      sources: fullSummary.sources || [],
      ratings: fullSummary.ratings || []
    },
    employees: (Array.isArray(employees) ? employees : []).map(e => ({
      name:     `${e.firstName || ""} ${e.lastName || ""}`.trim(),
      title:    e.designation || e.role || "",
      imageUrl: e.imageUrl || e.profilePicUrl || ""
    })),
    // Published reviews — displayed on page
    reviews: publishedReviews.map(r => ({
      reviewId:     r.reviewId,
      rating:       r.rating,
      status:       r.status || "published",
      comment:      r.comments || "",
      reviewer: {
        name:      r.reviewer?.nickName || r.reviewer?.firstName || "Anonymous",
        thumbnail: r.reviewer?.thumbnailUrl || ""
      },
      reviewDate:   r.reviewDate || "",
      sourceName:   r.sourceType || "",
      reviewUrl:    r.reviewURL  || r.reviewUrl || "",
      response:     r.response   || "",
      responseDate: r.responseDate || ""
    })),
    // ALL reviews — for data control
    allReviews: allReviews.map(r => ({
      reviewId:     r.reviewId,
      rating:       r.rating,
      status:       r.status || "",
      comment:      r.comments || "",
      reviewer: {
        name:      r.reviewer?.nickName || r.reviewer?.firstName || "Anonymous",
        thumbnail: r.reviewer?.thumbnailUrl || ""
      },
      reviewDate:   r.reviewDate || "",
      sourceName:   r.sourceType || "",
      reviewUrl:    r.reviewURL  || r.reviewUrl || "",
      response:     r.response   || "",
      responseDate: r.responseDate || ""
    }))
  };

  fs.writeFileSync("reviews.json", JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved reviews.json`);
  console.log(`   Display count : ${output.displayCount}`);
  console.log(`   Total count   : ${output.totalCount}`);
  console.log(`   Published reviews : ${output.reviews.length}`);
  console.log(`   All reviews       : ${output.allReviews.length}`);
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
