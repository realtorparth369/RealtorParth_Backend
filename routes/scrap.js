// // scrapeAirdrieAll.mjs
// import puppeteer from "puppeteer";
// import XLSX from "xlsx";

// /**
//  * Deep scraper for:
//  * - Shane Homes Build page
//  * - Livabl Calgary new homes
//  * - Mattamy Homes search (Calgary / Airdrie)
//  *
//  * Single-file ESM. Save output to airdrie_new_construction.xlsx
//  */

// // Utility: pause
// const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// // Normalize text
// const text = (s) => (s ? String(s).trim().replace(/\s+/g, " ") : "");

// // Ensure absolute URL
// function absolutify(base, maybeRelative) {
//   if (!maybeRelative) return "";
//   try {
//     const u = new URL(maybeRelative, base);
//     return u.toString();
//   } catch {
//     return maybeRelative;
//   }
// }

// // Scroll to bottom helper (to trigger lazy load)
// async function autoScroll(page, maxScrolls = 10, delay = 500) {
//   for (let i = 0; i < maxScrolls; i++) {
//     await page.evaluate(() => window.scrollBy(0, window.innerHeight));
//     await page.waitForTimeout(delay);
//   }
// }

// // Extract text safely from an element handle (used when not using $$eval)
// async function getTextFromHandle(handle, selector) {
//   try {
//     const el = await handle.$(selector);
//     if (!el) return "";
//     const txt = await (await el.getProperty("innerText")).jsonValue();
//     return text(txt);
//   } catch {
//     return "";
//   }
// }

// // Open a new page and set sane defaults
// async function newPage(browser) {
//   const page = await browser.newPage();
//   await page.setUserAgent(
//     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
//   );
//   await page.setViewport({ width: 1366, height: 800 });
//   page.setDefaultNavigationTimeout(60000);
//   return page;
// }

// // ---------------- SHANE HOMES (https://www.shanehomes.com/build/) ----------------
// async function scrapeShaneHomes(browser) {
//   const url = "https://www.shanehomes.com/build/";
//   console.log(`\n➡️ Scraping Shane Homes: ${url}`);
//   const page = await newPage(browser);

//   try {
//     await page.goto(url, { waitUntil: "networkidle2" });
//     // page contains cards for builds/communities; scroll to load more
//     await autoScroll(page, 12, 400);

//     // On Shane build page cards might have anchors to detail pages. Try a few selectors
//     const cardSelectors = [
//       ".project-card", // common pattern
//       ".card", //
//       ".model-card",
//       ".community-card",
//       ".product-card",
//     ];

//     let cards = [];
//     for (const sel of cardSelectors) {
//       cards = await page.$$(sel);
//       if (cards.length > 0) {
//         console.log(`   found ${cards.length} cards with selector: ${sel}`);
//         // extract via $$eval with this selector
//         const items = await page.$$eval(sel, (nodes) =>
//           nodes.map((n) => {
//             // find anchor for detail page (common)
//             const a = n.querySelector("a");
//             const link = a ? a.href : "";
//             const title = n.querySelector("h3, .card-title, .project-card__title")?.innerText || "";
//             const price = n.querySelector(".price, .card-price")?.innerText || "";
//             const location = n.querySelector(".location, .card-location, .project-card__location")?.innerText || "";
//             const img = n.querySelector("img")?.src || "";
//             return { title: title.trim(), price: price.trim(), location: location.trim(), link, image: img };
//           })
//         );
//         // For each item, open detail to get more fields
//         const results = [];
//         for (const it of items) {
//           const detail = { source: "Shane Homes", builder: "Shane Homes", ...it };
//           if (it.link) {
//             try {
//               const detailPage = await newPage(browser);
//               await detailPage.goto(it.link, { waitUntil: "networkidle2", timeout: 60000 });
//               // try to extract price, beds/baths/area from detail page
//               const desc = (await detailPage.$eval(".page-content, .property-description, .details", (e) => e.innerText).catch(() => "")) || "";
//               detail.description = text(desc);
//               // common detail selectors
//               detail.address = text((await detailPage.$eval(".address, .location, .property-address", (e) => e.innerText).catch(() => "")));
//               detail.price = detail.price || text((await detailPage.$eval(".price, .property-price", (e) => e.innerText).catch(() => "")));
//               // try to find specs: beds, baths, sqft
//               const specs = {};
//               // many builder pages use lists of specs
//               const specText = (await detailPage.$$eval(".specs li, .property-specs li, .features li", (els) => els.map((e) => e.innerText))).join(" | ").trim();
//               detail.specs = specText || "";
//               // try meta image
//               const metaImg = (await detailPage.$eval("meta[property='og:image']", (m) => m.content).catch(() => "")) || "";
//               detail.image = detail.image || metaImg;
//               await detailPage.close();
//             } catch (e) {
//               console.warn("   shane detail open failed:", e.message);
//             }
//           }
//           results.push(detail);
//         }
//         await page.close();
//         return results;
//       }
//     }

