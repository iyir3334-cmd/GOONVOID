
import urllib.request

url = "https://www.xvideos.com/pornstars/violet-myers"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        html = response.read()
        print(f"Fetched {len(html)} bytes")
        with open("debug_xvideos.html", "wb") as f:
            f.write(html)
except Exception as e:
    print(f"Error: {e}")
