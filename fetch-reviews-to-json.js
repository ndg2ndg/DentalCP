/**
 * Birdeye Microsite Data Fetcher
 * Calls these endpoints from the official API blueprint:
 *   1. GET  /v1/business/{businessId}                — business info
 *   2. GET  /v1/review/businessid/{id}/summary       — ratings breakdown
 *   3. POST /v1/review/businessId/{id}               — all reviews
 *   4. GET  /v1/employee/{businessId}                — staff/doctors
 *   5. POST /v1/quero/external/get-all-qna           — FAQ
 */

const https = require("https");
const fs    = require("fs");

const API_KEY     = process.env.BIRDEYE_API_KEY;
const BUSINESS_ID = process.env.BIRDEYE_BID;

if (!API_KEY || !BUSINESS_ID) {
  console.error("Missing BIRDEYE_API_KEY or BIRDEYE_BID environment variables");
  process.exit(1);
}

function apiGet(path, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.birdeye.com",
      path: `/resources${path}`,
      method: "GET",
      headers: { "Accept": "application/json", "x-api-key": API_KEY, ...extraHeaders }
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

async function fetchAllReviews() {
  const COUNT = 100;
  let all = [], sindex = 0;
  while (true) {
    console.log(`  Fetching reviews sindex=${sindex}...`);
    const page = await apiPost(
      `/v1/review/businessId/${BUSINESS_ID}?sindex=${sindex}&count=${COUNT}&includeNonAggregatedReviews=true`,
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
  const summary = await apiGet(`/v1/review/businessid/${BUSINESS_ID}/summary?statuses=published,parked`);

  console.log("Fetching employees/staff...");
  let employees = [];
  try {
    employees = await apiGet(`/v1/employee/${BUSINESS_ID}`);
  } catch(e) { console.log("  No employees found:", e.message); }

  console.log("Fetching FAQs...");
  let faqs = [];
  try {
    const faqRes = await apiPost(
      `/v1/quero/external/get-all-qna?sIndex=0&count=10&order=1`,
      { businessNumbers: [parseInt(BUSINESS_ID)] },
      { "x-business-number": BUSINESS_ID }
    );
    faqs = faqRes.qnAs || [];
  } catch(e) { console.log("  No FAQs found:", e.message); }

  console.log("Fetching true review count via count-by-rating...");
  let trueReviewCount = 0;
  try {
    const countData = await apiPost(
      `/v1/review/report/count-by-rating/${BUSINESS_ID}`,
      { businessNumbers: [parseInt(BUSINESS_ID)], statuses: ["published", "parked"] }
    );
    trueReviewCount = countData.reviewCount || 0;
    console.log(`True review count: ${trueReviewCount}`);
  } catch(e) { console.log("  Could not fetch count:", e.message); }

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
      address: business.location ? {
        address1: business.location.address1,
        city:     business.location.city,
        state:    business.location.state,
        zip:      business.location.zip
      } : null,
      hours:       business.hoursOfOperations || [],
      avgRating:   business.avgRating,
      reviewCount: trueReviewCount || business.reviewCount,
      social:      business.socialProfileURLs || {},
      services:    business.services || "",
      category:    business.category || ""
    },
    summary: {
      sources: summary.sources || [],
      ratings: summary.ratings || []
    },
    employees: (employees || []).map(e => ({
      name:     `${e.firstName || ""} ${e.lastName || ""}`.trim(),
      email:    e.emailId || "",
      phone:    e.phone   || "",
      imageUrl: e.imageUrl || ""
    })),
    faqs: (faqs || []).map(f => ({
      question: f.question?.text || "",
      answer:   f.question?.answers?.[0]?.text || ""
    })).filter(f => f.question && f.answer),
    reviews: rawReviews.map(r => ({
      reviewId:     r.reviewId,
      rating:       r.rating,
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
  console.log("✅ Saved reviews.json");
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