//     // fallback: no cards found
//     console.log("   ⚠️ No Shane Homes cards found with known selectors.");
//     await page.close();
//     return [];
//   } catch (err) {
//     console.error("   ❌ Shane Homes error:", err.message);
//     try { await page.close(); } catch {}
//     return [];
//   }
// }

// // ---------------- LIVABL (https://www.livabl.com/calgary-ab-metro/new-homes) ----------------
// async function scrapeLivabl(browser) {
//   const url = "https://www.livabl.com/calgary-ab-metro/new-homes";
//   console.log(`\n➡️ Scraping Livabl: ${url}`);
//   const page = await newPage(browser);

//   try {
//     await page.goto(url, { waitUntil: "networkidle2" });
//     // Livabl lists project tiles; ensure content loaded and scroll
//     await autoScroll(page, 15, 400);

//     // look for project cards
//     const cardCandidates = [".project-tile", ".listing-card", ".card", ".project-tile--item", ".result-card"];
//     for (const sel of cardCandidates) {
//       const nodes = await page.$$(sel);
//       if (nodes.length > 0) {
//         console.log(`   found ${nodes.length} cards with selector: ${sel}`);
//         const items = await page.$$eval(sel, (nodes) =>
//           nodes.map((n) => {
//             const a = n.querySelector("a");
//             const link = a ? a.href : "";
//             const title = n.querySelector(".title, .project-tile__title, h3")?.innerText || "";
//             const meta = n.querySelector(".meta, .project-tile__meta, .project-info")?.innerText || "";
//             const img = n.querySelector("img")?.src || "";
//             return { title: title.trim(), meta: meta.trim(), link, image: img };
//           })
//         );

//         // for each project, open detail page for full info
//         const results = [];
//         for (const it of items) {
//           const out = { source: "Livabl", builder: "", title: it.title, link: it.link, image: it.image, meta: it.meta };
//           if (it.link) {
//             try {
//               const detailPage = await newPage(browser);
//               await detailPage.goto(it.link, { waitUntil: "networkidle2", timeout: 60000 });
//               // extract details: description, price, address, developer
//               out.description = text((await detailPage.$eval(".project__description, .project-description, .description", (e) => e.innerText).catch(() => "")));
//               out.price = text((await detailPage.$eval(".price, .project-price", (e) => e.innerText).catch(() => "")));
//               out.address = text((await detailPage.$eval(".location, .project__location, .address", (e) => e.innerText).catch(() => "")));
//               out.builder = text((await detailPage.$eval(".developer, .builder, .project-developer", (e) => e.innerText).catch(() => "")));
//               // try to collect features/specs
//               const specs = (await detailPage.$$eval(".project__facts li, .facts li, .info-list li", (els) => els.map((el) => el.innerText))).join(" | ");
//               out.specs = specs || "";
//               // meta image
//               out.image = out.image || (await detailPage.$eval("meta[property='og:image']", (m) => m.content).catch(() => ""));
//               await detailPage.close();
//             } catch (e) {
//               console.warn("   livabl detail error:", e.message);
//             }
//           }
//           results.push(out);
//           // polite wait
//           await wait(250);
//         }

//         await page.close();
//         return results;
//       }
//     }

//     console.log("   ⚠️ No Livabl cards found with known selectors.");
//     await page.close();
//     return [];
//   } catch (err) {
//     console.error("   ❌ Livabl error:", err.message);
//     try { await page.close(); } catch {}
//     return [];
//   }
// }

// // ---------------- MATTAMY HOMES (search results) ----------------
// // Provided URL includes search and metro=Calgary; we'll navigate to the search URL and parse result cards and open details.
// async function scrapeMattamy(browser) {
//   const url =
//     "https://mattamyhomes.com/search?community=All&country=CAN&hideMap=false&homeType=All&metro=Calgary&productType=community";
//   console.log(`\n➡️ Scraping Mattamy Homes: ${url}`);
//   const page = await newPage(browser);

//   try {
//     await page.goto(url, { waitUntil: "networkidle2" });
//     // The search results are dynamic; scroll and wait for result cards
//     await autoScroll(page, 15, 400);

