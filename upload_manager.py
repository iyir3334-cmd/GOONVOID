import tkinter as tk
from tkinter import filedialog, messagebox
import json
import os
import shutil
import uuid
from datetime import datetime

# CONFIGURATION
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
GALLERY_JSON_PATH = os.path.join(PROJECT_ROOT, 'public', 'gallery.json')
UPLOADS_DIR = os.path.join(PROJECT_ROOT, 'public', 'uploads')
DEFAULT_THUMBNAIL = "/placeholder_thumb.png" # You can add a placeholder image to public/ later

def load_gallery():
    if not os.path.exists(GALLERY_JSON_PATH):
        return []
    try:
        with open(GALLERY_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading gallery: {e}")
        return []

def save_gallery(data):
    with open(GALLERY_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def process_files():
    files = filedialog.askopenfilenames(
        title="Select Videos (Max 500)",
        filetypes=[("Video Files", "*.mp4 *.webm *.ogg *.mov *.m4v")]
    )

    if not files:
        return

    if len(files) > 500:
        messagebox.showerror("Limit Exceeded", f"You selected {len(files)} videos. Max is 500.")
        return

    # Ensure upload directory exists
    if not os.path.exists(UPLOADS_DIR):
        os.makedirs(UPLOADS_DIR)

    existing_data = load_gallery()
    new_entries = []
    
    print(f"Processing {len(files)} files...")

    for file_path in files:
        filename = os.path.basename(file_path)
        # Generate unique ID to prevent overwrites if names clash
        unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
        dest_path = os.path.join(UPLOADS_DIR, unique_name)
        
        # 1. Copy File
        try:
            shutil.copy2(file_path, dest_path)
            print(f"Copied: {filename}")
        except Exception as e:
            print(f"Failed to copy {filename}: {e}")
            continue

        # 2. Create Entry
        entry = {
            "id": str(uuid.uuid4()),
            "title": os.path.splitext(filename)[0].replace('_', ' ').replace('-', ' ').title(),
            "url": f"/uploads/{unique_name}",
            "thumbnail": DEFAULT_THUMBNAIL,
            "date": datetime.now().isoformat(),
            "tags": ["UPLOADED"]
        }
        new_entries.append(entry)

    # 3. Update JSON
    updated_gallery = existing_data + new_entries
    save_gallery(updated_gallery)

    messagebox.showinfo("Success", f"Successfully added {len(new_entries)} videos to the gallery!\n\nIMPORTANT:\n1. Run 'git add .'\n2. Run 'git commit -m \"Upload videos\"'\n3. Run 'git push'")

def main():
    root = tk.Tk()
    root.title("Void Gallery Manager")
    root.geometry("400x200")

    label = tk.Label(root, text="Bulk Upload to Public Gallery", font=("Arial", 14, "bold"))
    label.pack(pady=20)

    btn = tk.Button(root, text="Select Videos & Upload", command=process_files, height=2, width=25, bg="black", fg="white")
    btn.pack(pady=10)

    instruction = tk.Label(root, text="Select up to 500 video files.\nThey will be copied to public/uploads/.", fg="gray")
    instruction.pack(pady=10)

    root.mainloop()

if __name__ == "__main__":
    main()
