async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await fetch(`https://henaojara.com/?s=${encodedKeyword}`);
        const responseText = await response.text(); // Get HTML as text

        const parser = new DOMParser();
        const doc = parser.parseFromString(responseText, "text/html");

        const transformedResults = [...doc.querySelectorAll("li.TPostMv")].map(item => {
            const titleElement = item.querySelector("h3.Title");
            const imageElement = item.querySelector("img");
            const linkElement = item.querySelector("a");

            return {
                title: titleElement ? titleElement.textContent.trim() : "Unknown Title",
                image: imageElement ? imageElement.getAttribute("src") : "",
                href: linkElement ? linkElement.getAttribute("href") : "#"
            };
        });

        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log("Fetch error:", error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
