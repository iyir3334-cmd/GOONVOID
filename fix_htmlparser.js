// Direct file modification for htmlParserService.ts
const fs = require('fs');

const filePath = 'e:/GOONVOID-main/GOONVOID-main/services/htmlParserService.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the specific section
const searchPattern = `            // Extract Name: Prefer specifically classed name links, else image alt, else cleaned nameContent
            const specificNameMatch = /class="[^"]*(?:name|title)[^"]*"[^>]*>([^<]+)</.exec(content);
            const altMatch = /<img[^>]+alt="([^"]*)"/i.exec(content);
            
            let name = '';
            if (specificNameMatch) {
                name = specificNameMatch[1].trim();
            } else if (altMatch && altMatch[1] && !/pornstar|model/i.test(altMatch[1])) {
                name = altMatch[1].trim();
            } else {
                name = nameContent.replace(/<[^>]+>/g, '').trim();
            }`;

const replacement = `            // Extract Name: Look for the best match in order of specificity
            // 1. Look for <a class="title">NAME</a> (most reliable for search results)
            const titleLinkMatch = /<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\\/a>/.exec(content);
            // 2. Look for class="name" or similar
            const specificNameMatch = /class="[^"]*\\bname\\b[^"]*"[^>]*>([^<]+)</.exec(content);
            // 3. Image alt attribute
            const altMatch = /<img[^>]+alt="([^"]*)"/i.exec(content);
            
            let name = '';
            if (titleLinkMatch) {
                // Most reliable for search results - the <a class="title"> link
                name = titleLinkMatch[1].trim();
            } else if (specificNameMatch) {
                name = specificNameMatch[1].trim();
            } else if (altMatch && altMatch[1] && !/pornstar|model/i.test(altMatch[1])) {
                name = altMatch[1].trim();
            } else {
                name = nameContent.replace(/<[^>]+>/g, '').trim();
            }`;

if (content.includes(searchPattern)) {
    content = content.replace(searchPattern, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✓ Successfully updated htmlParserService.ts');
} else {
    console.log('✗ Pattern not found. Searching for partial matches...');

    // Try to find what's actually there
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('Extract Name:')) {
            console.log(`Line ${idx + 1}: ${line}`);
        }
    });
}
