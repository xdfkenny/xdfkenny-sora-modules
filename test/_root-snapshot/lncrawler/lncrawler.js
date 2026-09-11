async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await soraFetch(`https://api.lncrawler.monster/novels/search/?query=${encodedKeyword}&page=1&page_size=24&sort_by=title&sort_order=desc`);
        const payload = await response.json();
        const results = Array.isArray(payload?.results)
          ? payload.results
            .map((item) => {
              const source = item?.prefered_source;
              const href = item?.slug || source?.novel_slug || "";
              const image = source?.cover_url || source?.cover_min_url || "";

              if (!href || !image) {
                return null;
              }

              return {
                title: decodeHtmlEntities(item?.title || source?.title || "Untitled"),
                href,
                image
              };
            })
            .filter(Boolean)
          : [];

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.error("Error fetching or parsing: " + error);
        return JSON.stringify([{
            title: "Error",
            href: "",
            image: ""
        }]);
    }
}

async function extractDetails(slug) {
  try {
    const response = await soraFetch(`https://api.lncrawler.monster/novels/${slug}/`);
    const payload = await response.json();
    const source = payload?.prefered_source || payload?.sources?.[0] || null;
    const synopsis = source?.synopsis || "";

    const description = synopsis
      ? decodeHtmlEntities(
          synopsis
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        )
      : "No description available";

    const aliases = 'N/A';
    const airdate = 'N/A';

    const transformedResults = [{
      description,
      aliases,
      airdate
    }];

    console.log(JSON.stringify(transformedResults));
    return JSON.stringify(transformedResults);

  } catch (error) {
    console.log('Details error:' + error);
    return JSON.stringify([{
      description: 'Error loading description',
      aliases: 'N/A',
      airdate: 'N/A'
    }]);
  }
}

async function extractChapters(slug) {
  try {
    const novelResponse = await soraFetch(`https://api.lncrawler.monster/novels/${slug}/`);
    const novelPayload = await novelResponse.json();
    const sourceSlug = novelPayload?.prefered_source?.source_slug || novelPayload?.sources?.[0]?.source_slug || "lncrawler";

    const firstPageResponse = await soraFetch(`https://api.lncrawler.monster/novels/${slug}/${sourceSlug}/chapters/?page=1&page_size=100`);
    const firstPagePayload = await firstPageResponse.json();
    const totalPages = firstPagePayload?.total_pages || 1;

    const pageRequests = [];
    for (let page = 2; page <= totalPages; page++) {
      pageRequests.push(
        soraFetch(`https://api.lncrawler.monster/novels/${slug}/${sourceSlug}/chapters/?page=${page}&page_size=100`)
          .then((pageResponse) => pageResponse.json())
      );
    }

    const remainingPages = await Promise.all(pageRequests);
    const allPages = [firstPagePayload, ...remainingPages];

    const chapters = allPages
      .flatMap((page) => page?.chapters || [])
      .filter((chapter) => chapter?.chapter_id != null)
      .sort((a, b) => a.chapter_id - b.chapter_id)
      .map((chapter) => ({
        title: decodeHtmlEntities((chapter?.title || "Untitled").trim()),
        href: `https://lncrawler.monster/novels/${slug}/${sourceSlug}/chapter/${chapter.chapter_id}`,
        number: chapter.chapter_id
      }));

    console.log(JSON.stringify(chapters));
    return JSON.stringify(chapters);

  } catch (error) {
    console.error('Fetch error in extractChapters:', error);
    return JSON.stringify([{
      href: '',
      title: "Error fetching chapters",
      number: 0
    }]);
  }
}

async function extractText(url) {
  try {
    let requestUrl = url;
    if (url.includes("lncrawler.monster") && !url.includes("api.lncrawler.monster")) {
      requestUrl = url.replace("lncrawler.monster", "api.lncrawler.monster");
    }

    const response = await soraFetch(requestUrl, {
      headers: { Accept: "application/json, text/plain, */*" }
    });

    if (!response) {
      throw new Error("No response received");
    }

    const payload = await response.json();
    const origin = requestUrl.split("/").slice(0, 3).join("/");

    let content = cleanChapterBody(payload?.body);
    content = normalizeChapterImageUrls(content, payload?.images_path, origin);

    if (!content) {
      throw new Error("Chapter body not found");
    }

    return content;
  } catch (error) {
    console.log("Fetch error in extractText: " + error);
    return '<p>Error extracting text</p>';
  }
}

  function normalizeChapterImageUrls(content, imagesPath, apiOrigin) {
    if (!content) {
      return "";
    }

    const normalizedImagesPath = imagesPath ? imagesPath.replace(/\/+$/, "") : "";

    return content.replace(/<img\b([^>]*?)\bsrc=(['"])([^'"]+)\2([^>]*)>/gi, (full, beforeSrc, quote, rawSrc, afterSrc) => {
      const src = rawSrc.trim();

      if (/^(https?:|data:|blob:|local:|#|\/\/)/i.test(src)) {
        return full;
      }

      let absoluteSrc = src;

      if (normalizedImagesPath && /^(\.\/)?images\//i.test(src)) {
        absoluteSrc = `${normalizedImagesPath}/${src.replace(/^(\.\/)?images\//i, "")}`;
      } else if (normalizedImagesPath) {
        absoluteSrc = `${normalizedImagesPath}/${src.replace(/^\.\//, "")}`;
      } else {
        absoluteSrc = new URL(src, `${apiOrigin}/`).toString();
      }

      return `<img${beforeSrc}src=${quote}${absoluteSrc}${quote}${afterSrc}>`;
    });
  }

  function cleanChapterBody(body) {
    if (!body) {
      return "";
    }

    let content = body.trim();

    const sectionMatch = content.match(/<section\b[^>]*>([\s\S]*?)<\/section>/i);
    if (sectionMatch) {
      content = sectionMatch[1].trim();
    }

    const mainMatch = content.match(/<div\b[^>]*class=["'][^"']*\bmain\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (mainMatch) {
      content = mainMatch[1].trim();
    }

    return content
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
      .replace(/<hr\s*\/?>/gi, '')
      .replace(/<p\b[^>]*class=["'][^"']*\bcenterp\b[^"']*["'][\s\S]*?<\/p>/gi, '')
      .trim();
  }

async function soraFetch(url, options = {
    headers: {},
    method: 'GET',
    body: null
}) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

function decodeHtmlEntities(text) {
    const entities = {
        '&#x2014;': '—',
        '&#x2013;': '–',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#x3D;': '=',
        '&nbsp;': ' '
    };

    return text.replace(/&#x[\dA-Fa-f]+;|&\w+;/g, (match) => {
        return entities[match] || match;
    });
}
