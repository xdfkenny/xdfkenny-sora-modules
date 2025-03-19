async function searchResults(keyword) {
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

async function extractDetails(id) {
    try {
        // Fetch details for the given ID
        const response = await fetch(`https://henaojara.com/?p=${id}`);
        const responseText = await response.text(); // Get HTML as text

        // Parse the HTML into a DOM object
        const parser = new DOMParser();
        const doc = parser.parseFromString(responseText, "text/html");

        // Extract details from the DOM
        const descriptionElement = doc.querySelector(".Description");
        const aliasesElement = doc.querySelector(".Aliases");
        const airdateElement = doc.querySelector(".Airdate");

        const transformedResults = [{
            description: descriptionElement ? descriptionElement.textContent.trim() : "No description available",
            aliases: aliasesElement ? aliasesElement.textContent.trim() : "Alias: Unknown",
            airdate: airdateElement ? airdateElement.textContent.trim() : "Aired: Unknown"
        }];

        // Return the details as a JSON string
        return JSON.stringify(transformedResults);

    } catch (error) {
        console.log("Details error:", error);

        // Return an error object as a JSON string
        return JSON.stringify([{
            description: "Error loading description",
            aliases: "Alias: Unknown",
            airdate: "Aired: Unknown"
        }]);
    }
}

async function extractEpisodes(id) {
    try {
        // Fetch episodes for the given ID
        const response = await fetch(`https://henaojara.com/?p=${id}`);
        const responseText = await response.text(); // Get HTML as text

        // Parse the HTML into a DOM object
        const parser = new DOMParser();
        const doc = parser.parseFromString(responseText, "text/html");

        // Extract episodes from the DOM
        const transformedResults = [...doc.querySelectorAll(".EpisodeList li")].map(episode => {
            const linkElement = episode.querySelector("a");
            const numberElement = episode.querySelector(".EpisodeNumber");

            return {
                href: linkElement ? linkElement.getAttribute("href") : "#",
                number: numberElement ? numberElement.textContent.trim() : "Unknown"
            };
        });

        // Return the episodes as a JSON string
        return JSON.stringify(transformedResults);

    } catch (error) {
        console.log("Episodes error:", error);

        // Return an empty array in case of error
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        // Return the stream URL directly (no fetching needed)
        return url;
    } catch (error) {
        console.log("Stream URL error:", error);

        // Return null in case of error
        return null;
    }
}
