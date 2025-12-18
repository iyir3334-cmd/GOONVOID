
export interface LocalVideo {
    id: string;
    title: string;
    type: string;
    date: number;
    blob: Blob;
}

const DB_NAME = 'GoonerVoidDB';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
};

export const saveLocalVideo = async (file: File): Promise<LocalVideo> => {
    const db = await openDB();
    const video: LocalVideo = {
        id: crypto.randomUUID(),
        title: file.name,
        type: file.type,
        date: Date.now(),
        blob: file
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(video);

        request.onsuccess = () => resolve(video);
        request.onerror = () => reject(request.error);
    });
};

export const getLocalVideos = async (): Promise<LocalVideo[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by date descending
            const results = (request.result as LocalVideo[]).sort((a, b) => b.date - a.date);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteLocalVideo = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};
