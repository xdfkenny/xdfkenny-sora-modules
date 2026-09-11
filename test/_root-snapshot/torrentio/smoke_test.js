/**
 * Smoke test for Torrentio module.
 * Usage: node torrentio/smoke_test.js
 */

const fs = require('fs');
const path = require('path');

// Shim fetchv2 native bridge for Node runtime
global.fetchv2 = async function(url, headers, method, body) {
    const opts = {
        method: method || 'GET',
        headers: headers || {},
        body: body || undefined
    };
    const res = await fetch(url, opts);
    return {
        text: async () => await res.text(),
        json: async () => await res.json(),
        headers: res.headers || {}
    };
};

// Load torrentio.js script in global context
const scriptContent = fs.readFileSync(path.join(__dirname, 'torrentio.js'), 'utf8');
eval(scriptContent);

async function runSmokeTest() {
    console.log('🔥 Starting Torrentio Smoke Test...\n');
    let passed = 0;
    let failed = 0;

    // Test 1: searchResults
    let sampleDetailUrl = '';
    try {
        console.log('[1/4] Testing searchResults("One Piece")...');
        const rawSearch = await searchResults("One Piece");
        const results = JSON.parse(rawSearch);
        console.log(`Received ${results.length} search result(s).`);
        if (results.length > 0 && results[0].title && results[0].href) {
            sampleDetailUrl = results[0].href;
            console.log(`✅ Sample search result: "${results[0].title}" -> href: ${sampleDetailUrl}`);
            passed++;
        } else {
            console.log('❌ searchResults returned empty or invalid schema.');
            failed++;
        }
    } catch (e) {
        console.log(`❌ searchResults error: ${e.message}`);
        failed++;
    }

    // Test 2: extractDetails
    try {
        console.log('\n[2/4] Testing extractDetails()...');
        const targetUrl = sampleDetailUrl || 'https://v3-cinemeta.strem.io/meta/series/tt0388629.json';
        const rawDetails = await extractDetails(targetUrl);
        const details = JSON.parse(rawDetails);
        if (Array.isArray(details) && details.length > 0 && details[0].description) {
            console.log(`✅ Extract details succeeded. Summary: ${details[0].description.slice(0, 80)}...`);
            passed++;
        } else {
            console.log('❌ extractDetails returned invalid format.');
            failed++;
        }
    } catch (e) {
        console.log(`❌ extractDetails error: ${e.message}`);
        failed++;
    }

    // Test 3: extractEpisodes
    let sampleStreamUrl = '';
    try {
        console.log('\n[3/4] Testing extractEpisodes()...');
        const targetUrl = sampleDetailUrl || 'https://v3-cinemeta.strem.io/meta/series/tt0388629.json';
        const rawEpisodes = await extractEpisodes(targetUrl);
        const episodes = JSON.parse(rawEpisodes);
        console.log(`Received ${episodes.length} episode(s).`);
        if (Array.isArray(episodes) && episodes.length > 0 && episodes[0].href) {
            sampleStreamUrl = episodes[0].href;
            console.log(`✅ Sample episode #1 href: ${sampleStreamUrl}`);
            passed++;
        } else {
            console.log('❌ extractEpisodes returned invalid or empty array.');
            failed++;
        }
    } catch (e) {
        console.log(`❌ extractEpisodes error: ${e.message}`);
        failed++;
    }

    // Test 4: extractStreamUrl
    try {
        console.log('\n[4/4] Testing extractStreamUrl()...');
        const targetUrl = sampleStreamUrl || 'https://torrentio.strem.fun/stream/series/tt0388629:1:1.json';
        const rawStreamData = await extractStreamUrl(targetUrl);
        const streamData = JSON.parse(rawStreamData);
        if (streamData && Array.isArray(streamData.streams) && streamData.streams.length > 0) {
            console.log(`✅ Received ${streamData.streams.length} stream option(s).`);
            console.log(`Sample stream title: ${streamData.streams[0].title}`);
            console.log(`Sample streamUrl: ${streamData.streams[0].streamUrl.slice(0, 60)}...`);
            passed++;
        } else {
            console.log('❌ extractStreamUrl returned no valid streams.');
            failed++;
        }
    } catch (e) {
        console.log(`❌ extractStreamUrl error: ${e.message}`);
        failed++;
    }

    console.log(`\n==============================`);
    console.log(`Smoke Test Results: ${passed} passed, ${failed} failed.`);
    console.log(`==============================`);

    if (failed > 0) {
        process.exit(1);
    }
}

runSmokeTest();
