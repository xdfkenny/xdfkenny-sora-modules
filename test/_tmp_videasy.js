/* temp test for videasy flow */
const { execFileSync } = require('child_process');
function curl(url, headers, method='GET', body=null) {
  const args = ['-s', '-L', '--max-time', '25'];
  args.push('-X', method);
  for (const k in headers) args.push('-H', k+': '+headers[k]);
  if (body != null) args.push('--data-binary', body);
  args.push(url);
  try { return execFileSync('curl.exe', args, {encoding:'utf8'}); }
  catch(e){ return 'ERROR: '+e.message; }
}
const H = {
  "Accept": "*/*",
  "Origin": "https://player.videasy.to",
  "Referer": "https://player.videasy.to/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
};
(async () => {
  // seed
  const seedData = JSON.parse(curl("https://api.speedracelight.com/seed?mediaId=111110", H));
  const seed = seedData.seed;
  console.log("SEED:", seed);
  // double encode title
  const title = "One Piece";
  const encTitle = encodeURIComponent(encodeURIComponent(title));
  console.log("ENC TITLE:", encTitle);
  const url = `https://api.speedracelight.com/cdn/sources-with-title?title=${encTitle}&mediaType=tv&year=2023&episodeId=1&seasonId=1&tmdbId=111110&imdbId=tt11737520&enc=2&seed=${seed}`;
  console.log("URL:", url);
  const encData = curl(url, H);
  console.log("ENC DATA (first 200):", encData.slice(0,200));
  // decrypt
  const dec = curl("https://enc-dec.app/api/dec-videasy", {"Content-Type":"application/json","Accept":"application/json"}, "POST", JSON.stringify({text: encData, id: "111110", seed}));
  console.log("DEC:", dec.slice(0, 1500));
})();
