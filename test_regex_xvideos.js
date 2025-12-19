const fs = require('fs');

const html = fs.readFileSync('debug_xvideos.html', 'utf8');

// The regex from htmlParserService.ts (as updated)
// const videoBlockPattern = /<div id="video_[a-z0-9]+" data-id="(\d+)" data-eid="([a-z0-9]+)"[^>]*>[\s\S]*?<\/script><\/div>/gi; // OLD
const videoBlockPattern = /<div[^>]+id="video_([a-zA-Z0-9]+)"[^>]*>([\s\S]*?)<\/div>/gi; // NEW

let count = 0;
let blockMatch;
while ((blockMatch = videoBlockPattern.exec(html)) !== null) {
    count++;
    const block = blockMatch[0];
    const videoId = blockMatch[1];

    console.log(`Match ${count}: ID=${videoId}`);
    // console.log("Block content preview:", block.substring(0, 100));

    // Check Href
    const hrefMatch = /href=["'](\/video\.[a-zA-Z0-9]+\/[^"']+)["']/.exec(block);
    console.log(`  Href: ${hrefMatch ? hrefMatch[1] : 'NOT FOUND'}`);

    // Check Title
    const titleMatch = /title=["']([^"']+)["']/.exec(block);
    console.log(`  Title: ${titleMatch ? titleMatch[1] : 'NOT FOUND'}`);

    // Check Thumb
    const thumbMatch = /data-src=["']([^"']+)["']/.exec(block);
    console.log(`  Thumb (data-src): ${thumbMatch ? thumbMatch[1] : 'NOT FOUND'}`);

    if (!thumbMatch) {
        const srcMatch = /src=["']([^"']+)["']/.exec(block);
        console.log(`  Thumb (src): ${srcMatch ? srcMatch[1] : 'NOT FOUND'}`);
    }
}

console.log(`Total matches: ${count}`);
