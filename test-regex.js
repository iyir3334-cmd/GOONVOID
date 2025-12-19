// Test HTML samples from actual sites

const pornhubSample = `<li data-value="Eliza ibarra" class="alpha">
    <a href="/pornstar/eliza-ibarra" class="searches first">
        <img loading="lazy" src="https://ei.phncdn.com/pics/users/u/001/425/551/931/avatar1585260203/(m=eidYGCjadOf)(mh=ugJUcEeQnStawCZF)200x200.jpg">
        Eliza ibarra
    </a>
</li>
<li data-value="Mia Malkova" class="alpha">
    <a href="/pornstar/mia-malkova" class="searches">
        <img loading="lazy" src="https://example.com/mia.jpg">
        Mia Malkova
    </a>
</li>`;

// Test current regex
const itemRegex = /<li[^>]+class="[^"]*wrap[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
let match;
let count = 0;
while ((match = itemRegex.exec(pornhubSample)) !== null) {
    console.log("Match found:", match[0].substring(0, 100));
    count++;
}
console.log(`Pornhub matches: ${count}`);

// Test new regex
const newRegex = /<li[^>]*>([\s\S]*?)<a[^>]+href="(\/pornstar\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
count = 0;
while ((match = newRegex.exec(pornhubSample)) !== null) {
    console.log("New match found:");
    console.log("  Link:", match[2]);
    const content = match[3];
    const nameMatch = />\s*([^<]+)\s*</.exec(content) || /alt="([^"]+)"/.exec(content);
    console.log("  Name:", nameMatch ? nameMatch[1].trim() : "NOT FOUND");
    count++;
}
console.log(`New regex matches: ${count}`);