//     // Mattamy uses card-like results; try selectors
//     const cardSelectors = [".inventory-card", ".result-card", ".community-card", ".search-result", ".card"];
//     for (const sel of cardSelectors) {
//       const nodes = await page.$$(sel);
//       if (nodes.length > 0) {
//         console.log(`   found ${nodes.length} cards with selector: ${sel}`);
//         // Extract title and link from each
//         const items = await page.$$eval(sel, (nodes) =>
//           nodes.map((n) => {
//             const a = n.querySelector("a");
//             const link = a ? a.href : "";
//             const title = n.querySelector("h3, .card-title, .community-title")?.innerText || "";
//             const meta = n.querySelector(".meta, .card-meta")?.innerText || "";
//             const img = n.querySelector("img")?.src || "";
//             return { title: title.trim(), meta: meta.trim(), link, image: img };
//           })
//         );

//         const results = [];
//         for (const it of items) {
//           const out = { source: "Mattamy Homes", builder: "Mattamy Homes", title: it.title, link: it.link, image: it.image, meta: it.meta };
//           if (it.link) {
//             try {
//               const detailPage = await newPage(browser);
//               await detailPage.goto(it.link, { waitUntil: "networkidle2", timeout: 60000 });

//               // Mattamy detail pages often have description, price (if inventory), address, floorplans
//               out.description = text((await detailPage.$eval(".page-content, .community-description, .content", (e) => e.innerText).catch(() => "")));
//               out.address = text((await detailPage.$eval(".address, .community-address", (e) => e.innerText).catch(() => "")));
//               out.price = text((await detailPage.$eval(".price, .starting-at, .starting-price", (e) => e.innerText).catch(() => "")));
//               // pull floorplan names / sizes if available
//               const floorplans = (await detailPage.$$eval(".floorplan, .plan-list li, .product-listing li", (els) => els.map((el) => el.innerText))).join(" | ");
//               out.floorplans = floorplans || "";
//               // meta image fallback
//               out.image = out.image || (await detailPage.$eval("meta[property='og:image']", (m) => m.content).catch(() => ""));
//               await detailPage.close();
//             } catch (e) {
//               console.warn("   mattamy detail error:", e.message);
//             }
//           }
//           results.push(out);
//           await wait(200);
//         }

//         await page.close();
//         return results;
//       }
//     }

//     console.log("   ⚠️ No Mattamy cards found with known selectors.");
//     await page.close();
//     return [];
//   } catch (err) {
//     console.error("   ❌ Mattamy error:", err.message);
//     try { await page.close(); } catch {}
//     return [];
//   }
// }

// // ---------------- Main runner ----------------
// (async () => {
//   // Launch puppeteer (toggle headless false if you need to debug visually)
//   const browser = await puppeteer.launch({
//     headless: true, // set to false if you want to see the browser (debug)
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   });

//   try {
//     const all = [];
//     // Run scrapers sequentially to avoid being blocked; can be parallelized carefully
//     const shane = await scrapeShaneHomes(browser);
//     all.push(...shane);

//     const livabl = await scrapeLivabl(browser);
//     all.push(...livabl);

//     const mattamy = await scrapeMattamy(browser);
//     all.push(...mattamy);

//     console.log(`\n🎯 Total records scraped: ${all.length}`);

//     if (all.length === 0) {
//       console.warn("⚠️ No records scraped. Try running headless:false to debug selectors or increase timeouts.");
//     } else {
//       // Normalize fields order for Excel
//       const sheetData = all.map((r) => ({
//         source: r.source || "",
//         builder: r.builder || "",
//         title: r.title || "",
//         price: r.price || "",
//         address: r.address || r.location || "",
//         location: r.location || "",
//         beds: r.beds || "",
//         baths: r.baths || "",
//         sqft: r.sqft || r.size || "",
//         floorplans: r.floorplans || "",
//         specs: r.specs || r.meta || "",
//         description: r.description || "",
//         image: r.image || "",
//         link: r.link || "",
//       }));

//       const ws = XLSX.utils.json_to_sheet(sheetData);
//       const wb = XLSX.utils.book_new();
//       XLSX.utils.book_append_sheet(wb, ws, "NewConstruction");
//       XLSX.writeFile(wb, "airdrie_new_construction.xlsx");
//       console.log("✅ Saved airdrie_new_construction.xlsx");
//     }
//   } catch (err) {
//     console.error("Fatal error:", err);
//   } finally {
//     await browser.close();
//   }
// })();






















// scrapeAirdrieAll.mjs
import puppeteer from "puppeteer";
import XLSX from "xlsx";

