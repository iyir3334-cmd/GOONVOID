const fs = require('fs');

const html = fs.readFileSync('debug_xvideos.html', 'utf8');

// Lookahead regex: Capture until next video block or end of string
const videoBlockPattern = /<div[^>]+id="video_([a-zA-Z0-9]+)"[^>]*>([\s\S]*?)(?=<div[^>]+id="video_|$)/gi;

let count = 0;
let blockMatch;
while ((blockMatch = videoBlockPattern.exec(html)) !== null) {
    count++;
    const block = blockMatch[0];
    const videoId = blockMatch[1];

    console.log(`Match ${count}: ID=${videoId}`);
    // console.log("Block length:", block.length);

    // Check Href
    const hrefMatch = /href=["'](\/video\.[a-zA-Z0-9]+\/[^"']+)["']/.exec(block);
    console.log(`  Href: ${hrefMatch ? hrefMatch[1] : 'NOT FOUND'}`);

    // Check Title - look for title attribute in <a> or string content
    // Usually <a ... title="The Title"> or <p class="title">...<a>Title</a></p>
    let titleMatch = /title=["']([^"']+)["']/.exec(block);
    if (!titleMatch) {
        // Try matching text inside <p class="title"><a>...</a></p>
        // This is harder with regex, but let's try a simple tag match if attribute fails
        titleMatch = /class=["']title["'][^>]*>[\s\S]*?<a[^>]+>([\s\S]*?)<\/a>/.exec(block);
    }
    console.log(`  Title: ${titleMatch ? titleMatch[1] : 'NOT FOUND'}`);

    // Check Thumb
    const thumbMatch = /data-src=["']([^"']+)["']/.exec(block);
    console.log(`  Thumb (data-src): ${thumbMatch ? thumbMatch[1] : 'NOT FOUND'}`);

    if (count >= 1) break;
}
