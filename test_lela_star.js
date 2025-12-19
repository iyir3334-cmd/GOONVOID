// UPDATED Test - verify the fix
const testHtml = `
<li>
	<div class="wrap">
		<div class="subscribe-to-pornstar-icon display-none">
			<button type="button" data-title="Subscribe to Pornstar" class="tooltipTrig" onclick="return false;"><span class="bg-sprite-icons"></span></button>
		</div>
		<a href="/pornstar/lela-star">
					<span class="verifiedPornstar tooltipTrig" data-title="Verified Model"><i class="verifiedIcon"></i></span>
						<span class="pornstar_label">
				<span class="title-album">Rank:
					<span class="rank_number">
						169					</span>

                    <hr class="noChange">				</span>
			</span>
			<img data-thumb_url="https://ei.phncdn.com/pics/users/556/280/401/avatar1531072713/(m=ewILGCjadOf)(mh=UOk6JcJ8JK6czNJB)200x200.jpg" src="https://ei.phncdn.com/pics/users/556/280/401/avatar1531072713/(m=ewILGCjadOf)(mh=UOk6JcJ8JK6czNJB)200x200.jpg" loading="lazy" alt="Lela Star" data-img_type="section" data-title="" title="">
		</a>
		<div class="thumbnail-info-wrapper">
			<a href="/pornstar/lela-star" class="title">Lela Star</a>
			<span class="videosNumber">225 Videos</span>
			<span class="pstarViews">622M views </span>
		</div>
	</div>
</li>
`;

// UPDATED extraction logic
const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>|<div[^>]+class="[^"]*(?:performerCard|pornstarMiniature|wrap)[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
let match;
let results = [];

while ((match = itemRegex.exec(testHtml)) !== null) {
    const content = match[1] || match[2];

    const linkMatch = /<a[^>]+href="(\/(?:pornstar|model)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(content);
    if (!linkMatch) continue;

    const path = linkMatch[1];
    const nameContent = linkMatch[2];

    // UPDATED: Look for <a class="title">NAME</a> first
    const titleLinkMatch = /<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/.exec(content);
    const specificNameMatch = /class="[^"]*\bname\b[^"]*"[^>]*>([^<]+)</.exec(content);
    const altMatch = /<img[^>]+alt="([^"]*)"/i.exec(content);

    let name = '';
    if (titleLinkMatch) {
        name = titleLinkMatch[1].trim();
    } else if (specificNameMatch) {
        name = specificNameMatch[1].trim();
    } else if (altMatch && altMatch[1] && !/pornstar|model/i.test(altMatch[1])) {
        name = altMatch[1].trim();
    } else {
        name = nameContent.replace(/<[^>]+>/g, '').trim();
    }

    name = name.replace(/Rank:\s*\d+/i, '').trim();

    if (/^\d+$/.test(name) || !name) {
        const betterNameMatch = /<a[^>]+href="[^"]+"[^>]*>([^<0-9][^<]+)<\/a>/.exec(content);
        if (betterNameMatch) name = betterNameMatch[1].trim();
    }

    const imgMatch = /<img[^>]+(?:src|data-image|data-medium-thumb|data-thumb_url)="([^"]+)"/i.exec(content);
    const thumb = imgMatch ? imgMatch[1] : '';

    console.log('---');
    console.log('Path:', path);
    console.log('Name:', name);
    console.log('Thumb:', thumb ? 'Found' : 'Missing');
    console.log('titleLinkMatch:', titleLinkMatch ? titleLinkMatch[1] : 'null');
    console.log('specificNameMatch:', specificNameMatch ? specificNameMatch[1] : 'null');
    console.log('altMatch:', altMatch ? altMatch[1] : 'null');

    if (name && path) {
        results.push({ name, path, thumb });
    }
}

console.log('\n=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));