/**
 * Universal Puppeteer scraper that:
 * - opens a page
 * - optionally types searchTerm (if searchSelector provided)
 * - waits for any of card selector candidates to appear
 * - extracts fields using multiple candidate selectors per field (fallbacks)
 *
 * This is intentionally defensive: checks several selector options and handles missing fields.
 */

// CONFIG: each site has { name, url, search (optional), cardSelectors, fields }
// fields: object where key => array of candidate selectors (relative to card element)
const SITES = [
  {
    name: "Shane Homes",
    url: "https://www.shanehomes.com/communities/airdrie",
    // No site search required; page lists communities
    cardSelectors: [".card", ".community-card", ".project-card", ".card__container"],
    fields: {
      title: [".card-title", ".community-card__title", ".card__title", "h3", ".title"],
      price: [".card-price", ".price", ".community-card__price"],
      location: [".card-location", ".community-card__location", ".card__location"],
      link: ["a"]
    }
  },
  {
    name: "Livabl",
    url: "https://www.livabl.com/airdrie-ab/new-homes",
    cardSelectors: [ ".over2", ".project-tile", ".listing", ".card", ".project-tile--item"],
    fields: {
      title: [".project-tile__title", ".title", ".project-title", "h3", ".card-title", ".name"],
      price: [".project-tile__price", ".price", ".project-price"],
      location: [".project-tile__location", ".location", ".project-location", ".address"],
      link: ["a"]
    }
  },
  {
    name: "Mattamy Homes (Southwinds Airdrie)",
    url: "https://mattamyhomes.com/alberta/calgary/airdrie/southwinds",
    cardSelectors: [".inventory-card", ".home-card", ".card", ".plan-card"],
    fields: {
      title: [".inventory-card__title", ".home-name", "h3", ".card-title"],
      price: [".inventory-card__price", ".price"],
      location: [".inventory-card__location", ".location", ".community"],
      link: ["a"]
    }
  },
  {
    name: "Excel Homes (Cobblestone Creek)",
    url: "https://www.excelhomes.ca/communities/airdrie/cobblestone-creek/",
    cardSelectors: [".listing-card", ".home-tile", ".card", ".property"],
    fields: {
      title: [".listing-title", ".home-tile__title", "h3", ".card-title"],
      price: [".listing-price", ".home-tile__price", ".price"],
      location: [".listing-location", ".home-location", ".location"],
      link: ["a"]
    }
  },
  {
    name: "Zillow (Airdrie new homes)",
    url: "https://www.zillow.com/airdrie-ab/new-homes/",
    cardSelectors: [
      ".list-card", // older zillow
      "[data-testid='property-card']", // some Zillow semantics
      ".StyledPropertyCardDataWrapper"
    ],
    fields: {
      title: ["address", ".list-card-addr", "[data-test='property-card-address']"],
      price: [".list-card-price", ".ds-summary-row .ds-price", "[data-test='property-card-price']"],
      location: [".list-card-addr", "address"],
      link: ["a"]
    }
  },
  {
    name: "CalgaryHomes (Airdrie new homes)",
    url: "https://calgaryhomes.ca/airdrie-new-homes-for-sale.php",
    cardSelectors: [".listing-item", ".property", ".result", ".listing"],
    fields: {
      title: [".listing-title", "h3", ".title"],
      price: [".listing-price", ".price"],
      location: [".listing-location", ".location", ".city"],
      link: ["a"]
    }
  },
  {
    name: "Realtor.ca (Airdrie new listings)",
    url: "https://www.realtor.ca/ab/airdrie/new-listings",
    cardSelectors: [".listingCard", ".residential-card", ".propertyCard", ".listingCard__container"],
    fields: {
      title: [".listingCardTitle", ".listingCard__title", "h3"],
      price: [".listingCardPrice", ".listingCard__price", ".price"],
      location: [".listingCardAddress", ".listingCard__address", ".address"],
      link: ["a"]
    }
  },
  {
    name: "Justin Havre Real Estate",
    url: "https://www.airdrierealestate.ca/new-construction-homes.php",
    cardSelectors: [".property-listing", ".listing", ".property", ".property-item"],
    fields: {
      title: [".property-title", "h3", ".title"],
      price: [".property-price", ".price"],
      location: [".property-location", ".location", ".address"],
      link: ["a"]
    }
  }
];

// utility: wait and try to find a working card selector from candidates
async function findWorkingCardSelector(page, candidates, timeout = 15000) {
  for (const sel of candidates) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      const nodes = await page.$$(sel);
      if (nodes.length > 0) return sel;
    } catch (e) {
      // ignore and try next candidate
    }
  }
  // fallback: return first candidate (page may load later)
  return null;
}

