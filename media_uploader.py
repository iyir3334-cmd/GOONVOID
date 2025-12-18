import os
import json
import requests
import mimetypes
from datetime import datetime

# CONFIGURATION
# ------------------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(PROJECT_ROOT, 'public', 'uploads')
GALLERY_JSON = os.path.join(PROJECT_ROOT, 'public', 'gallery.json')

# Max size for Catbox (200MB)
CATBOX_MAX_SIZE = 200 * 1024 * 1024 

def get_file_size(path):
    return os.path.getsize(path)

def upload_to_catbox(file_path):
    """
    Uploads to Catbox.moe
    Pros: Permanent storage
    Cons: Max 200MB per file
    """
    url = "https://catbox.moe/user/api.php"
    filename = os.path.basename(file_path)
    
    try:
        with open(file_path, 'rb') as f:
            payload = {
                'reqtype': 'fileupload',
                'userhash': '' # Optional: Add your userhash if you have a Catbox account
            }
            files = {
                'fileToUpload': (filename, f, mimetypes.guess_type(file_path)[0])
            }
            print(f"  ➜ Uploading to Catbox (Permanent)...")
            response = requests.post(url, data=payload, files=files)
            
            if response.status_code == 200:
                # Catbox returns the raw URL in the body
                return response.text.strip()
            else:
                print(f"  ✗ Catbox Upload Failed: {response.text}")
                return None
    except Exception as e:
        print(f"  ✗ Catbox Error: {e}")
        return None

def upload_to_transfer_sh(file_path):
    """
    Uploads to Transfer.sh
    Pros: Large file support
    Cons: Files expire in 14 days
    """
    filename = os.path.basename(file_path)
    url = f"https://transfer.sh/{filename}"
    
    try:
        with open(file_path, 'rb') as f:
            print(f"  ➜ Uploading to Transfer.sh (14 Day Retention)...")
            response = requests.put(url, data=f)
            
            if response.status_code == 200:
                return response.text.strip()
            else:
                print(f"  ✗ Transfer.sh Upload Failed: {response.text}")
                return None
    except Exception as e:
        print(f"  ✗ Transfer.sh Error: {e}")
        return None

def main():
    print("=" * 60)
    print("Universal Video Uploader")
    print("Auto-selects best host based on file size.")
    print("=" * 60)
    
    if not os.path.exists(GALLERY_JSON):
        print("gallery.json not found!")
        return

    with open(GALLERY_JSON, 'r', encoding='utf-8') as f:
        gallery = json.load(f)
    
    # 1. Find local videos
    videos_to_upload = []
    for entry in gallery:
        if entry.get('url', '').startswith('/uploads/'):
            local_filename = entry['url'].replace('/uploads/', '')
            local_path = os.path.join(UPLOADS_DIR, local_filename)
            if os.path.exists(local_path):
                videos_to_upload.append({
                    'entry': entry,
                    'path': local_path
                })
    
    if not videos_to_upload:
        print("No local videos found in gallery.json to upload.")
        return

    print(f"Found {len(videos_to_upload)} videos to upload.\n")
    
    uploaded_count = 0
    failed_count = 0
    
    # 2. Upload loop
    for i, item in enumerate(videos_to_upload, 1):
        path = item['path']
        entry = item['entry']
        filename = os.path.basename(path)
        size = get_file_size(path)
        size_mb = size / (1024 * 1024)
        
        print(f"[{i}/{len(videos_to_upload)}] {filename} ({size_mb:.2f} MB)")
        
        direct_link = None
        
        # Strategy: Try Catbox first (Permanent), then Transfer.sh (Temp)
        if size <= CATBOX_MAX_SIZE:
            direct_link = upload_to_catbox(path)
            if not direct_link:
                print("  ! Falling back to Transfer.sh...")
                direct_link = upload_to_transfer_sh(path)
        else:
            print(f"  ! File too large for Catbox (>200MB). Using Transfer.sh.")
            direct_link = upload_to_transfer_sh(path)
            
        if direct_link:
            print(f"  ✓ Success: {direct_link}")
            entry['url'] = direct_link
            uploaded_count += 1
        else:
            print("  ✗ All upload methods failed.")
            failed_count += 1
        print("-" * 40)

    # 3. Save changes
    if uploaded_count > 0:
        with open(GALLERY_JSON, 'w', encoding='utf-8') as f:
            json.dump(gallery, f, indent=2)
        print(f"\nGallery updated with {uploaded_count} remote links.")
        print("You can now safely `git push` without large files.")
    
    # 4. Cleanup prompt
    if uploaded_count > 0:
        resp = input("\nDelete uploaded local files to free space? (y/n): ")
        if resp.lower().startswith('y'):
            for item in videos_to_upload:
                if item['entry']['url'].startswith('http'): # Verify it was uploaded
                    try:
                        os.remove(item['path'])
                        print(f"Deleted: {os.path.basename(item['path'])}")
                    except:
                        pass
            print("Cleanup complete.")

if __name__ == "__main__":
    main()
