import re

# Read the file
with open('services/htmlParserService.ts', 'r', encoding='utf-8') as f:
    content = f.read()

#  Find the section and replace it
old_code = '''            // Extract Name: Prefer specifically classed name links, else image alt, else cleaned nameContent
            const specificNameMatch = /class="[^"]*(?:name|title)[^"]*"[^>]*>([^<]+)</.exec(content);
            const altMatch = /<img[^>]+alt="([^"]*)"/i.exec(content);
            
            let name = '';
            if (specificNameMatch) {
                name = specificNameMatch[1].trim();
            } else if (altMatch && altMatch[1] && !/pornstar|model/i.test(altMatch[1])) {
                name = altMatch[1].trim();
            } else {
                name = nameContent.replace(/<[^>]+>/g, '').trim();
            }'''

new_code = '''            // Extract Name: Look for the best match in order of specificity
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
            }'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('services/htmlParserService.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('✓ Successfully updated htmlParserService.ts')
else:
    print('✗ Pattern not found')
    # Try to find partial match
    if 'Extract Name: Prefer specifically' in content:
        print('Found "Extract Name: Prefer specifically"')
    if 'specificNameMatch' in content:
        print('Found "specificNameMatch"')