// extraction helper: given a card selector and a field map, extract fields relative to each card
async function extractFromCards(page, cardSelector, fields) {
  if (!cardSelector) return [];

  // Run in page context: map over elements matching cardSelector
  const results = await page.$$eval(cardSelector, (cards, fields) => {
    const out = [];
    for (const card of cards) {
      const obj = {};
      for (const [key, selectors] of Object.entries(fields)) {
        let value = "";
        // try each selector candidate
        for (const s of selectors) {
          try {
            // if selector is "address" or simple tag, try querySelector
            const el = card.querySelector(s) || (s === "address" ? card.querySelector("address") : null);
            if (el) {
              // for 'a' tags prefer href for link
              if (s === "a" && el.href) {
                value = el.href;
                break;
              }
              value = el.innerText ? el.innerText.trim() : (el.getAttribute ? el.getAttribute("href") || "" : "");
              if (value) break;
            }
          } catch (err) {
            // ignore and continue
          }
        }
        // fallback: for link try any anchor in the card
        if (!value && key === "link") {
          const a = card.querySelector("a");
          if (a && a.href) value = a.href;
        }
        obj[key] = value || "";
      }
      out.push(obj);
    }
    return out;
  }, fields);

  return results;
}

// main runner
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const allResults = [];

  for (const site of SITES) {
    const page = await browser.newPage();

    // set user agent to look like a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    );

    // increase default timeout
    page.setDefaultNavigationTimeout(60000);

    console.log(`\n➡️  Visiting ${site.name} — ${site.url}`);
    try {
      await page.goto(site.url, { waitUntil: "networkidle2", timeout: 60000 });
    } catch (err) {
      console.warn(`⚠️  Timeout or navigation issue for ${site.name}: ${err.message}. Trying to continue...`);
    }

    // Try to find a working card selector from candidates (some sites require waiting longer)
    let workingCard = await findWorkingCardSelector(page, site.cardSelectors);
    if (!workingCard) {
      // try waiting a bit longer for dynamic content
      try {
        console.log("   waiting extra for dynamic content...");
        for (const sel of site.cardSelectors) {
          await page.waitForTimeout(2000); // small pause
          const present = await page.$$(sel);
          if (present && present.length > 0) {
            workingCard = sel;
            break;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!workingCard) {
      console.log(`   ⚠️ No matching card selector found automatically for ${site.name}. Trying first candidate as fallback...`);
      workingCard = site.cardSelectors[0] || null;
    } else {
      console.log(`   👍 Using card selector: ${workingCard}`);
    }

    // If the site supports a visible search on page and you'd prefer to type "Airdrie", you could:
    // await page.type(searchSelector, 'Airdrie'); await page.keyboard.press('Enter'); await page.waitForNavigation(...);
    // For most configured URLs above we already navigated to Airdrie-specific pages.

    // attempt extraction
    let extracted = [];
    try {
      // if no working selector detected, we still attempt extraction on the fallback
      if (workingCard) {
        extracted = await extractFromCards(page, workingCard, site.fields);
      }
    } catch (err) {
      console.error(`   ❌ Extraction failed on ${site.name}: ${err.message}`);
    }

    // Post-process each item: add source and site name, normalize link to be absolute if necessary
    const normalized = extracted.map((it) => {
      // ensure link is absolute
      let link = it.link || "";
      if (link && link.startsWith("/")) {
        // create absolute from base site url
        try {
          const base = new URL(site.url);
          link = base.origin + link;
        } catch {}
      }
      return {
        source: site.name,
        title: it.title || it.name || it.title,
        price: it.price || "",
        location: it.location || "",
        beds: it.beds || "",
        baths: it.baths || "",
        link,
      };
    });

    console.log(`   scraped ${normalized.length} records from ${site.name}`);
    if (normalized.length > 0) {
      console.log("   sample:", normalized.slice(0, 2));
    } else {
      console.log("   (no records found — try adjusting selectors or run non-headless to debug)");
    }

    allResults.push(...normalized);

    await page.close();
    // polite pause to reduce chance of rate-limiting/blocking
    await new Promise((r) => setTimeout(r, 1200));
  }

  await browser.close();

  console.log(`\n🎯 Total records scraped across sources: ${allResults.length}`);

  // Save to Excel
  if (allResults.length === 0) {
    console.warn("⚠️ No records to save. If sites are JS-heavy or blocked, try running headful or adjust selectors.");
  } else {
    const worksheet = XLSX.utils.json_to_sheet(allResults);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "NewConstruction");
    XLSX.writeFile(workbook, "livabl.xlsx");
    console.log("✅ Saved to airdrie_new_construction.xlsx");
  }
})();
