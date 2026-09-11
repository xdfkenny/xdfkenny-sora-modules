/**
 * Smoke test for AniDB (anidb.app) integration.
 * Runs basic checks against live endpoints to ensure the backend is responsive and parsing holds up.
 * 
 * Usage: node anidb/smoke_test.js
 */

const BASE_URL = 'https://anidb.app';
const BROWSE_URL = `${BASE_URL}/browse?q=`;
const EPISODES_API = `${BASE_URL}/api/frontend/anime/%s/episodes`;
const LANGUAGES_API = `${BASE_URL}/api/frontend/episode/%s/languages`;

async function runSmokeTest() {
    console.log('🔥 Starting AniDB Smoke Test...');
    let passed = 0;
    let failed = 0;

    // Test 1: Check connectivity and browse/search endpoint
    try {
        console.log('\n[1/4] Testing search / browse endpoint...');
        const searchUrl = `${BROWSE_URL}Frieren`;
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': BASE_URL + '/'
            }
        });
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const html = await res.text();
        
        // Check for anime cards or content
        const hasCards = /anime-card|slug|anime\//i.test(html);
        if (hasCards) {
            console.log('✅ Search / Browse endpoint returned valid HTML structure.');
            passed++;
        } else {
            console.log('❌ Search / Browse endpoint HTML structure unexpected or blocked.');
            failed++;
        }
    } catch (err) {
        console.log(`❌ Search / Browse test failed: ${err.message}`);
        failed++;
    }

    // Test 2: Check Episodes API (using Frieren numeric ID 1663 as known example)
    let sampleEpisodeId = null;
    try {
        console.log('\n[2/4] Testing Episodes API (/api/frontend/anime/1663/episodes)...');
        const epUrl = EPISODES_API.replace('%s', '1663');
        const res = await fetch(epUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': BASE_URL + '/',
                'Accept': 'application/json, text/plain, */*'
            }
        });
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const data = await res.json();
        
        if (data && Array.isArray(data.episodes) && data.episodes.length > 0) {
            sampleEpisodeId = data.episodes[0].id;
            console.log(`✅ Episodes API returned ${data.episodes.length} episodes. Sample episode ID: ${sampleEpisodeId}`);
            passed++;
        } else {
            console.log('❌ Episodes API response format unexpected or empty.');
            failed++;
        }
    } catch (err) {
        console.log(`❌ Episodes API test failed: ${err.message}`);
        failed++;
    }

    // Test 3: Check Languages / Embeds API
    if (sampleEpisodeId) {
        try {
            console.log(`\n[3/4] Testing Languages API for episode ${sampleEpisodeId}...`);
            const langUrl = LANGUAGES_API.replace('%s', sampleEpisodeId);
            const res = await fetch(langUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': BASE_URL + '/',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            if (!res.ok) throw new Error(`HTTP status ${res.status}`);
            const data = await res.json();

            if (data && Array.isArray(data.languages) && data.languages.length > 0) {
                console.log(`✅ Languages API returned ${data.languages.length} language streams (e.g. ${data.languages.map(l => l.code).join(', ')}).`);
                passed++;
            } else {
                console.log('❌ Languages API response format unexpected or empty.');
                failed++;
            }
        } catch (err) {
            console.log(`❌ Languages API test failed: ${err.message}`);
            failed++;
        }
    } else {
        console.log('\n[3/4] Skipped Languages API test (no sample episode ID obtained).');
        failed++;
    }

    // Test 4: Check Base URL availability
    try {
        console.log('\n[4/4] Testing main site availability (anidb.app)...');
        const res = await fetch(BASE_URL, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        if (res.status < 500) {
            console.log(`✅ Main site reachable (Status: ${res.status}).`);
            passed++;
        } else {
            console.log(`❌ Main site returned server error status: ${res.status}`);
            failed++;
        }
    } catch (err) {
        console.log(`❌ Main site connectivity test failed: ${err.message}`);
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
