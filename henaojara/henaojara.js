async function searchResultsHenaojara(keyword) {
    try {
        // Encode the keyword for use in the URL
        const encodedKeyword = encodeURIComponent(keyword);

        // Fetch the search results page
        const response = await fetch(`https://henaojara.com/?s=${encodedKeyword}`);
        const responseText = await response.text(); // Get HTML as text

        // Parse the HTML into a DOM object
        const parser = new DOMParser();
        const doc = parser.parseFromString(responseText, "text/html");

        // Extract results from the DOM
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

        // Return the results as a JSON string
        return JSON.stringify(transformedResults);

    } catch (error) {
        console.log("Fetch error:", error);

        // Return an error object as a JSON string
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
