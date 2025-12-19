import re

# Read with universal newlines
with open('services/htmlParserService.ts', 'r', encoding='utf-8', newline=None) as f:
    lines = f.readlines()

# Find the line with "Extract Name: Prefer specifically"
found = False
for i, line in enumerate(lines):
    if 'Extract Name: Prefer specifically' in line:
        print(f'Found at line {i+1}')
        print(f'Context (lines {i} to {i+12}):')
        for j in range(i, min(i+13, len(lines))):
            print(f'{j+1}: {lines[j]}', end='')
        found = True
        
        # Now replace this section
        # Line i: comment
        # Line i+1: const specificNameMatch
        # Line i+2: const altMatch
        # line i+3: blank
        # Line i+4: let name = '';
        # Lines i+5-11: if/else chain
        
        # Replace line i
        lines[i] = '            // Extract Name: Look for the best match in order of specificity\r\n'
        
        # Insert new lines after line i
        insert_lines = [
            '            // 1. Look for <a class="title">NAME</a> (most reliable for search results)\r\n',
            '            const titleLinkMatch = /<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\\/a>/.exec(content);\r\n',
            '            // 2. Look for class="name" or similar\r\n',
            '            const specificNameMatch = /class="[^"]*\\bname\\b[^"]*"[^>]*>([^<]+)</.exec(content);\r\n',
            '            // 3. Image alt attribute\r\n',
        ]
        
        # Remove old line i+1 (specificNameMatch)
        del lines[i+1]
        
        # Insert new lines
        for idx, new_line in enumerate(insert_lines):
            lines.insert(i+1+idx, new_line)
        
        # Now fix the if statement (originally at i+4, now at i+8 or so)
        # Find the "if (specificNameMatch)" line
        for j in range(i+5, i+15):
            if j < len(lines) and 'if (specificNameMatch)' in lines[j]:
                lines[j] = '            if (titleLinkMatch) {\r\n'
                lines.insert(j+1, '                // Most reliable for search results - the <a class="title"> link\r\n')
                lines.insert(j+2, '                name = titleLinkMatch[1].trim();\r\n')
                lines.insert(j+3, '            } else if (specificNameMatch) {\r\n')
                break
        
        break

if found:
    with open('services/htmlParserService.ts', 'w', encoding='utf-8', newline='') as f:
        f.writelines(lines)
    print('\n✓ Successfully updated htmlParserService.ts')
else:
    print('✗ Could not find the target section')
