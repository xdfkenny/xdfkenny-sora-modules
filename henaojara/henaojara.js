const fetch = require("node-fetch");
const cheerio = require("cheerio");

async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await fetch(`https://henaojara.com/?s=${encodedKeyword}`);
        const responseText = await response.text(); // Get raw HTML

        const $ = cheerio.load(responseText); // Load HTML into Cheerio

        const transformedResults = $("li.TPostMv").map((_, element) => {
            const title = $(element).find("h3.Title").text().trim();
            const image = $(element).find("img").attr("src");
            const href = $(element).find("a").attr("href");

            return { title: title || "Unknown Title", image: image || "", href: href || "#" };
        }).get(); // Convert Cheerio object to array

        return JSON.stringify(transformedResults);

    } catch (error) {
        console.log("Fetch error:", error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
